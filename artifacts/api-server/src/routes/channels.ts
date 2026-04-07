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

  res.json({
    ...channel,
    playlist: playlist ?? undefined,
    liveInput: liveInput ?? undefined,
    destinations,
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

  const [channel] = await db
    .update(channelsTable)
    .set({ status: "on_air" })
    .where(eq(channelsTable.id, params.data.id))
    .returning();

  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

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
    details: { channelName: channel.name },
  });

  res.json(channel);
});

router.post("/channels/:id/stop", async (req, res): Promise<void> => {
  const params = StopChannelParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [channel] = await db
    .update(channelsTable)
    .set({ status: "idle" })
    .where(eq(channelsTable.id, params.data.id))
    .returning();

  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  await db.insert(auditLogsTable).values({
    action: "channel_stopped",
    resourceType: "channel",
    resourceId: channel.id,
    details: { channelName: channel.name },
  });

  res.json(channel);
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
