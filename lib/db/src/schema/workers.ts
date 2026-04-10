import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workerNodesTable = pgTable("worker_nodes", {
  id: serial("id").primaryKey(),
  workerId: text("worker_id").notNull().unique(),
  hostname: text("hostname").notNull(),
  status: text("status").notNull().default("online"),
  activeJobs: integer("active_jobs").notNull().default(0),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  version: text("version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playoutJobsTable = pgTable("playout_jobs", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull(),
  workerId: text("worker_id"),
  status: text("status").notNull().default("pending"),
  sourceMode: text("source_mode").notNull().default("playlist"),
  sourceRef: text("source_ref"),
  destinations: jsonb("destinations").notNull().default([]),
  ffmpegCommand: text("ffmpeg_command"),
  pid: integer("pid"),
  errorMessage: text("error_message"),
  bitrate: integer("bitrate"),
  fps: text("fps"),
  destinationHealth: jsonb("destination_health"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const workerEventsTable = pgTable("worker_events", {
  id: serial("id").primaryKey(),
  workerId: text("worker_id").notNull(),
  channelId: integer("channel_id"),
  jobId: integer("job_id"),
  eventType: text("event_type").notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWorkerNodeSchema = createInsertSchema(workerNodesTable).omit({ id: true, createdAt: true });
export type InsertWorkerNode = z.infer<typeof insertWorkerNodeSchema>;
export type WorkerNode = typeof workerNodesTable.$inferSelect;

export const insertPlayoutJobSchema = createInsertSchema(playoutJobsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlayoutJob = z.infer<typeof insertPlayoutJobSchema>;
export type PlayoutJob = typeof playoutJobsTable.$inferSelect;
