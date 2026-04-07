import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Play, Square, ChevronLeft, RefreshCw, Activity, Tv2 } from "lucide-react";
import { useState } from "react";
import { apiBase } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Channel {
  id: number;
  name: string;
  description?: string;
  status: string;
  sourceMode: string;
  sourceName?: string;
  activeJobId?: number;
  bitrate?: number;
  fps?: number;
  uptimeSeconds?: number;
  workerNodeId?: string;
  destinations?: Array<{ id: number; name: string; platform: string; streamUrl: string }>;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((init?.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d?.message ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    live: "bg-red-500 text-white",
    starting: "bg-yellow-500 text-black",
    stopping: "bg-orange-500 text-white",
    idle: "bg-secondary text-secondary-foreground",
    error: "bg-destructive text-destructive-foreground",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold ${colors[status] ?? "bg-secondary text-secondary-foreground"}`}>
      {status === "live" && <span className="w-1.5 h-1.5 rounded-full bg-white mr-1.5 animate-pulse" />}
      {status.toUpperCase()}
    </span>
  );
}

function formatUptime(secs: number): string {
  if (!secs) return "0s";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return [h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(" ");
}

export default function ChannelDetailPage() {
  const [, params] = useRoute("/channels/:id");
  const channelId = params?.id;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [switchPlaylist, setSwitchPlaylist] = useState("");

  const { data: channel, isLoading } = useQuery<Channel>({
    queryKey: ["channel", channelId],
    queryFn: () => apiFetch(`/channels/${channelId}`),
    enabled: !!channelId,
    refetchInterval: 5000,
  });

  const { data: playlists = [] } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ["playlists"],
    queryFn: () => apiFetch("/playlists"),
  });

  const startMutation = useMutation({
    mutationFn: () => apiFetch(`/channels/${channelId}/start`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["channel", channelId] }); toast({ title: "Channel starting" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const stopMutation = useMutation({
    mutationFn: () => apiFetch(`/channels/${channelId}/stop`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["channel", channelId] }); toast({ title: "Channel stopped" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const switchMutation = useMutation({
    mutationFn: (playlistId: string) => apiFetch(`/channels/${channelId}/switch-source`, {
      method: "POST",
      body: JSON.stringify({ sourceMode: "playlist", sourceRef: playlistId }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["channel", channelId] }); toast({ title: "Source switched" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  if (isLoading || !channel) {
    return (
      <AppShell>
        <div className="flex justify-center py-20"><Spinner className="size-8" /></div>
      </AppShell>
    );
  }

  const isLive = channel.status === "live";
  const canStart = channel.status === "idle" || channel.status === "error";
  const canStop = channel.status === "live" || channel.status === "starting";

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/channels">
            <Button variant="ghost" size="icon"><ChevronLeft className="w-5 h-5" /></Button>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{channel.name}</h1>
              <StatusBadge status={channel.status} />
            </div>
            <p className="text-muted-foreground text-sm mt-1 capitalize">{channel.sourceMode.replace("_", " ")} mode</p>
          </div>
          <div className="flex gap-2">
            {canStart && (
              <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
                <Play className="w-4 h-4 mr-2" />Start
              </Button>
            )}
            {canStop && (
              <Button variant="destructive" onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending}>
                <Square className="w-4 h-4 mr-2" />Stop
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Stream stats */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4" />Stream Health
              </CardTitle>
              <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin" style={{ animationDuration: "5s" }} />
            </CardHeader>
            <CardContent>
              {isLive ? (
                <div className="grid grid-cols-3 gap-6">
                  <div>
                    <p className="text-xs text-muted-foreground">Bitrate</p>
                    <p className="text-2xl font-mono font-bold">
                      {channel.bitrate ? `${Math.round(channel.bitrate / 1000)}k` : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">kbps</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">FPS</p>
                    <p className="text-2xl font-mono font-bold">{channel.fps ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">frames/sec</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Uptime</p>
                    <p className="text-2xl font-mono font-bold">{channel.uptimeSeconds ? formatUptime(channel.uptimeSeconds) : "—"}</p>
                    <p className="text-xs text-muted-foreground">duration</p>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  <Tv2 className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Channel is {channel.status}. Start the channel to see stream stats.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Source control */}
          <Card>
            <CardHeader><CardTitle className="text-base">Source Control</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {channel.sourceMode === "playlist" && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Current Source</Label>
                    <p className="text-sm font-medium">{channel.sourceName ?? "None"}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Switch Playlist</Label>
                    <Select value={switchPlaylist} onValueChange={setSwitchPlaylist}>
                      <SelectTrigger><SelectValue placeholder="Select playlist…" /></SelectTrigger>
                      <SelectContent>
                        {playlists.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!switchPlaylist || switchMutation.isPending}
                      onClick={() => switchMutation.mutate(switchPlaylist)}
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-2" />
                      Switch Source
                    </Button>
                  </div>
                </div>
              )}
              {channel.sourceMode === "live_input" && (
                <div className="text-sm text-muted-foreground">
                  Receiving from live RTMP/SRT input.
                </div>
              )}
              {channel.sourceMode === "fallback" && (
                <div className="text-sm text-muted-foreground">
                  Broadcasting fallback slate.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Destinations */}
        {channel.destinations && channel.destinations.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Output Destinations</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {channel.destinations.map((dest) => (
                  <div key={dest.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/30">
                    <div>
                      <div className="font-medium text-sm">{dest.name}</div>
                      <div className="text-xs text-muted-foreground">{dest.streamUrl}</div>
                    </div>
                    <Badge variant="outline" className="capitalize">{dest.platform}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
