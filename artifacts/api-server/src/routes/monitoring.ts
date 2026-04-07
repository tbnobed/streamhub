import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  channelsTable,
  destinationsTable,
  playoutJobsTable,
  workerEventsTable,
  streamSessionsTable,
  workerNodesTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { ListStreamSessionsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/monitoring/stream-health", async (_req, res): Promise<void> => {
  const channels = await db.select().from(channelsTable);
  const destinations = await db.select().from(destinationsTable);
  const jobs = await db.select().from(playoutJobsTable);
  const workers = await db.select().from(workerNodesTable);

  const health = channels.map((channel) => {
    const channelDests = destinations.filter((d) => d.channelId === channel.id);
    const activeJob = jobs.find((j) => j.channelId === channel.id && j.status === "running");
    const worker = activeJob?.workerId
      ? workers.find((w) => w.workerId === activeJob.workerId)
      : null;

    return {
      channelId: channel.id,
      channelName: channel.name,
      status: channel.status,
      sourceMode: channel.sourceMode,
      bitrate: activeJob?.bitrate ?? null,
      fps: activeJob?.fps ? parseFloat(activeJob.fps) : null,
      uptime: activeJob?.startedAt
        ? Math.floor((Date.now() - activeJob.startedAt.getTime()) / 1000)
        : null,
      reconnectCount: 0,
      errorCount: 0,
      lastError: activeJob?.errorMessage ?? null,
      destinationStatuses: channelDests.map((d) => ({
        id: d.id,
        name: d.name,
        platform: d.platform,
        status: d.status,
        isActive: d.isActive,
      })),
      workerHeartbeat: worker?.lastHeartbeatAt ?? null,
    };
  });

  res.json(health);
});

router.get("/monitoring/sessions", async (req, res): Promise<void> => {
  const params = ListStreamSessionsQueryParams.safeParse(req.query);

  let sessions = await db
    .select()
    .from(streamSessionsTable)
    .orderBy(desc(streamSessionsTable.startedAt));

  if (params.success) {
    if (params.data.channelId != null) {
      sessions = sessions.filter((s) => s.channelId === params.data.channelId);
    }
    if (params.data.limit != null) {
      sessions = sessions.slice(0, params.data.limit);
    }
  }

  res.json(sessions);
});

export default router;
