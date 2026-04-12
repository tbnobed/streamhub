import { spawn, type ChildProcess } from "node:child_process";
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { logger } from "../lib/logger.js";
import { buildFileLoopCommand, buildPlaylistCommand, generateConcatPlaylistContent } from "./ffmpeg-builder.js";
import type { ApiClient, PlayoutJob } from "../lib/api-client.js";

interface DestProcess {
  process: ChildProcess;
  destId: string;
  destName: string;
  platform: string;
  healthy: boolean;
  error?: string;
  restartCount: number;
}

export class PlayoutJobRunner {
  private job: PlayoutJob;
  private api: ApiClient;
  private destProcesses: Map<string, DestProcess> = new Map();
  private singleProcess: ChildProcess | null = null;
  private restartCount = 0;
  private maxRestarts = 5;
  private stopped = false;
  private lastBitrate = 0;
  private lastFps = 0;
  private lastStatsSentAt = 0;
  private statsInterval: ReturnType<typeof setInterval> | null = null;
  private previewDir: string;

  constructor(job: PlayoutJob, api: ApiClient) {
    this.job = job;
    this.api = api;
    this.previewDir = `/tmp/preview/channel-${job.channelId}`;
  }

  private get previewHlsArgs(): string[] {
    const hlsPath = path.join(this.previewDir, "stream.m3u8");
    return [
      "-map", "0:v:0?", "-map", "0:a:0?",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-tune", "zerolatency",
      "-b:v", "800k",
      "-maxrate", "800k",
      "-bufsize", "1600k",
      "-vf", "scale=640:-2",
      "-g", "30",
      "-c:a", "aac",
      "-b:a", "96k",
      "-ar", "44100",
      "-f", "hls",
      "-hls_time", "2",
      "-hls_list_size", "5",
      "-hls_flags", "delete_segments+append_list",
      "-hls_segment_filename", path.join(this.previewDir, "seg_%03d.ts"),
      hlsPath,
    ];
  }

  private async initPreviewDir(): Promise<void> {
    await rm(this.previewDir, { recursive: true, force: true });
    await mkdir(this.previewDir, { recursive: true });
  }

  private async cleanupPreviewDir(): Promise<void> {
    try {
      await rm(this.previewDir, { recursive: true, force: true });
    } catch {}
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.initPreviewDir();
    const destinations = this.job.destinations ?? [];

    if (destinations.length > 1) {
      await this.launchMultiDestination();
    } else {
      await this.launchSingleProcess();
    }
  }

  private async launchMultiDestination(): Promise<void> {
    if (this.stopped) return;

    const destinations = this.job.destinations ?? [];
    const inputArgs = await this.buildInputArgs();
    if (!inputArgs) {
      logger.error({ jobId: this.job.id }, "Could not build FFmpeg input args");
      await this.api.updateJobStatus(this.job.id, "failed", { errorMessage: "Could not build FFmpeg command" });
      return;
    }

    await this.api.updateJobStatus(this.job.id, "running");
    await this.api.submitEvent({
      channelId: this.job.channelId,
      jobId: this.job.id,
      eventType: "job_started",
      message: `Starting ${destinations.length} output processes`,
    });

    for (let i = 0; i < destinations.length; i++) {
      const dest = destinations[i]!;
      const destId = String((dest as Record<string, unknown>).id ?? dest.streamKey);
      const destName = (dest as Record<string, unknown>).name as string ?? dest.platform;
      await this.launchDestProcess(destId, destName, dest, inputArgs, i === 0);
    }

    this.statsInterval = setInterval(() => {
      this.reportCombinedStats();
    }, 5000);
  }

