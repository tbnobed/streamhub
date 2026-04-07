const isProduction = process.env.NODE_ENV === "production";

function formatLog(level: string, msg: string, data?: Record<string, unknown>): void {
  if (isProduction) {
    process.stdout.write(JSON.stringify({ level, msg, ...data, time: new Date().toISOString() }) + "\n");
  } else {
    const dataStr = data ? " " + JSON.stringify(data) : "";
    const now = new Date().toISOString();
    console.log(`[${now}] [${level.toUpperCase()}] ${msg}${dataStr}`);
  }
}

export const logger = {
  info: (data: Record<string, unknown> | string, msg?: string) => {
    if (typeof data === "string") formatLog("info", data);
    else formatLog("info", msg ?? "", data);
  },
  warn: (data: Record<string, unknown> | string, msg?: string) => {
    if (typeof data === "string") formatLog("warn", data);
    else formatLog("warn", msg ?? "", data);
  },
  error: (data: Record<string, unknown> | string, msg?: string) => {
    if (typeof data === "string") formatLog("error", data);
    else formatLog("error", msg ?? "", data);
  },
  debug: (data: Record<string, unknown> | string, msg?: string) => {
    if (process.env.LOG_LEVEL === "debug") {
      if (typeof data === "string") formatLog("debug", data);
      else formatLog("debug", msg ?? "", data);
    }
  },
};
