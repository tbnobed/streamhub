import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { workerNodesTable, playoutJobsTable, workerEventsTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import {
  WorkerHeartbeatBody,
  FetchWorkerJobsQueryParams,
  UpdateJobStatusParams,
  UpdateJobStatusBody,
  SubmitWorkerEventBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/workers", async (_req, res): Promise<void> => {
  const workers = await db.select().from(workerNodesTable).orderBy(workerNodesTable.createdAt);
  res.json(workers);
});

router.post("/workers/heartbeat", async (req, res): Promise<void> => {
  const parsed = WorkerHeartbeatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { workerId, hostname, activeJobs, version } = parsed.data;

  const existing = await db
    .select()
    .from(workerNodesTable)
    .where(eq(workerNodesTable.workerId, workerId));

  if (existing.length > 0) {
    await db
      .update(workerNodesTable)
      .set({
        hostname,
        activeJobs,
        version: version ?? null,
        status: "online",
        lastHeartbeatAt: new Date(),
      })
      .where(eq(workerNodesTable.workerId, workerId));
  } else {
    await db.insert(workerNodesTable).values({
      workerId,
      hostname,
      activeJobs,
      version: version ?? null,
      status: "online",
      lastHeartbeatAt: new Date(),
    });
  }

  res.json({ ok: true });
});

router.get("/workers/jobs", async (req, res): Promise<void> => {
  const params = FetchWorkerJobsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const pendingJobs = await db
    .select()
    .from(playoutJobsTable)
    .where(
      and(
        eq(playoutJobsTable.status, "pending"),
        isNull(playoutJobsTable.workerId)
      )
    );

  for (const pj of pendingJobs) {
    await db.update(playoutJobsTable)
      .set({ workerId: params.data.workerId, status: "running" })
      .where(eq(playoutJobsTable.id, pj.id));
  }

  const jobs = await db
    .select()
    .from(playoutJobsTable)
    .where(
      and(
        eq(playoutJobsTable.workerId, params.data.workerId),
        eq(playoutJobsTable.status, "running")
      )
    );

  res.json(jobs);
});

router.post("/workers/jobs/:id/status", async (req, res): Promise<void> => {
  const params = UpdateJobStatusParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateJobStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existingJob] = await db.select().from(playoutJobsTable).where(eq(playoutJobsTable.id, params.data.id));
  if (!existingJob) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const terminalStates = ["stopped", "failed", "completed"];
  if (terminalStates.includes(existingJob.status) && parsed.data.status === "running") {
    res.json({ ok: true, ignored: true, reason: "job_already_terminal" });
    return;
  }

  const updates: Record<string, unknown> = {
    status: parsed.data.status,
  };
  if (parsed.data.bitrate != null) updates.bitrate = parsed.data.bitrate;
  if (parsed.data.fps != null) updates.fps = String(parsed.data.fps);
  if (parsed.data.pid != null) updates.pid = parsed.data.pid;
  if (parsed.data.errorMessage != null) updates.errorMessage = parsed.data.errorMessage;

  if (parsed.data.status === "running" && !existingJob.startedAt) updates.startedAt = new Date();
  if (["stopped", "failed", "completed"].includes(parsed.data.status)) updates.stoppedAt = new Date();

  await db
    .update(playoutJobsTable)
    .set(updates)
    .where(eq(playoutJobsTable.id, params.data.id));

  res.json({ ok: true });
});

router.post("/workers/events", async (req, res): Promise<void> => {
  const parsed = SubmitWorkerEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db.insert(workerEventsTable).values({
    workerId: parsed.data.workerId,
    channelId: parsed.data.channelId ?? null,
    jobId: parsed.data.jobId ?? null,
    eventType: parsed.data.eventType,
    message: parsed.data.message,
    metadata: parsed.data.metadata ?? null,
  });

  res.status(201).json({ ok: true });
});

export default router;
