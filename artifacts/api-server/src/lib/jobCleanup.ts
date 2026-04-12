import { db } from "@workspace/db";
import { playoutJobsTable, channelsTable, workerNodesTable } from "@workspace/db";
import { eq, inArray, lt, and } from "drizzle-orm";
import { logger } from "./logger";

const WORKER_HEARTBEAT_TIMEOUT_MS = 60_000;

export async function cleanupStaleJobs(): Promise<void> {
  try {
    const staleJobs = await db.select({ id: playoutJobsTable.id, channelId: playoutJobsTable.channelId })
      .from(playoutJobsTable)
      .where(inArray(playoutJobsTable.status, ["running", "pending"]));

    if (staleJobs.length === 0) {
      logger.info("Startup cleanup: no stale jobs found");
      return;
    }

    const jobIds = staleJobs.map(j => j.id);
    const channelIds = [...new Set(staleJobs.map(j => j.channelId).filter(Boolean))] as number[];

    await db.update(playoutJobsTable)
      .set({ status: "failed", errorMessage: "Server restarted", stoppedAt: new Date() })
      .where(inArray(playoutJobsTable.id, jobIds));

    for (const chId of channelIds) {
      await db.update(channelsTable)
        .set({ status: "idle", activeJobId: null })
        .where(eq(channelsTable.id, chId));
    }

    await db.update(workerNodesTable)
      .set({ status: "offline" })
      .where(eq(workerNodesTable.status, "online"));

    logger.info({ jobCount: staleJobs.length, channelCount: channelIds.length }, "Startup cleanup: reset stale jobs and channels");
  } catch (err) {
    logger.error({ err }, "Startup cleanup failed");
  }
}

export async function reapStaleWorkerJobs(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - WORKER_HEARTBEAT_TIMEOUT_MS);

    const staleWorkers = await db.select({ workerId: workerNodesTable.workerId })
      .from(workerNodesTable)
      .where(
        and(
          eq(workerNodesTable.status, "online"),
          lt(workerNodesTable.lastHeartbeatAt, cutoff),
        )
      );

    if (staleWorkers.length === 0) return;

    for (const worker of staleWorkers) {
      const orphanedJobs = await db.select({ id: playoutJobsTable.id, channelId: playoutJobsTable.channelId })
        .from(playoutJobsTable)
        .where(
          and(
            eq(playoutJobsTable.workerId, worker.workerId),
            inArray(playoutJobsTable.status, ["running", "pending"]),
          )
        );

      if (orphanedJobs.length > 0) {
        const jobIds = orphanedJobs.map(j => j.id);
        const channelIds = [...new Set(orphanedJobs.map(j => j.channelId).filter(Boolean))] as number[];

        await db.update(playoutJobsTable)
          .set({ status: "failed", errorMessage: "Worker lost (heartbeat timeout)", stoppedAt: new Date() })
          .where(inArray(playoutJobsTable.id, jobIds));

        for (const chId of channelIds) {
          await db.update(channelsTable)
            .set({ status: "error", activeJobId: null })
            .where(eq(channelsTable.id, chId));
        }

        logger.warn({ workerId: worker.workerId, jobCount: orphanedJobs.length }, "Reaped stale worker jobs");
      }

      await db.update(workerNodesTable)
        .set({ status: "offline" })
        .where(eq(workerNodesTable.workerId, worker.workerId));
    }
  } catch (err) {
    logger.error({ err }, "Stale worker reaper failed");
  }
}
