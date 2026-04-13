import { db } from "@workspace/db";
import {
  usersTable,
  channelsTable,
  liveInputsTable,
  destinationsTable,
  auditLogsTable,
  tenantsTable,
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

  const existingTenants = await db.select().from(tenantsTable);
  let tenantId: number;
  if (existingTenants.length === 0) {
    const [tenant] = await db.insert(tenantsTable).values({
      name: "Default",
      slug: "default",
    }).returning();
    tenantId = tenant!.id;
  } else {
    tenantId = existingTenants[0]!.id;
  }

  const [admin] = await db.insert(usersTable).values({
    username: "admin",
    email: "admin@playout.local",
    passwordHash: hashPassword("admin123"),
    role: "admin",
    isActive: true,
    tenantId,
  }).returning();

  await db.insert(usersTable).values({
    username: "operator",
    email: "operator@playout.local",
    passwordHash: hashPassword("operator123"),
    role: "operator",
    isActive: true,
    tenantId,
  });

  const [channel] = await db.insert(channelsTable).values({
    name: "Main Channel",
    description: "Primary broadcast channel",
    status: "idle",
    sourceMode: "playlist",
    loopPlaylist: true,
    userId: admin!.id,
    tenantId,
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
    tenantId,
  });

  await db.insert(destinationsTable).values({
    name: "YouTube Main",
    channelId: channel!.id,
    platform: "youtube",
    streamUrl: "rtmp://a.rtmp.youtube.com/live2",
    streamKey: "xxxx-xxxx-xxxx-xxxx",
    isActive: true,
    status: "idle",
    tenantId,
  });

  await db.insert(auditLogsTable).values({
    userId: admin!.id,
    username: "admin",
    action: "system_initialized",
    resourceType: "system",
    details: { message: "Initial seed completed" },
    tenantId,
  });

  logger.info("Seed complete");
}
