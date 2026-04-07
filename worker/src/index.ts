import { WorkerAgent } from "./worker.js";
import { logger } from "./lib/logger.js";

const API_URL = process.env.API_URL ?? "http://localhost/api";
const WORKER_ID = process.env.WORKER_ID ?? `worker-${process.pid}`;
const HOSTNAME = process.env.HOSTNAME ?? "localhost";
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL ?? "15000", 10);
const JOB_POLL_INTERVAL = parseInt(process.env.JOB_POLL_INTERVAL ?? "5000", 10);

logger.info({ WORKER_ID, API_URL }, "Social Playout Worker starting");

const agent = new WorkerAgent({
  apiUrl: API_URL,
  workerId: WORKER_ID,
  hostname: HOSTNAME,
  heartbeatInterval: HEARTBEAT_INTERVAL,
  jobPollInterval: JOB_POLL_INTERVAL,
  version: "1.0.0",
});

agent.start();

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down");
  agent.stop();
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down");
  agent.stop();
  process.exit(0);
});
