import { spawn, type ChildProcess } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { logger } from "../lib/logger.js";
import { buildFileLoopCommand, buildPlaylistCommand, generateConcatPlaylistContent } from "./ffmpeg-builder.js";
import type { ApiClient, PlayoutJob } from "../lib/api-client.js";

export class PlayoutJobRunner {
  private job: PlayoutJob;
  private api: ApiClient;
  private process: ChildProcess | null = null;
  private restartCount = 0;
  private maxRestarts = 5;
  private stopped = false;

  constructor(job: PlayoutJob, api: ApiClient) {
    this.job = job;
    this.api = api;
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.launchProcess();
  }

  private async launchProcess(): Promise<void> {
    if (this.stopped) return;

    const args = await this.buildArgs();
    if (!args) {
      logger.error({ jobId: this.job.id }, "Could not build FFmpeg args");
      await this.api.updateJobStatus(this.job.id, "failed", { errorMessage: "Could not build FFmpeg command" });
      return;
    }

    logger.info({ jobId: this.job.id, cmd: args.join(" ") }, "Launching FFmpeg");

    this.process = spawn(args[0]!, args.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const pid = this.process.pid;

    await this.api.updateJobStatus(this.job.id, "running", { pid });
    await this.api.submitEvent({
      channelId: this.job.channelId,
      jobId: this.job.id,
      eventType: "job_started",
      message: `FFmpeg process started (pid=${pid})`,
    });

    let lastBitrate = 0;
    let lastFps = 0;
    let lastStatsSentAt = 0;

    this.process.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      for (const segment of text.split(/[\r\n]+/)) {
        const trimmed = segment.trim();
        if (!trimmed) continue;

        const bitrateMatch = trimmed.match(/bitrate=\s*([\d.]+)\s*kbits/);
        if (bitrateMatch) {
          lastBitrate = Math.round(parseFloat(bitrateMatch[1]!) * 1000);
        }

        const streamFpsMatch = trimmed.match(/,\s*([\d.]+)\s+fps/);
        if (streamFpsMatch) {
          lastFps = Math.round(parseFloat(streamFpsMatch[1]!));
        }

        const fpsMatch = trimmed.match(/fps=\s*([\d.]+)/);
        if (fpsMatch) {
          lastFps = Math.round(parseFloat(fpsMatch[1]!));
        }
      }

      const now = Date.now();
      if (lastBitrate > 0 && now - lastStatsSentAt >= 5000) {
        lastStatsSentAt = now;
        this.api.updateJobStatus(this.job.id, "running", {
          bitrate: lastBitrate,
          fps: lastFps || undefined,
          pid,
        }).catch(() => {});
      }
    });

    this.process.on("exit", async (code) => {
      logger.warn({ jobId: this.job.id, code }, "FFmpeg process exited");

      if (this.stopped) {
        await this.api.updateJobStatus(this.job.id, "stopped");
        return;
      }

      if (this.restartCount < this.maxRestarts) {
        this.restartCount++;
        logger.info({ jobId: this.job.id, restartCount: this.restartCount }, "Restarting FFmpeg");

        await this.api.submitEvent({
          channelId: this.job.channelId,
          jobId: this.job.id,
          eventType: "reconnect",
          message: `FFmpeg restarting (attempt ${this.restartCount}/${this.maxRestarts})`,
        });

        await new Promise((r) => setTimeout(r, 3000));
        await this.launchProcess();
      } else {
        logger.error({ jobId: this.job.id }, "Max restarts reached, job failed");
        await this.api.updateJobStatus(this.job.id, "failed", {
          errorMessage: `Process exited after ${this.maxRestarts} restart attempts`,
        });
        await this.api.submitEvent({
          channelId: this.job.channelId,
          jobId: this.job.id,
          eventType: "job_failed",
          message: "Max restart attempts reached",
        });
      }
    });
  }

  private async buildArgs(): Promise<string[] | null> {
    const destinations = this.job.destinations ?? [];

    if (this.job.sourceMode === "playlist" && this.job.sourceRef) {
      const playlistPath = `/tmp/playlist_${this.job.id}.txt`;
      const files = this.job.sourceRef.split(",").map((f) => f.trim()).filter(Boolean);
      const content = generateConcatPlaylistContent(files);

      await mkdir(path.dirname(playlistPath), { recursive: true });
      await writeFile(playlistPath, content, "utf-8");

      return buildPlaylistCommand({
        playlistFile: playlistPath,
        destinations,
        loop: true,
      });
    }

    if (this.job.sourceMode === "playlist" && !this.job.sourceRef) {
      logger.warn({ jobId: this.job.id }, "No source ref for playlist job");
      return null;
    }

    if (this.job.sourceMode === "live_input" && this.job.sourceRef) {
      const args = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel", "info",
        "-stats",
        "-re",
        "-i", this.job.sourceRef,
        "-c:v", "copy",
        "-c:a", "copy",
      ];
      for (const dest of destinations) {
        const rtmpUrl = `${dest.streamUrl}/${dest.streamKey}`.replace(/\/+$/, "");
        args.push("-f", "flv", rtmpUrl);
      }
      return args;
    }

    if (this.job.sourceMode === "fallback" && this.job.sourceRef) {
      return buildFileLoopCommand({
        inputFile: this.job.sourceRef,
        destinations,
        loop: true,
      });
    }

    return null;
  }

  stop(): void {
    this.stopped = true;
    if (this.process && !this.process.killed) {
      logger.info({ jobId: this.job.id, pid: this.process.pid }, "Stopping FFmpeg");
      this.process.kill("SIGTERM");
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill("SIGKILL");
        }
      }, 5000);
    }
  }
}
