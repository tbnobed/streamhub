import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  channelsTable,
  playlistsTable,
  liveInputsTable,
  destinationsTable,
  playoutJobsTable,
  workerNodesTable,
  assetsTable,
  streamSessionsTable,
  auditLogsTable,
} from "@workspace/db";
import { eq, count, and } from "drizzle-orm";
import {
  CreateChannelBody,
  GetChannelParams,
  UpdateChannelParams,
  UpdateChannelBody,
  DeleteChannelParams,
  StartChannelParams,
  StopChannelParams,
  SwitchChannelSourceParams,
  SwitchChannelSourceBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/channels/summary", async (_req, res): Promise<void> => {
  const channels = await db.select().from(channelsTable);
  const destinations = await db.select().from(destinationsTable);
  const workers = await db.select().from(workerNodesTable);
  const assets = await db.select().from(assetsTable);

  const onAirCount = channels.filter((c) => c.status === "on_air").length;
  const idleCount = channels.filter((c) => c.status === "idle").length;
  const errorCount = channels.filter((c) => c.status === "error").length;
  const activeWorkers = workers.filter((w) => {
    if (!w.lastHeartbeatAt) return false;
    const age = Date.now() - w.lastHeartbeatAt.getTime();
    return age < 60000;
  }).length;

  res.json({
    totalChannels: channels.length,
    onAirCount,
    idleCount,
    errorCount,
    totalDestinations: destinations.length,
    activeWorkers,
    totalAssets: assets.length,
  });
});

router.get("/channels", async (_req, res): Promise<void> => {
  const channels = await db.select().from(channelsTable).orderBy(channelsTable.createdAt);
  res.json(channels);
});

router.post("/channels", async (req, res): Promise<void> => {
  const parsed = CreateChannelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [channel] = await db
    .insert(channelsTable)
    .values({ ...parsed.data, status: "idle", sourceMode: "playlist" })
    .returning();

  res.status(201).json(channel);
});

router.get("/channels/:id", async (req, res): Promise<void> => {
  const params = GetChannelParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [channel] = await db
    .select()
    .from(channelsTable)
    .where(eq(channelsTable.id, params.data.id));

  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  const [playlist] = channel.activePlaylistId
    ? await db.select().from(playlistsTable).where(eq(playlistsTable.id, channel.activePlaylistId!))
    : [null];

  const [liveInput] = channel.activeLiveInputId
    ? await db.select().from(liveInputsTable).where(eq(liveInputsTable.id, channel.activeLiveInputId!))
    : [null];

  const destinations = await db
    .select()
    .from(destinationsTable)
    .where(eq(destinationsTable.channelId, params.data.id));

  let activeJob = null;
  if (channel.activeJobId) {
    const [job] = await db.select().from(playoutJobsTable).where(eq(playoutJobsTable.id, channel.activeJobId));
    if (job) {
      activeJob = {
        id: job.id,
        status: job.status,
        sourceMode: job.sourceMode,
        sourceRef: job.sourceRef,
        workerId: job.workerId,
        ffmpegCommand: job.ffmpegCommand,
        destinations: job.destinations,
        startedAt: job.startedAt,
      };
    }
  }

  res.json({
    ...channel,
    playlist: playlist ?? undefined,
    liveInput: liveInput ?? undefined,
    destinations,
    activeJob,
  });
});

router.patch("/channels/:id", async (req, res): Promise<void> => {
  const params = UpdateChannelParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateChannelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name != null) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.activePlaylistId !== undefined) updates.activePlaylistId = parsed.data.activePlaylistId;
  if (parsed.data.activeLiveInputId !== undefined) updates.activeLiveInputId = parsed.data.activeLiveInputId;
  if (parsed.data.fallbackAssetId !== undefined) updates.fallbackAssetId = parsed.data.fallbackAssetId;
  if (parsed.data.loopPlaylist != null) updates.loopPlaylist = parsed.data.loopPlaylist;

  const [channel] = await db
    .update(channelsTable)
    .set(updates)
    .where(eq(channelsTable.id, params.data.id))
    .returning();

  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  res.json(channel);
});