  private async launchDestProcess(
    destId: string,
    destName: string,
    dest: { streamUrl: string; streamKey: string; platform: string },
    inputArgs: string[],
    includePreview = false,
  ): Promise<void> {
    if (this.stopped) return;

    const isSrt = dest.platform === "srt";
    const outputUrl = isSrt
      ? dest.streamUrl
      : `${dest.streamUrl}/${dest.streamKey}`.replace(/\/+$/, "");
    const args = [
      ...inputArgs,
      "-c:v", "copy",
      "-c:a", "copy",
      "-f", isSrt ? "mpegts" : "flv",
      outputUrl,
    ];

    if (includePreview) {
      args.push(...this.previewHlsArgs);
    }

    logger.info({ jobId: this.job.id, destId, destName, cmd: args.join(" ") }, "Launching FFmpeg for destination");

    const proc = spawn(args[0]!, args.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const dp: DestProcess = {
      process: proc,
      destId,
      destName,
      platform: dest.platform,
      healthy: false,
      restartCount: 0,
    };
    this.destProcesses.set(destId, dp);

    proc.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      for (const segment of text.split(/[\r\n]+/)) {
        const trimmed = segment.trim();
        if (!trimmed) continue;

        const bitrateMatch = trimmed.match(/bitrate=\s*([\d.]+)\s*kbits/);
        if (bitrateMatch) {
          this.lastBitrate = Math.round(parseFloat(bitrateMatch[1]!) * 1000);
          dp.healthy = true;
        }

        const streamFpsMatch = trimmed.match(/,\s*([\d.]+)\s+fps/);
        if (streamFpsMatch) {
          this.lastFps = Math.round(parseFloat(streamFpsMatch[1]!));
        }

        const fpsMatch = trimmed.match(/fps=\s*([\d.]+)/);
        if (fpsMatch) {
          this.lastFps = Math.round(parseFloat(fpsMatch[1]!));
        }

        if (trimmed.includes("Error") || trimmed.includes("error")) {
          dp.healthy = false;
          dp.error = trimmed.slice(0, 200);
          logger.warn({ jobId: this.job.id, destId, destName, error: dp.error }, "FFmpeg destination error");
        }

        if (trimmed.includes("Output #0")) {
          dp.healthy = true;
          dp.error = undefined;
        }
      }
    });

    proc.on("exit", async (code) => {
      logger.warn({ jobId: this.job.id, destId, destName, code }, "FFmpeg destination process exited");
      dp.healthy = false;

      if (this.stopped) return;

      if (dp.restartCount < this.maxRestarts) {
        dp.restartCount++;
        dp.error = `Process exited (code ${code}), restarting (${dp.restartCount}/${this.maxRestarts})`;

        await this.api.submitEvent({
          channelId: this.job.channelId,
          jobId: this.job.id,
          eventType: "reconnect",
          message: `${destName}: restarting (attempt ${dp.restartCount}/${this.maxRestarts})`,
        });

        await new Promise((r) => setTimeout(r, 3000));
        if (!this.stopped) {
          this.destProcesses.delete(destId);
          const inputArgs = await this.buildInputArgs();
          if (inputArgs) {
            await this.launchDestProcess(destId, destName, dest, inputArgs);
          }
        }
      } else {
        dp.error = `Failed after ${this.maxRestarts} restart attempts`;

        await this.api.submitEvent({
          channelId: this.job.channelId,
          jobId: this.job.id,
          eventType: "destination_failed",
          message: `${destName}: max restart attempts reached`,
        });

        const allDead = [...this.destProcesses.values()].every((d) => !d.healthy && d.restartCount >= this.maxRestarts);
        if (allDead) {
          logger.error({ jobId: this.job.id }, "All destinations failed");
          await this.api.updateJobStatus(this.job.id, "failed", {
            errorMessage: "All destination outputs failed",
          });
        }
      }

      this.reportCombinedStats();
    });

