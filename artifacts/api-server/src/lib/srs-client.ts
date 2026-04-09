const SRS_API_BASE = process.env.SRS_API_URL ?? `http://${process.env.INGEST_HOST ?? "localhost"}:1985`;

interface SrsStream {
  id: string;
  name: string;
  app: string;
  vhost: string;
  send_bytes: number;
  recv_bytes: number;
  kbps: {
    recv_30s: number;
    send_30s: number;
  };
  publish: {
    active: boolean;
    cid: string;
  };
  video?: {
    codec: string;
    profile: string;
    level: string;
    width: number;
    height: number;
  };
  audio?: {
    codec: string;
    sample_rate: number;
    channel: number;
    profile: string;
  };
  clients: number;
}

interface SrsVhost {
  id: string;
  name: string;
  enabled: boolean;
  clients: number;
  streams: number;
  send_bytes: number;
  recv_bytes: number;
  kbps: {
    recv_30s: number;
    send_30s: number;
  };
}

interface SrsSummary {
  ok: boolean;
  now_ms: number;
  self: {
    version: string;
    pid: number;
    ppid: number;
    argv: string;
    cwd: string;
    mem_kbyte: number;
    mem_percent: number;
    cpu_percent: number;
    srs_uptime: number;
  };
  system: {
    cpu_percent: number;
    disk_read_KBps: number;
    disk_write_KBps: number;
    mem_ram_kbyte: number;
    mem_ram_percent: number;
    mem_swap_kbyte: number;
    mem_swap_percent: number;
    cpus: number;
    cpus_online: number;
    uptime: number;
    ilde_time: number;
    load_1m: number;
    load_5m: number;
    load_15m: number;
    net_sample_time: number;
    net_recv_bytes: number;
    net_send_bytes: number;
    srs_sample_time: number;
    srs_recv_bytes: number;
    srs_send_bytes: number;
    conn_sys: number;
    conn_sys_et: number;
    conn_sys_tw: number;
    conn_sys_udp: number;
    conn_srs: number;
  };
}

interface SrsClients {
  id: string;
  vhost: string;
  stream: string;
  ip: string;
  pageUrl: string;
  swfUrl: string;
  tcUrl: string;
  url: string;
  name: string;
  type: string;
  publish: boolean;
  alive: number;
  send_bytes: number;
  recv_bytes: number;
  kbps: {
    recv_30s: number;
    send_30s: number;
  };
}

async function srsGet<T>(path: string, timeoutMs = 5000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${SRS_API_BASE}${path}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`SRS API ${res.status}: ${res.statusText}`);
    return await res.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function getSrsStreams(): Promise<SrsStream[]> {
  const data = await srsGet<{ code: number; streams: SrsStream[] }>("/api/v1/streams/");
  if (data.code !== 0) throw new Error(`SRS error code ${data.code}`);
  return data.streams ?? [];
}

export async function getSrsVhosts(): Promise<SrsVhost[]> {
  const data = await srsGet<{ code: number; vhosts: SrsVhost[] }>("/api/v1/vhosts/");
  if (data.code !== 0) throw new Error(`SRS error code ${data.code}`);
  return data.vhosts ?? [];
}

export async function getSrsSummary(): Promise<SrsSummary> {
  const resp = await srsGet<{ code: number; data: SrsSummary }>("/api/v1/summaries");
  return resp.data;
}

export async function getSrsClients(): Promise<SrsClients[]> {
  const data = await srsGet<{ code: number; clients: SrsClients[] }>("/api/v1/clients/");
  if (data.code !== 0) throw new Error(`SRS error code ${data.code}`);
  return data.clients ?? [];
}

export async function getSrsServerInfo(): Promise<{ version: string; uptime: number; pid: number }> {
  const resp = await srsGet<{ code: number; data: { major: number; minor: number; revision: number; version: string } }>("/api/v1/versions");
  if (resp.code !== 0) throw new Error(`SRS error code ${resp.code}`);
  return { version: resp.data.version, uptime: 0, pid: 0 };
}

export interface SrsStreamStatus {
  streamName: string;
  app: string;
  isLive: boolean;
  bitrate_kbps: number;
  clients: number;
  video?: {
    codec: string;
    width: number;
    height: number;
  };
  audio?: {
    codec: string;
    sample_rate: number;
    channels: number;
  };
}

export function matchStreamToKey(streams: SrsStream[], streamKey: string): SrsStreamStatus | null {
  const stream = streams.find(
    (s) => s.name === streamKey || s.name === `/${streamKey}` || s.name?.endsWith(`/${streamKey}`)
  );
  if (!stream) return null;

  return {
    streamName: stream.name,
    app: stream.app,
    isLive: stream.publish?.active ?? false,
    bitrate_kbps: stream.kbps?.recv_30s ?? 0,
    clients: stream.clients ?? 0,
    video: stream.video
      ? { codec: stream.video.codec, width: stream.video.width, height: stream.video.height }
      : undefined,
    audio: stream.audio
      ? { codec: stream.audio.codec, sample_rate: stream.audio.sample_rate, channels: stream.audio.channel }
      : undefined,
  };
}

export async function checkSrsHealth(): Promise<{
  reachable: boolean;
  version?: string;
  uptime?: number;
  cpu_percent?: number;
  mem_percent?: number;
  active_streams: number;
  total_clients: number;
  total_recv_kbps: number;
  total_send_kbps: number;
  error?: string;
}> {
  try {
    const [summary, streams] = await Promise.all([
      getSrsSummary(),
      getSrsStreams(),
    ]);

    const activeStreams = streams.filter((s) => s.publish?.active).length;
    const totalClients = streams.reduce((n, s) => n + (s.clients ?? 0), 0);
    const totalRecv = streams.reduce((n, s) => n + (s.kbps?.recv_30s ?? 0), 0);
    const totalSend = streams.reduce((n, s) => n + (s.kbps?.send_30s ?? 0), 0);

    return {
      reachable: true,
      version: summary.self?.version,
      uptime: summary.self?.srs_uptime,
      cpu_percent: summary.self?.cpu_percent,
      mem_percent: summary.self?.mem_percent,
      active_streams: activeStreams,
      total_clients: totalClients,
      total_recv_kbps: totalRecv,
      total_send_kbps: totalSend,
    };
  } catch (err: unknown) {
    return {
      reachable: false,
      active_streams: 0,
      total_clients: 0,
      total_recv_kbps: 0,
      total_send_kbps: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
