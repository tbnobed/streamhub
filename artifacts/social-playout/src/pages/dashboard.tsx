import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Tv2,
  Film,
  ListVideo,
  Radio,
  ServerCog,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Server,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Link } from "wouter";
import { apiBase } from "@/lib/api";

interface SrsHealth {
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
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatBitrate(kbps: number): string {
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`;
  return `${Math.round(kbps)} kbps`;
}

interface ChannelSummary {
  id: number;
  name: string;
  status: string;
  sourceMode: string;
}

interface DashStats {
  channels: { total: number; live: number; idle: number };
  assets: { total: number };
  playlists: { total: number };
  liveInputs: { total: number; connected: number };
  workers: { total: number; online: number };
}

async function fetchDashboard(): Promise<{ channels: ChannelSummary[]; stats: DashStats }> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const [channelsRes, assetsRes, playlistsRes, liveInputsRes, workersRes] = await Promise.all([
    fetch(`${apiBase()}/channels`, { headers }),
    fetch(`${apiBase()}/assets`, { headers }),
    fetch(`${apiBase()}/playlists`, { headers }),
    fetch(`${apiBase()}/live-inputs`, { headers }),
    fetch(`${apiBase()}/workers`, { headers }),
  ]);

  const channels: ChannelSummary[] = channelsRes.ok ? await channelsRes.json() : [];
  const assets: unknown[] = assetsRes.ok ? await assetsRes.json() : [];
  const playlists: unknown[] = playlistsRes.ok ? await playlistsRes.json() : [];
  const liveInputs: Array<{ status: string }> = liveInputsRes.ok ? await liveInputsRes.json() : [];
  const workers: Array<{ status: string }> = workersRes.ok ? await workersRes.json() : [];

  const live = channels.filter((c) => c.status === "live").length;
  const connected = liveInputs.filter((i) => i.status === "connected").length;
  const online = workers.filter((w) => w.status === "online").length;

  return {
    channels,
    stats: {
      channels: { total: channels.length, live, idle: channels.length - live },
      assets: { total: assets.length },
      playlists: { total: playlists.length },
      liveInputs: { total: liveInputs.length, connected },
      workers: { total: workers.length, online },
    },
  };
}

function StatusBadge({ status }: { status: string }) {
  if (status === "live") return <Badge className="bg-red-500 text-white animate-pulse">LIVE</Badge>;
  if (status === "starting") return <Badge className="bg-yellow-500 text-black">Starting</Badge>;
  if (status === "stopping") return <Badge className="bg-orange-500 text-white">Stopping</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  href,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sub?: string;
  href: string;
  accent?: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className={`text-3xl font-bold mt-1 ${accent ?? ""}`}>{value}</p>
              {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
            </div>
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon className="w-6 h-6 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
    refetchInterval: 10_000,
  });

  const { data: srsHealth } = useQuery<SrsHealth>({
    queryKey: ["srs-health"],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase()}/srs/health`, { headers });
      if (!res.ok) throw new Error("Failed to fetch SRS health");
      return res.json();
    },
    refetchInterval: 15_000,
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Streaming operations overview</p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Spinner className="size-8" />
          </div>
        )}

        {error && (
          <Card className="border-destructive">
            <CardContent className="p-6 flex items-center gap-3 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              <span>Failed to load dashboard data</span>
            </CardContent>
          </Card>
        )}

        {data && (
          <>
            {/* Stats grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard
                icon={Tv2}
                label="Channels"
                value={data.stats.channels.total}
                sub={`${data.stats.channels.live} live`}
                href="/channels"
                accent={data.stats.channels.live > 0 ? "text-red-500" : ""}
              />
              <StatCard
                icon={Film}
                label="Assets"
                value={data.stats.assets.total}
                href="/assets"
              />
              <StatCard
                icon={ListVideo}
                label="Playlists"
                value={data.stats.playlists.total}
                href="/playlists"
              />
              <StatCard
                icon={Radio}
                label="Live Inputs"
                value={data.stats.liveInputs.total}
                sub={`${data.stats.liveInputs.connected} connected`}
                href="/live-inputs"
              />
              <StatCard
                icon={ServerCog}
                label="Workers"
                value={data.stats.workers.total}
                sub={`${data.stats.workers.online} online`}
                href="/workers"
                accent={data.stats.workers.online === 0 && data.stats.workers.total > 0 ? "text-red-500" : ""}
              />
            </div>

            {/* SRS Ingest Server */}
            {srsHealth && (
              <Card className="border-border/50">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Server className="w-4 h-4" />
                    SRS Ingest Server
                  </CardTitle>
                  {srsHealth.reachable ? (
                    <div className="flex items-center gap-1.5 text-green-500 text-xs">
                      <Wifi className="w-3.5 h-3.5" />
                      <span>Online</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-destructive text-xs">
                      <WifiOff className="w-3.5 h-3.5" />
                      <span>Unreachable</span>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  {srsHealth.reachable ? (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground text-xs">Version</div>
                        <div className="font-mono font-medium">{srsHealth.version ?? "—"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Uptime</div>
                        <div className="font-medium">{srsHealth.uptime ? formatUptime(srsHealth.uptime) : "—"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Active Streams</div>
                        <div className="font-medium">{srsHealth.active_streams}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Total Ingest</div>
                        <div className="font-medium">{formatBitrate(srsHealth.total_recv_kbps)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Clients</div>
                        <div className="font-medium">{srsHealth.total_clients}</div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Cannot reach SRS API. Check your SRS server configuration.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Channels list */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Channels</CardTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Activity className="w-3 h-3" />
                  Auto-refreshes every 10s
                </div>
              </CardHeader>
              <CardContent>
                {data.channels.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Tv2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No channels yet</p>
                    <Link href="/channels">
                      <span className="text-primary text-sm hover:underline cursor-pointer">
                        Create your first channel →
                      </span>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.channels.map((ch) => (
                      <Link key={ch.id} href={`/channels/${ch.id}`}>
                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors cursor-pointer">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                ch.status === "live"
                                  ? "bg-red-500 animate-pulse"
                                  : ch.status === "starting"
                                  ? "bg-yellow-500"
                                  : "bg-muted-foreground/40"
                              }`}
                            />
                            <div>
                              <div className="font-medium text-sm">{ch.name}</div>
                              <div className="text-xs text-muted-foreground capitalize">
                                {ch.sourceMode.replace("_", " ")}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusBadge status={ch.status} />
                            {ch.status === "live" ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            ) : null}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
