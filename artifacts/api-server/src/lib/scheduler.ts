import { db } from "@workspace/db";
import {
  channelsTable,
  destinationsTable,
  playoutJobsTable,
  workerNodesTable,
  liveInputsTable,
  playlistItemsTable,
  assetsTable,
  streamSessionsTable,
  auditLogsTable,
} from "@workspace/db";
import { eq, and, asc, desc, inArray, gte } from "drizzle-orm";
import { logger } from "./logger";
import { LocalStorageService } from "./objectStorage";
import { reapStaleWorkerJobs } from "./jobCleanup";

const RESTART_COOLDOWN_MS = 5 * 60 * 1000;
const RECOVERY_COOLDOWN_MS = 30_000;
const MAX_CONSECUTIVE_FAILURES = 5;

function getTimeInTimezone(timezone: string): { hours: number; minutes: number; dayOfWeek: number } {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
      weekday: "short",
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10);
    const minute = parseInt(parts.find(p => p.type === "minute")?.value ?? "0", 10);
    const weekdayStr = parts.find(p => p.type === "weekday")?.value ?? "Mon";
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dayOfWeek = dayMap[weekdayStr] ?? 1;
    return { hours: hour, minutes: minute, dayOfWeek };
  } catch {
    const now = new Date();
    return { hours: now.getUTCHours(), minutes: now.getUTCMinutes(), dayOfWeek: now.getUTCDay() };
  }
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

async function getRecentFailureCount(channelId: number): Promise<number> {
  const windowStart = new Date(Date.now() - 30 * 60 * 1000);
  const recentJobs = await db.select({ status: playoutJobsTable.status, stoppedAt: playoutJobsTable.stoppedAt })
    .from(playoutJobsTable)
    .where(and(
      eq(playoutJobsTable.channelId, channelId),
      inArray(playoutJobsTable.status, ["failed", "stopped", "completed"]),
      gte(playoutJobsTable.stoppedAt, windowStart),
    ))
    .orderBy(desc(playoutJobsTable.stoppedAt))
    .limit(MAX_CONSECUTIVE_FAILURES + 1);

  let consecutiveFails = 0;
  for (const j of recentJobs) {
    if (j.status === "failed") consecutiveFails++;
    else break;
  }
  return consecutiveFails;
}

