import { ApiClient } from "./lib/api-client.js";
import { PlayoutJobRunner } from "./jobs/playout-job.js";
import { logger } from "./lib/logger.js";

export interface WorkerAgentOptions {
  apiUrl: string;
  workerId: string;
  hostname: string;
  heartbeatInterval: number;
  jobPollInterval: number;
  version: string;
}

export class WorkerAgent {
  private opts: WorkerAgentOptions;
  private api: ApiClient;
  private activeJobs = new Map<number, PlayoutJobRunner>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(opts: WorkerAgentOptions) {
    this.opts = opts;
    this.api = new ApiClient(opts.apiUrl, opts.workerId);
  }

  start(): void {
    this.running = true;

    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.api.sendHeartbeat(
          this.opts.hostname,
          this.activeJobs.size,
          this.opts.version
        );
      } catch (err) {
        logger.warn({ err }, "Heartbeat failed");
      }
    }, this.opts.heartbeatInterval);

    this.pollTimer = setInterval(async () => {
      if (!this.running) return;
      try {
        await this.pollJobs();
      } catch (err) {
        logger.warn({ err }, "Job poll failed");
      }
    }, this.opts.jobPollInterval);

    logger.info(
      {
        workerId: this.opts.workerId,
        heartbeatInterval: this.opts.heartbeatInterval,
        jobPollInterval: this.opts.jobPollInterval,
      },
      "Worker agent started"
    );

    this.api.sendHeartbeat(this.opts.hostname, 0, this.opts.version).catch(() => {});
  }

  stop(): void {
    this.running = false;

    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);

    for (const [jobId, runner] of this.activeJobs.entries()) {
      logger.info({ jobId }, "Stopping job on worker shutdown");
      runner.stop();
    }

    this.activeJobs.clear();
  }

  private async pollJobs(): Promise<void> {
    const jobs = await this.api.fetchJobs();

    const activeIds = new Set(jobs.map((j) => j.id));

    for (const [jobId, runner] of this.activeJobs.entries()) {
      if (!activeIds.has(jobId)) {
        logger.info({ jobId }, "Job no longer assigned, stopping");
        runner.stop();
        this.activeJobs.delete(jobId);
      }
    }

    for (const job of jobs) {
      if (!this.activeJobs.has(job.id)) {
        logger.info({ jobId: job.id, channelId: job.channelId }, "Starting new job");
        const runner = new PlayoutJobRunner(job, this.api);
        this.activeJobs.set(job.id, runner);

        runner.start().catch(async (err) => {
          logger.error({ err, jobId: job.id }, "Job failed to start");
          this.activeJobs.delete(job.id);
          await this.api.updateJobStatus(job.id, "failed", {
            errorMessage: String(err),
          });
        });
      } else if (job.destinationCommands) {
        const runner = this.activeJobs.get(job.id)!;
        for (const [destId, cmd] of Object.entries(job.destinationCommands)) {
          logger.info({ jobId: job.id, destId, action: cmd.action }, "Processing destination command");
          if (cmd.action === "stop") {
            runner.stopDestination(destId);
          } else if (cmd.action === "restart") {
            runner.restartDestination(destId);
          }
          this.api.clearDestinationCommand(job.id, destId).catch(() => {});
        }
      }
    }
  }
}
