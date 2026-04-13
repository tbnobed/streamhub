import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const liveInputsTable = pgTable("live_inputs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  channelId: integer("channel_id"),
  protocol: text("protocol").notNull().default("rtmp"),
  streamKey: text("stream_key").notNull(),
  ingestUrl: text("ingest_url").notNull(),
  status: text("status").notNull().default("idle"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  currentBitrate: integer("current_bitrate"),
  currentResolution: text("current_resolution"),
  reconnectCount: integer("reconnect_count").notNull().default(0),
  tenantId: integer("tenant_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLiveInputSchema = createInsertSchema(liveInputsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLiveInput = z.infer<typeof insertLiveInputSchema>;
export type LiveInput = typeof liveInputsTable.$inferSelect;