async function startChannel(channelId: number, opts?: { isRecovery?: boolean }): Promise<void> {
  const [channel] = await db.select().from(channelsTable).where(eq(channelsTable.id, channelId));
  if (!channel || channel.status === "on_air" || channel.status === "starting") return;

  const isRecovery = opts?.isRecovery ?? false;
  const cooldownMs = isRecovery ? RECOVERY_COOLDOWN_MS : RESTART_COOLDOWN_MS;

  const [lastFailedJob] = await db.select({ stoppedAt: playoutJobsTable.stoppedAt })
    .from(playoutJobsTable)
    .where(and(eq(playoutJobsTable.channelId, channelId), eq(playoutJobsTable.status, "failed")))
    .orderBy(desc(playoutJobsTable.stoppedAt))
    .limit(1);

  if (lastFailedJob?.stoppedAt) {
    const elapsed = Date.now() - new Date(lastFailedJob.stoppedAt).getTime();
    if (elapsed < cooldownMs) {
      logger.info({ channelId, cooldownRemaining: Math.round((cooldownMs - elapsed) / 1000), isRecovery },
        "Scheduler: skipping start, cooldown active");
      return;
    }
  }

  if (isRecovery) {
    const consecutiveFails = await getRecentFailureCount(channelId);
    if (consecutiveFails >= MAX_CONSECUTIVE_FAILURES) {
      logger.warn({ channelId, consecutiveFails },
        "Scheduler: auto-recovery disabled, too many consecutive failures");
      return;
    }
  }

  const activeDests = await db.select().from(destinationsTable)
    .where(and(eq(destinationsTable.channelId, channel.id), eq(destinationsTable.isActive, true)));

  if (activeDests.length === 0) {
    logger.warn({ channelId }, "Scheduler: cannot start channel, no active destinations");
    return;
  }

  let sourceRef = "";
  const ingestHost = process.env.INGEST_HOST || "localhost";

  if (channel.sourceMode === "live_input" && channel.activeLiveInputId) {
    const [liveInput] = await db.select().from(liveInputsTable).where(eq(liveInputsTable.id, channel.activeLiveInputId));
    if (!liveInput) {
      logger.warn({ channelId, liveInputId: channel.activeLiveInputId }, "Scheduler: cannot start channel, live input not found");
      return;
    }
    sourceRef = `rtmp://${ingestHost}/live/${liveInput.streamKey}`;
  } else if (channel.sourceMode === "playlist" && channel.activePlaylistId) {
    const playlistItems = await db
      .select({ assetFilePath: assetsTable.filePath })
      .from(playlistItemsTable)
      .leftJoin(assetsTable, eq(playlistItemsTable.assetId, assetsTable.id))
      .where(eq(playlistItemsTable.playlistId, channel.activePlaylistId))
      .orderBy(asc(playlistItemsTable.position));

    const rawPaths = playlistItems.map(item => item.assetFilePath).filter((fp): fp is string => !!fp);
    if (rawPaths.length === 0) {
      logger.warn({ channelId, playlistId: channel.activePlaylistId }, "Scheduler: cannot start channel, playlist has no valid assets");
      return;
    }

    const storageService = new LocalStorageService();
    const filePaths: string[] = [];
    for (const fp of rawPaths) {
      if (fp.startsWith("/api/storage/objects/")) {
        const objectPath = fp.replace("/api/storage", "");
        filePaths.push(storageService.getAbsolutePath(objectPath));
      } else {
        filePaths.push(fp);
      }
    }
    sourceRef = filePaths.join(",");
  } else if (channel.sourceMode === "single_asset" && channel.activeAssetId) {
    const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, channel.activeAssetId));
    if (!asset || !asset.filePath) {
      logger.warn({ channelId, assetId: channel.activeAssetId }, "Scheduler: cannot start channel, asset not found");
      return;
    }
    let fp = asset.filePath;
    if (fp.startsWith("/api/storage/objects/")) {
      const storageService2 = new LocalStorageService();
      fp = storageService2.getAbsolutePath(fp.replace("/api/storage", ""));
    }
    sourceRef = fp;
  } else if (channel.sourceMode === "fallback") {
    sourceRef = "fallback:slate";
  } else {
    logger.warn({ channelId }, "Scheduler: no source configured");
    return;
  }

  const destConfigs = activeDests.map(d => ({
    id: d.id, name: d.name, platform: d.platform,
    streamUrl: d.streamUrl, streamKey: d.streamKey,
  }));

  const ffmpegOutputArgs = activeDests.flatMap(d => {
    const rtmpUrl = `${d.streamUrl}/${d.streamKey}`.replace(/\/+$/, "");
    return ["-f", "flv", rtmpUrl];
  });

  const ffmpegCmd = [
    "ffmpeg", "-hide_banner", "-loglevel", "info", "-stats", "-re",
    "-i", sourceRef, "-c:v", "copy", "-c:a", "copy",
    ...ffmpegOutputArgs,
  ].join(" ");

  const workers = await db.select().from(workerNodesTable).where(eq(workerNodesTable.status, "online"));
  const assignedWorker = workers.length > 0 ? workers[0].workerId : null;

  if (!assignedWorker) {
    logger.warn({ channelId, isRecovery }, "Scheduler: no online workers, skipping start");
    return;
  }

  const [lockResult] = await db.update(channelsTable)
    .set({ status: "starting" })
    .where(and(
      eq(channelsTable.id, channel.id),
      inArray(channelsTable.status, ["idle", "error"]),
    ))
    .returning({ id: channelsTable.id });

  if (!lockResult) {
    logger.info({ channelId }, "Scheduler: channel state changed, skipping start");
    return;
  }

  const [job] = await db.insert(playoutJobsTable).values({
    channelId: channel.id,
    workerId: assignedWorker,
    status: "running",
    sourceMode: channel.sourceMode,
    sourceRef,
    destinations: destConfigs,
    ffmpegCommand: ffmpegCmd,
    startedAt: new Date(),
  }).returning();

  await db.update(channelsTable)
    .set({ status: "on_air", activeJobId: job.id })
    .where(eq(channelsTable.id, channel.id));

  await db.insert(streamSessionsTable).values({
    channelId: channel.id,
    channelName: channel.name,
    sourceMode: channel.sourceMode,
    errorCount: 0,
  });

  await db.insert(auditLogsTable).values({
    action: isRecovery ? "channel_auto_recovery" : "channel_scheduled_start",
    resourceType: "channel",
    resourceId: channel.id,
    details: { channelName: channel.name, jobId: job.id, trigger: isRecovery ? "auto_recovery" : "scheduler" },
  });

  logger.info({ channelId, channelName: channel.name, jobId: job.id, isRecovery },
    isRecovery ? "Auto-recovery: channel restarted" : "Scheduler: channel started");
}

