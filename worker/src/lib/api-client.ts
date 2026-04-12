import { logger } from "./logger.js";

export interface PlayoutJob {
  id: number;
  channelId: number;
  workerId: string | null;
  status: string;
  sourceMode: string;
  sourceRef: string | null;
  destinations: Array<{ streamUrl: string; streamKey: string; platform: string }>;
  ffmpegCommand: string | null;
  pid: number | null;
  loopPlaylist?: boolean;
  destinationCommands?: Record<string, { action: string }> | null;
}

export class ApiClient {
  private baseUrl: string;
  private workerId: string;

  constructor(baseUrl: string, workerId: string) {
    this.baseUrl = baseUrl;
    this.workerId = workerId;
  }

  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Worker-Id": this.workerId,
        ...options?.headers,
      },
    });

    if (!res.ok) {
      throw new Error(`API error ${res.status}: ${await res.text()}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  async sendHeartbeat(hostname: string, activeJobs: number, version: string): Promise<void> {
    await this.fetch("/workers/heartbeat", {
      method: "POST",
      body: JSON.stringify({ workerId: this.workerId, hostname, activeJobs, version }),
    });
  }

  async fetchJobs(): Promise<PlayoutJob[]> {
    return this.fetch<PlayoutJob[]>(`/workers/jobs?workerId=${this.workerId}`);
  }

  async updateJobStatus(jobId: number, status: string, extra?: {
    bitrate?: number;
    fps?: number;
    pid?: number;
    errorMessage?: string;
    destinationHealth?: Record<string, { status: string; error?: string }>;
  }): Promise<void> {
    await this.fetch(`/workers/jobs/${jobId}/status`, {
      method: "POST",
      body: JSON.stringify({ status, ...extra }),
    });
  }

  async fetchJobStatus(jobId: number): Promise<{ status: string } | null> {
    try {
      return await this.fetch<{ status: string }>(`/workers/jobs/${jobId}/check`);
    } catch {
      return null;
    }
  }

  async clearDestinationCommand(jobId: number, destId: string): Promise<void> {
    await this.fetch(`/workers/jobs/${jobId}/dest-command-ack`, {
      method: "POST",
      body: JSON.stringify({ destId }),
    });
  }

  async submitEvent(opts: {
    channelId?: number;
    jobId?: number;
    eventType: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.fetch("/workers/events", {
        method: "POST",
        body: JSON.stringify({ workerId: this.workerId, ...opts }),
      });
    } catch (err) {
      logger.error({ err }, "Failed to submit event");
    }
  }
}
