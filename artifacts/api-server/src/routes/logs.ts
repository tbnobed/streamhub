import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { auditLogsTable, workerEventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { ListAuditLogsQueryParams, ListWorkerEventsQueryParams } from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../lib/authMiddleware";

const router: IRouter = Router();

router.get("/logs/audit", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = ListAuditLogsQueryParams.safeParse(req.query);

  let logs = await db
    .select()
    .from(auditLogsTable)
    .orderBy(desc(auditLogsTable.createdAt));

  if (params.success) {
    if (params.data.userId != null) {
      logs = logs.filter((l) => l.userId === params.data.userId);
    }
    if (params.data.limit != null) {
      logs = logs.slice(0, params.data.limit);
    }
  }

  res.json(logs);
});

router.get("/logs/worker-events", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = ListWorkerEventsQueryParams.safeParse(req.query);

  let events = await db
    .select()
    .from(workerEventsTable)
    .orderBy(desc(workerEventsTable.createdAt));

  if (params.success) {
    if (params.data.channelId != null) {
      events = events.filter((e) => e.channelId === params.data.channelId);
    }
    if (params.data.limit != null) {
      events = events.slice(0, params.data.limit);
    }
  }

  res.json(events);
});

export default router;
