import { db } from "@workspace/db";
import {
  usersTable,
  channelsTable,
  liveInputsTable,
  destinationsTable,
  auditLogsTable,
  tenantsTable,
  assetsTable,
  playlistsTable,
  streamSessionsTable,
  notificationPrefsTable,
  invitesTable,
} from "@workspace/db";
import { isNull, eq } from "drizzle-orm";
import crypto from "node:crypto";
import { logger } from "./logger";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + (process.env.SESSION_SECRET ?? "dev-secret")).digest("hex");
}

export async function ensureDefaultTenant(): Promise<void> {
  const existingTenants = await db.select().from(tenantsTable);
  let tenantId: number;

  if (existingTenants.length === 0) {
    const [tenant] = await db.insert(tenantsTable).values({
      name: "Default",
      slug: "default",
    }).returning();
    tenantId = tenant!.id;
    logger.info({ tenantId }, "Created default tenant");
  } else {
    tenantId = existingTenants[0]!.id;
  }

  const tables = [
    { name: "users", table: usersTable },
    { name: "channels", table: channelsTable },
    { name: "assets", table: assetsTable },
    { name: "playlists", table: playlistsTable },
    { name: "live_inputs", table: liveInputsTable },
    { name: "destinations", table: destinationsTable },
    { name: "audit_logs", table: auditLogsTable },
    { name: "stream_sessions", table: streamSessionsTable },
    { name: "notification_prefs", table: notificationPrefsTable },
    { name: "invites", table: invitesTable },
  ] as const;

  let totalUpdated = 0;
  for (const { name, table } of tables) {
    try {
      const rows = await db.select({ id: (table as any).id }).from(table).where(isNull((table as any).tenantId));
      if (rows.length > 0) {
        await db.update(table).set({ tenantId } as any).where(isNull((table as any).tenantId));
        totalUpdated += rows.length;
        logger.info({ table: name, count: rows.length }, "Backfilled tenant_id");
      }
    } catch {
    }
  }

  try {
    const { youtubeAccountsTable, youtubeBroadcastsTable } = await import("@workspace/db");
    if (youtubeAccountsTable) {
      const rows = await db.select({ id: youtubeAccountsTable.id }).from(youtubeAccountsTable).where(isNull(youtubeAccountsTable.tenantId));
      if (rows.length > 0) {
        await db.update(youtubeAccountsTable).set({ tenantId } as any).where(isNull(youtubeAccountsTable.tenantId));
        totalUpdated += rows.length;
      }
    }
    if (youtubeBroadcastsTable) {
      const rows = await db.select({ id: youtubeBroadcastsTable.id }).from(youtubeBroadcastsTable).where(isNull(youtubeBroadcastsTable.tenantId));
      if (rows.length > 0) {
        await db.update(youtubeBroadcastsTable).set({ tenantId } as any).where(isNull(youtubeBroadcastsTable.tenantId));
        totalUpdated += rows.length;
      }
    }
  } catch {
  }

  if (totalUpdated > 0) {
    logger.info({ totalUpdated, tenantId }, "Tenant data migration complete");
  }

  try {
    const existingSupers = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.isSuperAdmin, true));
    if (existingSupers.length === 0) {
      const [adminUser] = await db.select().from(usersTable).where(eq(usersTable.username, "admin"));
      if (adminUser) {
        await db.update(usersTable).set({ isSuperAdmin: true }).where(eq(usersTable.id, adminUser.id));
        logger.info({ userId: adminUser.id }, "Promoted default admin to super admin");
      }
    }
  } catch (err) {
    logger.warn({ err }, "Failed to ensure super admin");
  }
}

export async function seedIfEmpty(): Promise<void> {
  const users = await db.select().from(usersTable);
  if (users.length > 0) return;

  logger.info("Seeding initial data...");

  const tenants = await db.select().from(tenantsTable);
  const tenantId = tenants[0]!.id;

  const [admin] = await db.insert(usersTable).values({
    username: "admin",
    email: "admin@playout.local",
    passwordHash: hashPassword("admin123"),
    role: "admin",
    isActive: true,
    isSuperAdmin: true,
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
