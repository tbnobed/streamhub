import { Router, type IRouter } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { db } from "@workspace/db";
import { LocalStorageService } from "../lib/objectStorage";
import {
  channelsTable,
  playlistsTable,
  playlistItemsTable,
  liveInputsTable,
  destinationsTable,
  playoutJobsTable,
  workerNodesTable,
  assetsTable,
  streamSessionsTable,
  auditLogsTable,
} from "@workspace/db";
import { eq, count, and, asc, desc } from "drizzle-orm";
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

  const [activeAsset] = channel.activeAssetId
    ? await db.select().from(assetsTable).where(eq(assetsTable.id, channel.activeAssetId!))
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
        bitrate: job.bitrate,
        fps: job.fps ? Number(job.fps) : null,
        destinationHealth: job.destinationHealth,
        errorMessage: job.errorMessage,
      };
    }
  }
  if (!activeJob && (channel.status === "error" || channel.status === "on_air")) {
    const [lastJob] = await db.select().from(playoutJobsTable)
      .where(and(
        eq(playoutJobsTable.channelId, channel.id),
        eq(playoutJobsTable.status, "failed"),
      ))
      .orderBy(desc(playoutJobsTable.stoppedAt))
      .limit(1);
    if (lastJob) {
      activeJob = {
        id: lastJob.id,
        status: lastJob.status,
        sourceMode: lastJob.sourceMode,
        sourceRef: lastJob.sourceRef,
        workerId: lastJob.workerId,
        ffmpegCommand: lastJob.ffmpegCommand,
        destinations: lastJob.destinations,
        startedAt: lastJob.startedAt,
        stoppedAt: lastJob.stoppedAt,
        bitrate: null,
        fps: null,
        destinationHealth: lastJob.destinationHealth,
        errorMessage: lastJob.errorMessage,
      };
      if (channel.status === "on_air") {
        await db.update(channelsTable)
          .set({ status: "error", activeJobId: null })
          .where(eq(channelsTable.id, channel.id));
        channel.status = "error";
      }
    }
  }

  res.json({
    ...channel,
    playlist: playlist ?? undefined,
    liveInput: liveInput ?? undefined,
    activeAsset: activeAsset ? { id: activeAsset.id, name: activeAsset.name, filename: activeAsset.filename, mimeType: activeAsset.mimeType } : undefined,
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
  if (parsed.data.scheduleEnabled != null) updates.scheduleEnabled = parsed.data.scheduleEnabled;
  if (parsed.data.scheduleTimezone != null) updates.scheduleTimezone = parsed.data.scheduleTimezone;
  if (parsed.data.scheduleStartTime !== undefined) updates.scheduleStartTime = parsed.data.scheduleStartTime;
  if (parsed.data.scheduleStopTime !== undefined) updates.scheduleStopTime = parsed.data.scheduleStopTime;
  if (parsed.data.scheduleDays !== undefined) updates.scheduleDays = parsed.data.scheduleDays;

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
    const playlistItems = await db
      .select({
        assetFilePath: assetsTable.filePath,
      })
      .from(playlistItemsTable)
      .leftJoin(assetsTable, eq(playlistItemsTable.assetId, assetsTable.id))
      .where(eq(playlistItemsTable.playlistId, channel.activePlaylistId))
      .orderBy(asc(playlistItemsTable.position));

    const rawPaths = playlistItems
      .map((item) => item.assetFilePath)
      .filter((fp): fp is string => !!fp);

    if (rawPaths.length === 0) {
      res.status(400).json({ error: "Playlist has no assets with valid file paths. Add media files to the playlist first." });
      return;
    }

    const storageService = new LocalStorageService();
    const filePaths: string[] = [];
    for (const fp of rawPaths) {
      if (fp.startsWith("/api/storage/objects/")) {
        const objectPath = fp.replace("/api/storage", "");
        const absPath = storageService.getAbsolutePath(objectPath);
        filePaths.push(absPath);
      } else {
        filePaths.push(fp);
      }
    }

    sourceRef = filePaths.join(",");
  } else if (channel.sourceMode === "single_asset" && channel.activeAssetId) {
    const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, channel.activeAssetId));
    if (!asset || !asset.filePath) {
      res.status(400).json({ error: "Selected asset not found or has no file path." });
      return;
    }
    let fp = asset.filePath;
    if (fp.startsWith("/api/storage/objects/")) {
      const storageService2 = new LocalStorageService();
      fp = storageService2.getAbsolutePath(fp.replace("/api/storage", ""));
    }
    sourceRef = fp;
  } else if (channel.sourceMode === "fallback") {
    sourceRef = "fallback:slate";
  } else {
    res.status(400).json({ error: "No source configured. Set a live input, playlist, or asset first." });
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
    "ffmpeg", "-hide_banner", "-loglevel", "info", "-stats", "-re",
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

router.post("/channels/:id/destinations/:destId/stop", async (req, res): Promise<void> => {
  const channelId = Number(req.params.id);
  const destId = req.params.destId;
  if (!channelId || !destId) {
    res.status(400).json({ error: "Invalid channel or destination ID" });
    return;
  }

  const [channel] = await db.select().from(channelsTable).where(eq(channelsTable.id, channelId));
  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  if (!channel.activeJobId) {
    res.status(400).json({ error: "No active job" });
    return;
  }

  const [job] = await db.select().from(playoutJobsTable).where(eq(playoutJobsTable.id, channel.activeJobId));
  if (!job) {
    res.status(404).json({ error: "Active job not found" });
    return;
  }

  const cmds = (job.destinationCommands as Record<string, { action: string }>) ?? {};
  cmds[destId] = { action: "stop" };

  await db.update(playoutJobsTable)
    .set({ destinationCommands: cmds })
    .where(eq(playoutJobsTable.id, job.id));

  await db.insert(auditLogsTable).values({
    action: "destination_stopped",
    resourceType: "channel",
    resourceId: channelId,
    details: { channelName: channel.name, destId, jobId: job.id },
  });

  res.json({ ok: true, destId, action: "stop" });
});

router.post("/channels/:id/destinations/:destId/restart", async (req, res): Promise<void> => {
  const channelId = Number(req.params.id);
  const destId = req.params.destId;
  if (!channelId || !destId) {
    res.status(400).json({ error: "Invalid channel or destination ID" });
    return;
  }

  const [channel] = await db.select().from(channelsTable).where(eq(channelsTable.id, channelId));
  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  if (!channel.activeJobId) {
    res.status(400).json({ error: "No active job" });
    return;
  }

  const [job] = await db.select().from(playoutJobsTable).where(eq(playoutJobsTable.id, channel.activeJobId));
  if (!job) {
    res.status(404).json({ error: "Active job not found" });
    return;
  }

  const cmds = (job.destinationCommands as Record<string, { action: string }>) ?? {};
  cmds[destId] = { action: "restart" };

  await db.update(playoutJobsTable)
    .set({ destinationCommands: cmds })
    .where(eq(playoutJobsTable.id, job.id));

  await db.insert(auditLogsTable).values({
    action: "destination_restarted",
    resourceType: "channel",
    resourceId: channelId,
    details: { channelName: channel.name, destId, jobId: job.id },
  });

  res.json({ ok: true, destId, action: "restart" });
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
  if (parsed.data.assetId !== undefined) updates.activeAssetId = parsed.data.assetId;

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

router.get("/channels/:id/preview/:file", (req, res) => {
  const channelId = req.params.id;
  const file = req.params.file;

  if (!/^[\w.-]+$/.test(file)) {
    return res.status(400).json({ error: "Invalid filename" });
  }

  const previewDir = `/tmp/preview/channel-${channelId}`;
  const filePath = path.join(previewDir, file);

  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "Preview not available" });
  }

  const ext = path.extname(file).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".m3u8": "application/vnd.apple.mpegurl",
    ".ts": "video/mp2t",
  };

  res.set({
    "Content-Type": mimeTypes[ext] ?? "application/octet-stream",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Access-Control-Allow-Origin": "*",
  });

  res.sendFile(filePath);
});

export default router;
