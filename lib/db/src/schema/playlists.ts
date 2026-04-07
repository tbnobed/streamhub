import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const playlistsTable = pgTable("playlists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  channelId: integer("channel_id"),
  loop: boolean("loop").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const playlistItemsTable = pgTable("playlist_items", {
  id: serial("id").primaryKey(),
  playlistId: integer("playlist_id").notNull(),
  assetId: integer("asset_id").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPlaylistSchema = createInsertSchema(playlistsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlaylist = z.infer<typeof insertPlaylistSchema>;
export type Playlist = typeof playlistsTable.$inferSelect;

export const insertPlaylistItemSchema = createInsertSchema(playlistItemsTable).omit({ id: true, createdAt: true });
export type InsertPlaylistItem = z.infer<typeof insertPlaylistItemSchema>;
export type PlaylistItem = typeof playlistItemsTable.$inferSelect;
