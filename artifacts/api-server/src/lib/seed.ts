import { db } from "@workspace/db";
import {
  usersTable,
  assetsTable,
  channelsTable,
  playlistsTable,
  playlistItemsTable,
  liveInputsTable,
  destinationsTable,
  auditLogsTable,
} from "@workspace/db";
import crypto from "node:crypto";
import { logger } from "./logger";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + (process.env.SESSION_SECRET ?? "dev-secret")).digest("hex");
}

export async function seedIfEmpty(): Promise<void> {
  const users = await db.select().from(usersTable);
  if (users.length > 0) return;

  logger.info("Seeding initial data...");

  const [admin] = await db.insert(usersTable).values({
    username: "admin",
    email: "admin@playout.local",
    passwordHash: hashPassword("admin123"),
    role: "admin",
    isActive: true,
  }).returning();

  await db.insert(usersTable).values({
    username: "operator",
    email: "operator@playout.local",
    passwordHash: hashPassword("operator123"),
    role: "operator",
    isActive: true,
  });

  const [asset1] = await db.insert(assetsTable).values({
    name: "Demo Slate - 1080p",
    filename: "demo_slate_1080p.mp4",
    filePath: "/media/assets/demo_slate_1080p.mp4",
    fileSize: 52428800,
    mimeType: "video/mp4",
    duration: 30,
    width: 1920,
    height: 1080,
    codec: "h264",
    audioCodec: "aac",
    bitrate: 4000000,
    status: "ready",
    userId: admin!.id,
  }).returning();

  const [asset2] = await db.insert(assetsTable).values({
    name: "Bumper - Main Brand",
    filename: "bumper_main.mp4",
    filePath: "/media/assets/bumper_main.mp4",
    fileSize: 15728640,
    mimeType: "video/mp4",
    duration: 10,
    width: 1920,
    height: 1080,
    codec: "h264",
    audioCodec: "aac",
    bitrate: 6000000,
    status: "ready",
    userId: admin!.id,
  }).returning();

  const [asset3] = await db.insert(assetsTable).values({
    name: "Test Card - Color Bars",
    filename: "color_bars.mp4",
    filePath: "/media/assets/color_bars.mp4",
    fileSize: 8388608,
    mimeType: "video/mp4",
    duration: 60,
    width: 1920,
    height: 1080,
    codec: "h264",
    audioCodec: "aac",
    bitrate: 2000000,
    status: "ready",
    userId: admin!.id,
  }).returning();

  const [playlist] = await db.insert(playlistsTable).values({
    name: "Main Loop Playlist",
    description: "Primary broadcast loop",
    loop: true,
  }).returning();

  await db.insert(playlistItemsTable).values([
    { playlistId: playlist!.id, assetId: asset1!.id, position: 0 },
    { playlistId: playlist!.id, assetId: asset2!.id, position: 1 },
    { playlistId: playlist!.id, assetId: asset3!.id, position: 2 },
  ]);

  const [channel] = await db.insert(channelsTable).values({
    name: "Main Channel",
    description: "Primary broadcast channel",
    status: "idle",
    sourceMode: "playlist",
    activePlaylistId: playlist!.id,
    loopPlaylist: true,
    userId: admin!.id,
  }).returning();

  const seedStreamKey = crypto.randomBytes(16).toString("hex");
  const ingestHost = process.env.INGEST_HOST ?? "ingest.yourdomain.com";
  await db.insert(liveInputsTable).values({
    name: "Studio A - RTMP",
    channelId: channel!.id,
    protocol: "rtmp",
    streamKey: seedStreamKey,
    ingestUrl: `rtmp://${ingestHost}/live/${seedStreamKey}`,
    status: "idle",
    reconnectCount: 0,
  });

  await db.insert(destinationsTable).values({
    name: "YouTube Main",
    channelId: channel!.id,
    platform: "youtube",
    streamUrl: "rtmp://a.rtmp.youtube.com/live2",
    streamKey: "xxxx-xxxx-xxxx-xxxx",
    isActive: true,
    status: "idle",
  });

  await db.insert(auditLogsTable).values({
    userId: admin!.id,
    username: "admin",
    action: "system_initialized",
    resourceType: "system",
    details: { message: "Initial seed completed" },
  });

  logger.info("Seed complete");
}
