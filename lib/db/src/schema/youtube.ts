import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const youtubeAccountsTable = pgTable("youtube_accounts", {
  id: serial("id").primaryKey(),
  channelTitle: text("channel_title").notNull(),
  channelId: text("channel_id").notNull(),
  email: text("email"),
  userId: integer("user_id"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
});

export const youtubeBroadcastsTable = pgTable("youtube_broadcasts", {
  id: serial("id").primaryKey(),
  ytBroadcastId: text("yt_broadcast_id").notNull(),
  ytStreamId: text("yt_stream_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("created"),
  channelId: integer("channel_id"),
  youtubeAccountId: integer("youtube_account_id").notNull(),
  scheduledStart: timestamp("scheduled_start", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertYoutubeAccountSchema = createInsertSchema(youtubeAccountsTable).omit({ id: true, connectedAt: true });
export type InsertYoutubeAccount = z.infer<typeof insertYoutubeAccountSchema>;
export type YoutubeAccount = typeof youtubeAccountsTable.$inferSelect;

export const insertYoutubeBroadcastSchema = createInsertSchema(youtubeBroadcastsTable).omit({ id: true, createdAt: true });
export type InsertYoutubeBroadcast = z.infer<typeof insertYoutubeBroadcastSchema>;
export type YoutubeBroadcast = typeof youtubeBroadcastsTable.$inferSelect;
