import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Play, Square, ChevronLeft, RefreshCw, Activity, Tv2, Radio, Copy, Check, MonitorPlay, Plus, Trash2, Send, Zap, Clock, Calendar } from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import Hls from "hls.js";
import { apiBase } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth";

interface LiveInput {
  id: number;
  name: string;
  protocol: string;
  status: string;
}

interface Destination {
  id: number;
  name: string;
  platform: string;
  streamUrl: string;
  streamKey: string;
  channelId: number | null;
  isActive: boolean;
  status: string;
}

interface DestinationHealthEntry {
  status: string;
  error?: string;
}

interface ActiveJob {
  id: number;
  status: string;
  sourceMode: string;
  sourceRef: string;
  workerId: string | null;
  ffmpegCommand: string;
  destinations: Array<{ id: number; name: string; platform: string }>;
  startedAt: string;
  bitrate: number | null;
  fps: number | null;
  destinationHealth: Record<string, DestinationHealthEntry> | null;
}

interface Channel {
  id: number;
  name: string;
  description?: string;
  status: string;
  sourceMode: string;
  sourceName?: string;
  activePlaylistId?: number;
  activeLiveInputId?: number;
  activeAssetId?: number;
  activeJobId?: number;
  loopPlaylist?: boolean;
  bitrate?: number;
  fps?: number;
  uptimeSeconds?: number;
  workerNodeId?: string;
  scheduleEnabled?: boolean;
  scheduleTimezone?: string;
  scheduleStartTime?: string | null;
  scheduleStopTime?: string | null;
  scheduleDays?: number[];
  playlist?: { id: number; name: string };
  liveInput?: { id: number; name: string; protocol: string; streamKey: string; ingestUrl: string; status: string };
  activeAsset?: { id: number; name: string; filename: string; mimeType: string };
  destinations?: Array<{ id: number; name: string; platform: string; streamUrl: string }>;
  activeJob?: ActiveJob | null;
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
    throw new Error(d?.error ?? d?.message ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function copyToClipboard(text: string): void {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text);
  } else {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="p-1 hover:bg-accent rounded"
      onClick={() => { copyToClipboard(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
    >
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    on_air: "bg-red-500 text-white",
    live: "bg-red-500 text-white",
    starting: "bg-yellow-500 text-black",
    stopping: "bg-orange-500 text-white",
    idle: "bg-secondary text-secondary-foreground",
    error: "bg-destructive text-destructive-foreground",
  };
  const label = status === "on_air" ? "ON AIR" : status.toUpperCase();
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold ${colors[status] ?? "bg-secondary text-secondary-foreground"}`}>
      {(status === "on_air" || status === "live") && <span className="w-1.5 h-1.5 rounded-full bg-white mr-1.5 animate-pulse" />}
      {label}
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

interface PreviewUrls {
  flv: string;
  hls: string;
  whep: string;
}

function ChannelOutputPreview({ channelId, isLive }: { channelId: string; isLive: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const hlsUrl = `${apiBase()}/channels/${channelId}/preview/stream.m3u8`;

  useEffect(() => {
    if (!isLive || !videoRef.current) {
      setError(null);
      return;
    }

    const retryDelay = setTimeout(() => {
      const video = videoRef.current;
      if (!video) return;

      if (Hls.isSupported()) {
        const hls = new Hls({
          liveSyncDurationCount: 2,
          liveMaxLatencyDurationCount: 4,
          enableWorker: true,
          lowLatencyMode: true,
          manifestLoadingTimeOut: 3000,
          manifestLoadingMaxRetry: 20,
          manifestLoadingRetryDelay: 1000,
          levelLoadingTimeOut: 3000,
          levelLoadingMaxRetry: 20,
          levelLoadingRetryDelay: 1000,
        });

        hls.loadSource(hlsUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
          setError(null);
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              if (retryCount < 20) {
                setTimeout(() => setRetryCount((c) => c + 1), 1000);
              } else {
                setError("Preview stream not yet available");
              }
            } else {
              setError("Preview playback error");
            }
            hls.destroy();
          }
        });

        hlsRef.current = hls;
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = hlsUrl;
        video.addEventListener("loadedmetadata", () => video.play().catch(() => {}));
      } else {
        setError("HLS not supported in this browser");
      }
    }, retryCount === 0 ? 1000 : 500);

    return () => {
      clearTimeout(retryDelay);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [isLive, hlsUrl, retryCount]);

  useEffect(() => {
    if (!isLive) {
      setRetryCount(0);
      setError(null);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    }
  }, [isLive]);

  if (!isLive) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MonitorPlay className="w-4 h-4" />Output Preview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/30 rounded-lg flex flex-col items-center justify-center gap-2" style={{ height: "180px" }}>
            <Tv2 className="w-8 h-8 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground text-center">Start the channel to see output preview</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MonitorPlay className="w-4 h-4" />
          Output Preview
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="bg-muted/30 rounded-lg flex flex-col items-center justify-center gap-2" style={{ height: "180px" }}>
            <Tv2 className="w-8 h-8 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground text-center">{error}</p>
            <button
              className="text-xs text-blue-400 hover:text-blue-300"
              onClick={() => { setError(null); setRetryCount(0); }}
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="bg-black rounded-lg overflow-hidden" style={{ height: "180px" }}>
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              muted
              playsInline
              controls
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CompactPreview({ streamKey }: { streamKey: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: previewUrls } = useQuery<PreviewUrls>({
    queryKey: ["srs-preview", streamKey],
    queryFn: () => apiFetch(`/srs/preview-url/${streamKey}`),
    enabled: !!streamKey,
  });

  const flvUrl = previewUrls?.flv ?? "";

  useEffect(() => {
    if (!flvUrl || !videoRef.current) return;

    let player: any = null;
    let destroyed = false;

    (async () => {
      try {
        const mpegts = (await import("mpegts.js")).default;
        if (destroyed) return;

        if (!mpegts.isSupported()) {
          setError("FLV not supported in this browser.");
          return;
        }

        player = mpegts.createPlayer({
          type: "flv",
          isLive: true,
          url: flvUrl,
        }, {
          enableWorker: true,
          lazyLoadMaxDuration: 3 * 60,
          seekType: "range",
          liveBufferLatencyChasing: true,
          liveBufferLatencyMaxLatency: 1.5,
          liveBufferLatencyMinRemain: 0.5,
        });

        player.attachMediaElement(videoRef.current!);
        player.load();

        player.on(mpegts.Events.ERROR, () => {
          setError("No active stream");
          try { player?.destroy(); } catch {}
          player = null;
          playerRef.current = null;
        });

        videoRef.current!.play().catch(() => {});

        playerRef.current = player;
      } catch {
        if (!destroyed) setError("Failed to initialize player.");
      }
    })();

    return () => {
      destroyed = true;
      if (player) {
        try { player.pause(); } catch {}
        try { player.unload(); } catch {}
        try { player.detachMediaElement(); } catch {}
        try { player.destroy(); } catch {}
        player = null;
      }
      playerRef.current = null;
      setError(null);
    };
  }, [flvUrl]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MonitorPlay className="w-4 h-4" />
          Live Preview
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!error ? (
          <div className="bg-black rounded-lg overflow-hidden" style={{ height: "180px" }}>
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              muted
              playsInline
              controls
            />
          </div>
        ) : (
          <div className="bg-muted/30 rounded-lg flex flex-col items-center justify-center gap-2" style={{ height: "180px" }}>
            <Tv2 className="w-8 h-8 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        )}
        {previewUrls && (
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-2 bg-muted rounded px-2 py-1 text-xs">
              <span className="text-muted-foreground shrink-0">FLV</span>
              <code className="truncate flex-1">{previewUrls.flv}</code>
              <CopyButton text={previewUrls.flv} />
            </div>
            <div className="flex items-center gap-2 bg-muted rounded px-2 py-1 text-xs">
              <span className="text-muted-foreground shrink-0">HLS</span>
              <code className="truncate flex-1">{previewUrls.hls}</code>
              <CopyButton text={previewUrls.hls} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Singapore",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ChannelDetailPage() {
  const [, params] = useRoute("/channels/:id");
  const channelId = params?.id;
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedSourceMode, setSelectedSourceMode] = useState("");
  const [switchPlaylist, setSwitchPlaylist] = useState("");
  const [switchLiveInput, setSwitchLiveInput] = useState("");
  const [switchAsset, setSwitchAsset] = useState("");
  const [addDestOpen, setAddDestOpen] = useState(false);
  const [createDestOpen, setCreateDestOpen] = useState(false);
  const [destForm, setDestForm] = useState({ name: "", platform: "rtmp", streamUrl: "", streamKey: "" });

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

  const { data: liveInputs = [] } = useQuery<LiveInput[]>({
    queryKey: ["live-inputs"],
    queryFn: () => apiFetch("/live-inputs"),
  });

  const { data: allAssets = [] } = useQuery<Array<{ id: number; name: string; filename: string; mimeType: string }>>({
    queryKey: ["assets"],
    queryFn: () => apiFetch("/assets"),
  });

  const { data: channelDests = [], refetch: refetchChannelDests } = useQuery<Destination[]>({
    queryKey: ["destinations", "channel", channelId],
    queryFn: () => apiFetch(`/destinations?channelId=${channelId}`),
    enabled: !!channelId,
  });

  const { data: allDests = [], refetch: refetchAllDests } = useQuery<Destination[]>({
    queryKey: ["destinations", "all"],
    queryFn: () => apiFetch("/destinations"),
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
    mutationFn: (body: { sourceMode: string; playlistId?: number; liveInputId?: number }) =>
      apiFetch(`/channels/${channelId}/switch-source`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel", channelId] });
      toast({ title: "Source switched" });
      setSelectedSourceMode("");
      setSwitchPlaylist("");
      setSwitchLiveInput("");
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const refetchDests = () => { refetchChannelDests(); refetchAllDests(); };

  const createDestMutation = useMutation({
    mutationFn: (body: typeof destForm) =>
      apiFetch("/destinations", {
        method: "POST",
        body: JSON.stringify({ ...body }),
      }),
    onSuccess: () => {
      refetchDests();
      setCreateDestOpen(false);
      setDestForm({ name: "", platform: "rtmp", streamUrl: "", streamKey: "" });
      toast({ title: "Destination preset created" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const assignDestMutation = useMutation({
    mutationFn: (destId: number) =>
      apiFetch(`/destinations/${destId}`, {
        method: "PATCH",
        body: JSON.stringify({ channelId: Number(channelId) }),
      }),
    onSuccess: () => {
      refetchDests();
      setAddDestOpen(false);
      toast({ title: "Destination assigned to channel" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const unassignDestMutation = useMutation({
    mutationFn: (destId: number) =>
      apiFetch(`/destinations/${destId}`, {
        method: "PATCH",
        body: JSON.stringify({ channelId: null }),
      }),
    onSuccess: () => { refetchDests(); toast({ title: "Destination removed from channel" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const toggleLoopMutation = useMutation({
    mutationFn: (loop: boolean) =>
      apiFetch(`/channels/${channelId}`, {
        method: "PATCH",
        body: JSON.stringify({ loopPlaylist: loop }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel", channelId] });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const toggleDestMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/destinations/${id}/toggle`, { method: "POST" }),
    onSuccess: () => { refetchDests(); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const scheduleMutation = useMutation({
    mutationFn: (body: {
      scheduleEnabled?: boolean;
      scheduleTimezone?: string;
      scheduleStartTime?: string | null;
      scheduleStopTime?: string | null;
      scheduleDays?: number[];
    }) =>
      apiFetch(`/channels/${channelId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel", channelId] });
      toast({ title: "Schedule updated" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const handleSwitchSource = () => {
    const mode = selectedSourceMode || channel?.sourceMode;
    if (mode === "playlist" && switchPlaylist) {
      switchMutation.mutate({ sourceMode: "playlist", playlistId: Number(switchPlaylist) });
    } else if (mode === "live_input" && switchLiveInput) {
      switchMutation.mutate({ sourceMode: "live_input", liveInputId: Number(switchLiveInput) });
    } else if (mode === "single_asset" && switchAsset) {
      switchMutation.mutate({ sourceMode: "single_asset", assetId: Number(switchAsset) });
    } else if (mode === "fallback") {
      switchMutation.mutate({ sourceMode: "fallback" });
    }
  };

  const activeSourceMode = selectedSourceMode || channel?.sourceMode || "playlist";

  if (isLoading || !channel) {
    return (
      <AppShell>
        <div className="flex justify-center py-20"><Spinner className="size-8" /></div>
      </AppShell>
    );
  }

  const isLive = channel.status === "on_air" || channel.status === "live";
  const isError = channel.status === "error";
  const canStart = channel.status === "idle" || isError;
  const canStop = isLive || channel.status === "starting" || isError;

  return (
    <AppShell>
      <div className="space-y-6">
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4" />Stream Health
              </CardTitle>
              {isLive && <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin" style={{ animationDuration: "5s" }} />}
            </CardHeader>
            <CardContent>
              {channel.status === "error" ? (
                <div className="py-6 text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 mb-3">
                    <Activity className="w-6 h-6 text-red-500" />
                  </div>
                  <p className="text-sm font-medium text-red-400 mb-1">Stream Failed</p>
                  <p className="text-xs text-muted-foreground">
                    {channel.activeJob?.errorMessage || "The stream encountered an error and was stopped."}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">Click Start to restart the channel.</p>
                </div>
              ) : isLive ? (() => {
                const jobBitrate = channel.activeJob?.bitrate;
                const jobFps = channel.activeJob?.fps;
                const jobStarted = channel.activeJob?.startedAt;
                const uptimeSec = jobStarted ? Math.floor((Date.now() - new Date(jobStarted).getTime()) / 1000) : null;
                const destHealth = channel.activeJob?.destinationHealth;
                const jobDests = (channel.activeJob?.destinations ?? []) as Array<{id: number; name: string; platform: string}>;
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-6">
                      <div>
                        <p className="text-xs text-muted-foreground">Bitrate</p>
                        <p className="text-2xl font-mono font-bold">
                          {jobBitrate ? `${Math.round(jobBitrate / 1000)}k` : "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">kbps</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">FPS</p>
                        <p className="text-2xl font-mono font-bold">{jobFps ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">frames/sec</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Uptime</p>
                        <p className="text-2xl font-mono font-bold">{uptimeSec != null ? formatUptime(uptimeSec) : "—"}</p>
                        <p className="text-xs text-muted-foreground">duration</p>
                      </div>
                    </div>

                    {jobDests.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-border/50">
                        <p className="text-xs text-muted-foreground font-medium">Destination Status</p>
                        <div className="space-y-1.5">
                          {jobDests.map((d) => {
                            const health = destHealth?.[String(d.id)];
                            const isConnected = health?.status === "connected";
                            const isError = health?.status === "error";
                            const statusColor = isError ? "text-red-400" : isConnected ? "text-green-400" : "text-yellow-400";
                            const isConnecting = health?.status === "connecting";
                            const statusLabel = isError ? "Error" : isConnected ? "Connected" : isConnecting ? "Connecting" : "Pending";
                            const platformIcons: Record<string, string> = {
                              youtube: "▶",
                              facebook: "f",
                              twitch: "⬡",
                              custom_rtmp: "◉",
                            };
                            return (
                              <div key={d.id} className="flex items-center justify-between rounded-md bg-accent/20 px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs w-5 text-center opacity-60">{platformIcons[d.platform] ?? "◉"}</span>
                                  <span className="text-sm font-medium">{d.name}</span>
                                  <span className="text-[10px] uppercase text-muted-foreground px-1.5 py-0.5 rounded bg-accent/40">{d.platform}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {jobBitrate ? (
                                    <span className="text-xs font-mono text-muted-foreground">{Math.round(jobBitrate / 1000)}k</span>
                                  ) : null}
                                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${statusColor}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${isError ? "bg-red-400" : isConnected ? "bg-green-400 animate-pulse" : "bg-yellow-400"}`} />
                                    {statusLabel}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })() : (
                <div className="py-6 text-center text-muted-foreground">
                  <Tv2 className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Channel is {channel.status}. Start the channel to see stream stats.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <ChannelOutputPreview channelId={channelId!} isLive={isLive} />
        </div>

        {channel.activeJob && (
          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-500" />
                Playout Job #{channel.activeJob.id}
                <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  channel.activeJob.status === "running" ? "bg-green-500/20 text-green-400" :
                  channel.activeJob.status === "pending" ? "bg-yellow-500/20 text-yellow-400" :
                  "bg-gray-500/20 text-gray-400"
                }`}>
                  {channel.activeJob.status.toUpperCase()}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Source</p>
                  <p className="font-mono text-xs break-all">
                    {channel.sourceMode === "playlist" && channel.playlist
                      ? `Playlist: ${channel.playlist.name}`
                      : channel.sourceMode === "live_input" && channel.liveInput
                      ? `Live: ${channel.liveInput.name}`
                      : channel.sourceMode === "single_asset" && channel.activeAsset
                      ? `Asset: ${channel.activeAsset.name}`
                      : channel.sourceMode === "fallback"
                      ? "Fallback Slate"
                      : channel.activeJob.sourceRef}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Worker</p>
                  <p className="font-mono text-xs">{channel.activeJob.workerId ?? "Awaiting worker..."}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Destinations ({(channel.activeJob.destinations as Array<{id:number;name:string;platform:string}>).length})</p>
                <div className="flex flex-wrap gap-1">
                  {(channel.activeJob.destinations as Array<{id:number;name:string;platform:string}>).map((d) => (
                    <span key={d.id} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-accent/50 font-medium">
                      {d.platform} - {d.name}
                    </span>
                  ))}
                </div>
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">FFmpeg Command</summary>
                <pre className="mt-1 p-2 bg-black/30 rounded text-green-400 font-mono text-[10px] overflow-x-auto whitespace-pre-wrap break-all">
                  {channel.activeJob.ffmpegCommand}
                </pre>
              </details>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Source Control</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Current Mode</Label>
                <p className="text-sm font-medium capitalize">{channel.sourceMode.replace("_", " ")}</p>
              </div>

              {channel.sourceMode === "playlist" && channel.playlist && (
                <div className="rounded-md bg-accent/30 p-3 space-y-2">
                  <div className="text-xs text-muted-foreground">Active Playlist</div>
                  <div className="font-medium text-sm">{channel.playlist.name}</div>
                  <div className="flex items-center justify-between pt-1 border-t border-border/30">
                    <Label className="text-xs text-muted-foreground">Loop Playlist</Label>
                    <Switch
                      checked={channel.loopPlaylist !== false}
                      onCheckedChange={(checked) => toggleLoopMutation.mutate(checked)}
                      disabled={toggleLoopMutation.isPending}
                    />
                  </div>
                </div>
              )}

              {channel.sourceMode === "live_input" && channel.liveInput && (
                <div className="rounded-md bg-accent/30 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">Active Live Input</div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        <Radio className="w-3.5 h-3.5 text-primary" />
                        {channel.liveInput.name}
                        <Badge variant="outline" className="text-[10px] uppercase">{channel.liveInput.protocol}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">Ingest URL</div>
                  <code className="text-[11px] bg-muted rounded px-1.5 py-0.5 block truncate">{channel.liveInput.ingestUrl}</code>
                </div>
              )}

              {channel.sourceMode === "live_input" && !channel.liveInput && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-xs text-destructive">No live input selected. Choose one below.</p>
                </div>
              )}

              {channel.sourceMode === "single_asset" && channel.activeAsset && (
                <div className="rounded-md bg-accent/30 p-3 space-y-2">
                  <div className="text-xs text-muted-foreground">Active Asset</div>
                  <div className="font-medium text-sm">{channel.activeAsset.name}</div>
                  <div className="flex items-center justify-between pt-1 border-t border-border/30">
                    <Label className="text-xs text-muted-foreground">Loop Asset</Label>
                    <Switch
                      checked={channel.loopPlaylist !== false}
                      onCheckedChange={(checked) => toggleLoopMutation.mutate(checked)}
                      disabled={toggleLoopMutation.isPending}
                    />
                  </div>
                </div>
              )}

              {channel.sourceMode === "single_asset" && !channel.activeAsset && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-xs text-destructive">No asset selected. Choose one below.</p>
                </div>
              )}

              {channel.sourceMode === "fallback" && (
                <div className="rounded-md bg-accent/30 p-3">
                  <div className="text-xs text-muted-foreground">Broadcasting fallback slate</div>
                </div>
              )}

              <div className="border-t border-border pt-4 space-y-3">
                <Label className="text-xs font-medium">Switch Source</Label>
                <Select
                  value={activeSourceMode}
                  onValueChange={(v) => {
                    setSelectedSourceMode(v);
                    setSwitchPlaylist("");
                    setSwitchLiveInput("");
                    setSwitchAsset("");
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="playlist">Playlist</SelectItem>
                    <SelectItem value="single_asset">Single Asset</SelectItem>
                    <SelectItem value="live_input">Live Input</SelectItem>
                    <SelectItem value="fallback">Fallback Slate</SelectItem>
                  </SelectContent>
                </Select>

                {activeSourceMode === "playlist" && (
                  <div className="space-y-2">
                    <Label className="text-xs">Select Playlist</Label>
                    <Select value={switchPlaylist} onValueChange={setSwitchPlaylist}>
                      <SelectTrigger><SelectValue placeholder="Choose playlist…" /></SelectTrigger>
                      <SelectContent>
                        {playlists.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {activeSourceMode === "live_input" && (
                  <div className="space-y-2">
                    <Label className="text-xs">Select Live Input</Label>
                    <Select value={switchLiveInput} onValueChange={setSwitchLiveInput}>
                      <SelectTrigger><SelectValue placeholder="Choose live input…" /></SelectTrigger>
                      <SelectContent>
                        {liveInputs.map((li) => (
                          <SelectItem key={li.id} value={String(li.id)}>
                            <div className="flex items-center gap-2">
                              <Radio className="w-3 h-3" />
                              <span>{li.name}</span>
                              <Badge variant="outline" className="text-[10px] uppercase ml-1">{li.protocol}</Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {liveInputs.length === 0 && (
                      <p className="text-xs text-muted-foreground">No live inputs configured. Create one on the Live Inputs page.</p>
                    )}
                  </div>
                )}

                {activeSourceMode === "single_asset" && (
                  <div className="space-y-2">
                    <Label className="text-xs">Select Asset</Label>
                    <Select value={switchAsset} onValueChange={setSwitchAsset}>
                      <SelectTrigger><SelectValue placeholder="Choose asset…" /></SelectTrigger>
                      <SelectContent>
                        {allAssets.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {allAssets.length === 0 && (
                      <p className="text-xs text-muted-foreground">No assets uploaded. Upload files on the Assets page.</p>
                    )}
                  </div>
                )}

                {activeSourceMode === "fallback" && (
                  <p className="text-xs text-muted-foreground">Will broadcast the fallback slate until switched to another source.</p>
                )}

                <Button
                  size="sm"
                  className="w-full"
                  disabled={
                    switchMutation.isPending ||
                    (activeSourceMode === "playlist" && !switchPlaylist) ||
                    (activeSourceMode === "live_input" && !switchLiveInput) ||
                    (activeSourceMode === "single_asset" && !switchAsset)
                  }
                  onClick={handleSwitchSource}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-2" />
                  {switchMutation.isPending ? "Switching…" : "Switch Source"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="w-4 h-4" />
                Output Destinations
              </CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setAddDestOpen(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" />Assign
                </Button>
                <Button size="sm" variant="outline" onClick={() => setCreateDestOpen(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" />New
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {channelDests.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Send className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No destinations assigned to this channel.</p>
                  <p className="text-xs mt-1">Assign existing presets or create a new destination.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {channelDests.map((dest) => (
                    <div key={dest.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/30">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Switch
                          checked={dest.isActive}
                          onCheckedChange={() => toggleDestMutation.mutate(dest.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{dest.name}</span>
                            <Badge variant="outline" className="capitalize text-[10px] shrink-0">{dest.platform}</Badge>
                          </div>
                          <code className="text-[11px] text-muted-foreground truncate block">{dest.streamUrl}</code>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 ml-2 text-xs"
                        onClick={() => { if (confirm("Remove this destination from the channel?")) unassignDestMutation.mutate(dest.id); }}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Stream Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Enable Scheduling</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Auto-start and stop this channel at set times</p>
              </div>
              <Switch
                checked={channel.scheduleEnabled ?? false}
                onCheckedChange={(checked) => scheduleMutation.mutate({ scheduleEnabled: checked })}
              />
            </div>

            {channel.scheduleEnabled && (
              <div className="space-y-4 pt-2 border-t border-border/50">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Timezone</Label>
                  <Select
                    value={channel.scheduleTimezone || user?.timezone || "UTC"}
                    onValueChange={(v) => scheduleMutation.mutate({ scheduleTimezone: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_TIMEZONES.map((tz) => {
                        let label = tz;
                        try {
                          const now = new Date();
                          const short = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
                            .formatToParts(now)
                            .find((p) => p.type === "timeZoneName")?.value;
                          if (short) label = `${tz.replace(/_/g, " ")} (${short})`;
                        } catch {}
                        return <SelectItem key={tz} value={tz}>{label}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Start Time</Label>
                    <Input
                      type="time"
                      value={channel.scheduleStartTime ?? ""}
                      onChange={(e) => scheduleMutation.mutate({ scheduleStartTime: e.target.value || null })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Stop Time</Label>
                    <Input
                      type="time"
                      value={channel.scheduleStopTime ?? ""}
                      onChange={(e) => scheduleMutation.mutate({ scheduleStopTime: e.target.value || null })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Active Days
                  </Label>
                  <p className="text-xs text-muted-foreground">Select which days the schedule runs. Leave all unchecked for every day.</p>
                  <div className="flex gap-1.5">
                    {DAY_NAMES.map((dayName, idx) => {
                      const days = channel.scheduleDays ?? [];
                      const isActive = days.includes(idx);
                      return (
                        <button
                          key={idx}
                          className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "bg-accent/50 text-muted-foreground hover:bg-accent"
                          }`}
                          onClick={() => {
                            const newDays = isActive
                              ? days.filter((d: number) => d !== idx)
                              : [...days, idx].sort();
                            scheduleMutation.mutate({ scheduleDays: newDays });
                          }}
                        >
                          {dayName}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {channel.scheduleStartTime && channel.scheduleStopTime && (
                  <div className="rounded-md bg-accent/30 p-3 space-y-1">
                    <p className="text-xs font-medium flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      Schedule Summary
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Stream will auto-start at <span className="font-mono font-medium text-foreground">{channel.scheduleStartTime}</span> and
                      stop at <span className="font-mono font-medium text-foreground">{channel.scheduleStopTime}</span>
                      {" "}({channel.scheduleTimezone || "UTC"})
                      {(channel.scheduleDays ?? []).length > 0 && (
                        <span> on {(channel.scheduleDays ?? []).map((d: number) => DAY_NAMES[d]).join(", ")}</span>
                      )}
                      {(channel.scheduleDays ?? []).length === 0 && <span> every day</span>}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={addDestOpen} onOpenChange={setAddDestOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Existing Destination</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            {(() => {
              const channelDestIds = new Set(channelDests.map((d) => d.id));
              const available = allDests.filter((d) => !channelDestIds.has(d.id));
              if (available.length === 0) {
                return (
                  <div className="py-6 text-center text-muted-foreground">
                    <p className="text-sm">No unassigned destinations available.</p>
                    <p className="text-xs mt-1">Create a new destination preset first.</p>
                  </div>
                );
              }
              return available.map((dest) => (
                <div key={dest.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/30">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{dest.name}</span>
                      <Badge variant="outline" className="capitalize text-[10px]">{dest.platform}</Badge>
                    </div>
                    <code className="text-[11px] text-muted-foreground truncate block">{dest.streamUrl}</code>
                  </div>
                  <Button
                    size="sm"
                    className="shrink-0 ml-3"
                    disabled={assignDestMutation.isPending}
                    onClick={() => assignDestMutation.mutate(dest.id)}
                  >
                    Assign
                  </Button>
                </div>
              ));
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDestOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createDestOpen} onOpenChange={setCreateDestOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Destination Preset</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={destForm.name} onChange={(e) => setDestForm({ ...destForm, name: e.target.value })} placeholder="YouTube Main" />
            </div>
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={destForm.platform} onValueChange={(v) => setDestForm({ ...destForm, platform: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rtmp">RTMP</SelectItem>
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Stream URL</Label>
              <Input value={destForm.streamUrl} onChange={(e) => setDestForm({ ...destForm, streamUrl: e.target.value })} placeholder="rtmp://a.rtmp.youtube.com/live2" />
            </div>
            <div className="space-y-2">
              <Label>Stream Key</Label>
              <Input value={destForm.streamKey} onChange={(e) => setDestForm({ ...destForm, streamKey: e.target.value })} placeholder="xxxx-xxxx-xxxx-xxxx" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDestOpen(false)}>Cancel</Button>
            <Button
              disabled={!destForm.name || !destForm.streamUrl || createDestMutation.isPending}
              onClick={() => createDestMutation.mutate(destForm)}
            >
              {createDestMutation.isPending ? "Creating…" : "Create Destination"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