    setTimeout(() => {
      if (!dp.healthy && !dp.error) {
        dp.healthy = true;
      }
    }, 3000);
  }

  private reportCombinedStats(): void {
    if (this.stopped) return;

    const destHealth: Record<string, { status: string; error?: string }> = {};
    for (const [id, dp] of this.destProcesses) {
      if (dp.error) {
        destHealth[id] = { status: "error", error: dp.error };
      } else if (dp.healthy) {
        destHealth[id] = { status: "connected" };
      } else {
        destHealth[id] = { status: "connecting" };
      }
    }

    this.api.updateJobStatus(this.job.id, "running", {
      bitrate: this.lastBitrate || undefined,
      fps: this.lastFps || undefined,
      destinationHealth: destHealth,
    }).catch(() => {});
  }

  private async launchSingleProcess(): Promise<void> {
    if (this.stopped) return;

    const args = await this.buildArgs();
    if (!args) {
      logger.error({ jobId: this.job.id }, "Could not build FFmpeg args");
      await this.api.updateJobStatus(this.job.id, "failed", { errorMessage: "Could not build FFmpeg command" });
      return;
    }

    args.push(...this.previewHlsArgs);

    logger.info({ jobId: this.job.id, cmd: args.join(" ") }, "Launching FFmpeg");

    this.singleProcess = spawn(args[0]!, args.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const pid = this.singleProcess.pid;

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
    const destinations = this.job.destinations ?? [];
    const destHealth: Record<string, { status: string; error?: string }> = {};
    for (let i = 0; i < destinations.length; i++) {
      const d = destinations[i]!;
      const key = String((d as Record<string, unknown>).id ?? i);
      destHealth[key] = { status: "connecting" };
    }

    await this.api.updateJobStatus(this.job.id, "running", {
      pid,
      destinationHealth: destHealth,
    });

    this.singleProcess.stderr?.on("data", (data: Buffer) => {
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

        const outErrorMatch = trimmed.match(/\[out#(\d+)/);
        if (outErrorMatch && (trimmed.includes("Error") || trimmed.includes("error"))) {
          const outIdx = parseInt(outErrorMatch[1]!, 10);
          if (outIdx < destinations.length) {
            const d = destinations[outIdx]!;
            const key = String((d as Record<string, unknown>).id ?? outIdx);
            destHealth[key] = { status: "error", error: trimmed.slice(0, 200) };
          }
        }
      }

      if (lastBitrate > 0) {
        for (let i = 0; i < destinations.length; i++) {
          const d = destinations[i]!;
          const key = String((d as Record<string, unknown>).id ?? i);
          if (destHealth[key]?.status === "connecting") {
            destHealth[key] = { status: "connected" };
          }
        }
      }

      const now = Date.now();
      if (lastBitrate > 0 && now - lastStatsSentAt >= 5000) {
        lastStatsSentAt = now;
        this.api.updateJobStatus(this.job.id, "running", {
          bitrate: lastBitrate,
          fps: lastFps || undefined,
          pid,
          destinationHealth: destHealth,
        }).catch(() => {});
      }
    });

    this.singleProcess.on("exit", async (code) => {
      logger.warn({ jobId: this.job.id, code }, "FFmpeg process exited");

      if (this.stopped) {
        await this.api.updateJobStatus(this.job.id, "stopped");
        return;
      }

      const destinations = this.job.destinations ?? [];
      const errorHealth: Record<string, { status: string; error?: string }> = {};
      for (let i = 0; i < destinations.length; i++) {
        const d = destinations[i]!;
        const key = String((d as Record<string, unknown>).id ?? i);
        errorHealth[key] = { status: "error", error: `FFmpeg exited with code ${code}` };
      }

      if (this.restartCount < this.maxRestarts) {
        this.restartCount++;
        logger.info({ jobId: this.job.id, restartCount: this.restartCount }, "Restarting FFmpeg");

        const reconnectHealth: Record<string, { status: string; error?: string }> = {};
        for (let i = 0; i < destinations.length; i++) {
          const d = destinations[i]!;
          const key = String((d as Record<string, unknown>).id ?? i);
          reconnectHealth[key] = { status: "connecting" };
        }
        await this.api.updateJobStatus(this.job.id, "running", {
          destinationHealth: reconnectHealth,
        });

        await this.api.submitEvent({
          channelId: this.job.channelId,
          jobId: this.job.id,
          eventType: "reconnect",
          message: `FFmpeg restarting (attempt ${this.restartCount}/${this.maxRestarts})`,
        });

        await new Promise((r) => setTimeout(r, 3000));
        await this.launchSingleProcess();
      } else {
        logger.error({ jobId: this.job.id }, "Max restarts reached, job failed");
        await this.api.updateJobStatus(this.job.id, "failed", {
          errorMessage: `Process exited after ${this.maxRestarts} restart attempts`,
          destinationHealth: errorHealth,
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

  private async buildInputArgs(): Promise<string[] | null> {
    if (this.job.sourceMode === "live_input" && this.job.sourceRef) {
      return [
        "ffmpeg",
        "-hide_banner",
        "-loglevel", "info",
        "-stats",
        "-re",
        "-i", this.job.sourceRef,
      ];
    }

    if (this.job.sourceMode === "playlist" && this.job.sourceRef) {
      const files = this.job.sourceRef.split(",").map((f) => f.trim()).filter(Boolean);
      const streamUrls = files.filter((f) => this.isStreamUrl(f));
      const localFiles = files.filter((f) => !this.isStreamUrl(f));

      if (streamUrls.length > 0 && localFiles.length === 0) {
        const inputUrl = streamUrls[0]!;
        const args = [
          "ffmpeg",
          "-hide_banner",
          "-loglevel", "info",
          "-stats",
          "-re",
        ];
        if (inputUrl.endsWith(".m3u8") || inputUrl.includes(".m3u8?")) {
          args.push("-protocol_whitelist", "file,http,https,tcp,tls,crypto");
        }
        args.push("-i", inputUrl);
        return args;
      }

      const playlistPath = `/tmp/playlist_${this.job.id}.txt`;
      const content = generateConcatPlaylistContent(localFiles.length > 0 ? localFiles : files);
      await mkdir(path.dirname(playlistPath), { recursive: true });
      await writeFile(playlistPath, content, "utf-8");

      const hasHttpUrls = files.some((f) => f.startsWith("http://") || f.startsWith("https://"));

      const args = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel", "info",
        "-stats",
        "-re",
      ];

      if (hasHttpUrls) {
        args.push("-protocol_whitelist", "file,http,https,tcp,tls,crypto");
      }

      args.push(
        "-f", "concat",
        "-safe", "0",
      );

      if (this.job.loopPlaylist !== false) {
        args.push("-stream_loop", "-1");
      }

      args.push("-i", playlistPath);

      return args;
    }

    if ((this.job.sourceMode === "fallback" || this.job.sourceMode === "single_asset") && this.job.sourceRef) {
      const isStream = this.isStreamUrl(this.job.sourceRef);
      const loop = !isStream && (this.job.sourceMode === "single_asset" ? (this.job.loopPlaylist !== false) : true);
      const args = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel", "info",
        "-stats",
        "-re",
      ];
      if (loop) {
        args.push("-stream_loop", "-1");
      }
      if (this.job.sourceRef.endsWith(".m3u8") || this.job.sourceRef.includes(".m3u8?")) {
        args.push("-protocol_whitelist", "file,http,https,tcp,tls,crypto");
      }
      args.push("-i", this.job.sourceRef);
      return args;
    }

    return null;
  }

  private isStreamUrl(url: string): boolean {
    return url.startsWith("rtmp://") || url.startsWith("rtmps://") ||
      url.endsWith(".m3u8") || url.includes(".m3u8?");
  }

  private async buildArgs(): Promise<string[] | null> {
    const destinations = this.job.destinations ?? [];

    if (this.job.sourceMode === "playlist" && this.job.sourceRef) {
      const files = this.job.sourceRef.split(",").map((f) => f.trim()).filter(Boolean);

      const streamUrls = files.filter((f) => this.isStreamUrl(f));
      const localFiles = files.filter((f) => !this.isStreamUrl(f));

      if (streamUrls.length > 0 && localFiles.length === 0) {
        const inputUrl = streamUrls[0]!;
        const args = [
          "ffmpeg",
          "-hide_banner",
          "-loglevel", "info",
          "-stats",
          "-re",
        ];
        if (inputUrl.endsWith(".m3u8") || inputUrl.includes(".m3u8?")) {
          args.push("-protocol_whitelist", "file,http,https,tcp,tls,crypto");
        }
        args.push("-i", inputUrl, "-c:v", "copy", "-c:a", "copy");
        for (const dest of destinations) {
          if (dest.platform === "srt") {
            args.push("-f", "mpegts", dest.streamUrl);
          } else {
            const rtmpUrl = `${dest.streamUrl}/${dest.streamKey}`.replace(/\/+$/, "");
            args.push("-f", "flv", rtmpUrl);
          }
        }
        return args;
      }

      if (localFiles.length > 0) {
        const playlistPath = `/tmp/playlist_${this.job.id}.txt`;
        const content = generateConcatPlaylistContent(localFiles);
        await mkdir(path.dirname(playlistPath), { recursive: true });
        await writeFile(playlistPath, content, "utf-8");

        const hasHttpUrls = localFiles.some((f) => f.startsWith("http://") || f.startsWith("https://"));

        return buildPlaylistCommand({
          playlistFile: playlistPath,
          destinations,
          loop: this.job.loopPlaylist !== false,
          protocolWhitelist: hasHttpUrls,
        });
      }
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
        if (dest.platform === "srt") {
          args.push("-f", "mpegts", dest.streamUrl);
        } else {
          const rtmpUrl = `${dest.streamUrl}/${dest.streamKey}`.replace(/\/+$/, "");
          args.push("-f", "flv", rtmpUrl);
        }
      }
      return args;
    }

    if ((this.job.sourceMode === "fallback" || this.job.sourceMode === "single_asset") && this.job.sourceRef) {
      const isStream = this.isStreamUrl(this.job.sourceRef);
      if (isStream) {
        const args = [
          "ffmpeg",
          "-hide_banner",
          "-loglevel", "info",
          "-stats",
          "-re",
        ];
        if (this.job.sourceRef.endsWith(".m3u8") || this.job.sourceRef.includes(".m3u8?")) {
          args.push("-protocol_whitelist", "file,http,https,tcp,tls,crypto");
        }
        args.push("-i", this.job.sourceRef, "-c:v", "copy", "-c:a", "copy");
        for (const dest of destinations) {
          if (dest.platform === "srt") {
            args.push("-f", "mpegts", dest.streamUrl);
          } else {
            const rtmpUrl = `${dest.streamUrl}/${dest.streamKey}`.replace(/\/+$/, "");
            args.push("-f", "flv", rtmpUrl);
          }
        }
        return args;
      }
      return buildFileLoopCommand({
        inputFile: this.job.sourceRef,
        destinations,
        loop: this.job.sourceMode === "single_asset" ? (this.job.loopPlaylist !== false) : true,
      });
    }

    return null;
  }

  stop(): void {
    this.stopped = true;

    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }

    this.cleanupPreviewDir();

    for (const [, dp] of this.destProcesses) {
      if (dp.process && !dp.process.killed) {
        logger.info({ jobId: this.job.id, destId: dp.destId, pid: dp.process.pid }, "Stopping FFmpeg destination");
        dp.process.kill("SIGTERM");
        setTimeout(() => {
          if (dp.process && !dp.process.killed) {
            dp.process.kill("SIGKILL");
          }
        }, 5000);
      }
    }

    if (this.singleProcess && !this.singleProcess.killed) {
      logger.info({ jobId: this.job.id, pid: this.singleProcess.pid }, "Stopping FFmpeg");
      this.singleProcess.kill("SIGTERM");
      setTimeout(() => {
        if (this.singleProcess && !this.singleProcess.killed) {
          this.singleProcess.kill("SIGKILL");
        }
      }, 5000);
    }
  }
}