router.delete("/channels/:id", async (req, res): Promise<void> => {
  const params = DeleteChannelParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [channel] = await db
    .delete(channelsTable)
    .where(eq(channelsTable.id, params.data.id))
    .returning();

  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/channels/:id/start", async (req, res): Promise<void> => {
  const params = StartChannelParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [channel] = await db.select().from(channelsTable).where(eq(channelsTable.id, params.data.id));
  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  if (channel.status === "on_air") {
    res.status(409).json({ error: "Channel is already on air. Stop it before starting again." });
    return;
  }

  const activeDests = await db.select().from(destinationsTable)
    .where(and(eq(destinationsTable.channelId, channel.id), eq(destinationsTable.isActive, true)));

  if (activeDests.length === 0) {
    res.status(400).json({ error: "No active destinations assigned to this channel. Add at least one destination before starting." });
    return;
  }

  let sourceRef = "";
  const ingestHost = process.env.INGEST_HOST || "localhost";

  if (channel.sourceMode === "live_input" && channel.activeLiveInputId) {
    const [liveInput] = await db.select().from(liveInputsTable).where(eq(liveInputsTable.id, channel.activeLiveInputId));
    if (liveInput) {
      sourceRef = `rtmp://${ingestHost}/live/${liveInput.streamKey}`;
    } else {
      res.status(400).json({ error: "Active live input not found." });
      return;
    }
  } else if (channel.sourceMode === "playlist" && channel.activePlaylistId) {
    sourceRef = `playlist:${channel.activePlaylistId}`;
  } else if (channel.sourceMode === "fallback") {
    sourceRef = "fallback:slate";
  } else {
    res.status(400).json({ error: "No source configured. Set a live input or playlist first." });
    return;
  }

  const destConfigs = activeDests.map((d) => ({
    id: d.id,
    name: d.name,
    platform: d.platform,
    streamUrl: d.streamUrl,
    streamKey: d.streamKey,
  }));

  const ffmpegOutputArgs = activeDests.flatMap((d) => {
    const rtmpUrl = `${d.streamUrl}/${d.streamKey}`.replace(/\/+$/, "");
    return ["-f", "flv", rtmpUrl];
  });

  const ffmpegCmd = [
    "ffmpeg", "-hide_banner", "-loglevel", "warning", "-re",
    "-i", sourceRef,
    "-c:v", "copy", "-c:a", "copy",
    ...ffmpegOutputArgs,
  ].join(" ");

  const workers = await db.select().from(workerNodesTable).where(eq(workerNodesTable.status, "online"));
  const assignedWorker = workers.length > 0 ? workers[0].workerId : null;

  const [job] = await db.insert(playoutJobsTable).values({
    channelId: channel.id,
    workerId: assignedWorker,
    status: assignedWorker ? "running" : "pending",
    sourceMode: channel.sourceMode,
    sourceRef,
    destinations: destConfigs,
    ffmpegCommand: ffmpegCmd,
    startedAt: new Date(),
  }).returning();

  const [updated] = await db
    .update(channelsTable)
    .set({ status: "on_air", activeJobId: job.id })
    .where(eq(channelsTable.id, channel.id))
    .returning();

  await db.insert(streamSessionsTable).values({
    channelId: channel.id,
    channelName: channel.name,
    sourceMode: channel.sourceMode,
    errorCount: 0,
  });

  await db.insert(auditLogsTable).values({
    action: "channel_started",
    resourceType: "channel",
    resourceId: channel.id,
    details: {
      channelName: channel.name,
      jobId: job.id,
      sourceRef,
      destinationCount: activeDests.length,
      workerAssigned: assignedWorker,
      ffmpegCommand: ffmpegCmd,
    },
  });

  const safeDestConfigs = destConfigs.map(({ streamKey, ...rest }) => rest);

  res.json({
    ...updated,
    job: {
      id: job.id,
      status: job.status,
      sourceRef: job.sourceRef,
      ffmpegCommand: job.ffmpegCommand,
      workerAssigned: assignedWorker,
      destinations: safeDestConfigs,
    },
  });
});

router.post("/channels/:id/stop", async (req, res): Promise<void> => {
  const params = StopChannelParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [channel] = await db.select().from(channelsTable).where(eq(channelsTable.id, params.data.id));
  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  const runningJobs = await db.select().from(playoutJobsTable)
    .where(and(
      eq(playoutJobsTable.channelId, channel.id),
      eq(playoutJobsTable.status, "running"),
    ));

  for (const job of runningJobs) {
    await db.update(playoutJobsTable)
      .set({ status: "stopped", stoppedAt: new Date() })
      .where(eq(playoutJobsTable.id, job.id));
  }

  const pendingJobs = await db.select().from(playoutJobsTable)
    .where(and(
      eq(playoutJobsTable.channelId, channel.id),
      eq(playoutJobsTable.status, "pending"),
    ));

  for (const job of pendingJobs) {
    await db.update(playoutJobsTable)
      .set({ status: "stopped", stoppedAt: new Date() })
      .where(eq(playoutJobsTable.id, job.id));
  }

  const [updated] = await db
    .update(channelsTable)
    .set({ status: "idle", activeJobId: null })
    .where(eq(channelsTable.id, channel.id))
    .returning();

  await db.insert(auditLogsTable).values({
    action: "channel_stopped",
    resourceType: "channel",
    resourceId: channel.id,
    details: { channelName: channel.name, jobsStopped: runningJobs.length + pendingJobs.length },
  });

  res.json(updated);
});

router.post("/channels/:id/switch-source", async (req, res): Promise<void> => {
  const params = SwitchChannelSourceParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SwitchChannelSourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = {
    sourceMode: parsed.data.sourceMode,
  };
  if (parsed.data.liveInputId !== undefined) updates.activeLiveInputId = parsed.data.liveInputId;
  if (parsed.data.playlistId !== undefined) updates.activePlaylistId = parsed.data.playlistId;

  const [channel] = await db
    .update(channelsTable)
    .set(updates)
    .where(eq(channelsTable.id, params.data.id))
    .returning();

  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  await db.insert(auditLogsTable).values({
    action: "source_switched",
    resourceType: "channel",
    resourceId: channel.id,
    details: { sourceMode: parsed.data.sourceMode },
  });

  res.json(channel);
});

export default router;