async function stopChannel(channelId: number): Promise<void> {
  const [channel] = await db.select().from(channelsTable).where(eq(channelsTable.id, channelId));
  if (!channel || channel.status === "idle") return;

  const runningJobs = await db.select().from(playoutJobsTable)
    .where(and(eq(playoutJobsTable.channelId, channel.id), eq(playoutJobsTable.status, "running")));

  for (const job of runningJobs) {
    await db.update(playoutJobsTable)
      .set({ status: "stopped", stoppedAt: new Date() })
      .where(eq(playoutJobsTable.id, job.id));
  }

  const pendingJobs = await db.select().from(playoutJobsTable)
    .where(and(eq(playoutJobsTable.channelId, channel.id), eq(playoutJobsTable.status, "pending")));

  for (const job of pendingJobs) {
    await db.update(playoutJobsTable)
      .set({ status: "stopped", stoppedAt: new Date() })
      .where(eq(playoutJobsTable.id, job.id));
  }

  await db.update(channelsTable)
    .set({ status: "idle", activeJobId: null })
    .where(eq(channelsTable.id, channel.id));

  await db.insert(auditLogsTable).values({
    action: "channel_scheduled_stop",
    resourceType: "channel",
    resourceId: channel.id,
    details: { channelName: channel.name, trigger: "scheduler", jobsStopped: runningJobs.length + pendingJobs.length },
  });

  logger.info({ channelId, channelName: channel.name }, "Scheduler: channel stopped");
}

async function checkSchedules(): Promise<void> {
  try {
    const channels = await db.select().from(channelsTable)
      .where(eq(channelsTable.scheduleEnabled, true));

    for (const channel of channels) {
      if (!channel.scheduleStartTime || !channel.scheduleStopTime) continue;

      const tz = channel.scheduleTimezone || "UTC";
      const { hours, minutes, dayOfWeek } = getTimeInTimezone(tz);
      const nowMinutes = hours * 60 + minutes;

      const days = (channel.scheduleDays as number[] | null) ?? [];
      if (days.length > 0 && !days.includes(dayOfWeek)) {
        if (channel.status === "on_air") {
          await stopChannel(channel.id);
        }
        continue;
      }

      const startMin = timeToMinutes(channel.scheduleStartTime);
      const stopMin = timeToMinutes(channel.scheduleStopTime);

      let shouldBeOn: boolean;
      if (startMin < stopMin) {
        shouldBeOn = nowMinutes >= startMin && nowMinutes < stopMin;
      } else if (startMin > stopMin) {
        shouldBeOn = nowMinutes >= startMin || nowMinutes < stopMin;
      } else {
        shouldBeOn = false;
      }

      if (shouldBeOn && (channel.status === "idle" || channel.status === "error")) {
        const isRecovery = channel.status === "error";
        await startChannel(channel.id, { isRecovery });
      } else if (!shouldBeOn && (channel.status === "on_air" || channel.status === "error")) {
        await stopChannel(channel.id);
      }
    }
  } catch (err) {
    logger.error({ err }, "Scheduler: error checking schedules");
  }
}

async function recoverErrorChannels(): Promise<void> {
  try {
    const errorChannels = await db.select().from(channelsTable)
      .where(and(
        eq(channelsTable.status, "error"),
        eq(channelsTable.scheduleEnabled, false),
      ));

    for (const channel of errorChannels) {
      logger.info({ channelId: channel.id, channelName: channel.name },
        "Auto-recovery: attempting restart for failed channel");
      await startChannel(channel.id, { isRecovery: true });
    }
  } catch (err) {
    logger.error({ err }, "Auto-recovery: error recovering channels");
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startScheduler(): void {
  if (intervalId) return;
  logger.info("Channel scheduler started (30s interval)");
  checkSchedules();
  reapStaleWorkerJobs();
  recoverErrorChannels();
  intervalId = setInterval(() => {
    checkSchedules();
    reapStaleWorkerJobs();
    recoverErrorChannels();
  }, 30_000);
}

export function stopScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
