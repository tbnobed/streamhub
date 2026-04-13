import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const destinationsTable = pgTable("destinations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  channelId: integer("channel_id"),
  platform: text("platform").notNull().default("rtmp"),
  streamUrl: text("stream_url").notNull(),
  streamKey: text("stream_key").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  youtubeAccountId: integer("youtube_account_id"),
  youtubeBroadcastId: integer("youtube_broadcast_id"),
  status: text("status").notNull().default("idle"),
  tenantId: integer("tenant_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDestinationSchema = createInsertSchema(destinationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDestination = z.infer<typeof insertDestinationSchema>;
export type Destination = typeof destinationsTable.$inferSelect;
