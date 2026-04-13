import { pgTable, serial, integer, boolean, timestamp, text } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const notificationPrefsTable = pgTable("notification_prefs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  onStreamStart: boolean("on_stream_start").notNull().default(true),
  onStreamStop: boolean("on_stream_stop").notNull().default(false),
  onStreamError: boolean("on_stream_error").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const invitesTable = pgTable("invites", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  username: text("username"),
  role: text("role").notNull().default("operator"),
  token: text("token").notNull().unique(),
  invitedBy: integer("invited_by").references(() => usersTable.id),
  accepted: boolean("accepted").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
