import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Play, Square, ChevronLeft, RefreshCw, Activity, Tv2, Radio, Copy, Check, Eye, EyeOff } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { apiBase } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface LiveInput {
  id: number;
  name: string;
  protocol: string;
  status: string;
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
  activeJobId?: number;
  bitrate?: number;
  fps?: number;
  uptimeSeconds?: number;
  workerNodeId?: string;
  playlist?: { id: number; name: string };
  liveInput?: { id: number; name: string; protocol: string; streamKey: string; ingestUrl: string; status: string };
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

interface PreviewUrls {
  flv: string;
  hls: string;
  whep: string;
}

function LivePreviewCard({ streamKey, inputName }: { streamKey: string; inputName: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const { data: previewUrls } = useQuery<PreviewUrls>({
    queryKey: ["srs-preview", streamKey],
    queryFn: () => apiFetch(`/srs/preview-url/${streamKey}`),
    enabled: !!streamKey,
  });

  useEffect(() => {
    if (!showPreview || !previewUrls || !videoRef.current) return;

    let hls: any = null;
    setPreviewError(null);

    const initPlayer = async () => {
      const Hls = (await import("hls.js")).default;

      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 6,
          liveDurationInfinity: true,
          manifestLoadingTimeOut: 10000,
          manifestLoadingMaxRetry: 3,
        });

        hls.loadSource(previewUrls.hls);
        hls.attachMedia(videoRef.current!);
        hls.on(Hls.Events.ERROR, (_e: any, data: any) => {
          if (data.fatal) {
            setPreviewError("Stream not available. Make sure a stream is publishing to this input.");
            hls.destroy();
          }
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          videoRef.current?.play().catch(() => {});
        });
        hlsRef.current = hls;
      } else if (videoRef.current!.canPlayType("application/vnd.apple.mpegurl")) {
        videoRef.current!.src = previewUrls.hls;
        videoRef.current!.addEventListener("loadedmetadata", () => {
          videoRef.current?.play().catch(() => {});
        });
      } else {
        setPreviewError("HLS playback is not supported in this browser.");
      }
    };

    initPlayer();

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [showPreview, previewUrls]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Eye className="w-4 h-4" />
          Live Preview
        </CardTitle>
        <Button
          size="sm"
          variant={showPreview ? "destructive" : "default"}
          onClick={() => {
            setShowPreview(!showPreview);
            setPreviewError(null);
          }}
        >
          {showPreview ? (
            <><EyeOff className="w-3.5 h-3.5 mr-2" />Stop Preview</>
          ) : (
            <><Eye className="w-3.5 h-3.5 mr-2" />Start Preview</>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {!showPreview && (
          <div className="aspect-video bg-muted/30 rounded-lg flex flex-col items-center justify-center gap-2">
            <Tv2 className="w-10 h-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">Click "Start Preview" to watch <span className="font-medium">{inputName}</span></p>
            <p className="text-xs text-muted-foreground">Preview uses HLS — expect 5-10 seconds latency</p>
          </div>
        )}
        {showPreview && previewError && (
          <div className="aspect-video bg-muted/30 rounded-lg flex flex-col items-center justify-center gap-2">
            <EyeOff className="w-10 h-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">{previewError}</p>
          </div>
        )}
        {showPreview && !previewError && (
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              className="w-full h-full"
              muted
              autoPlay
              playsInline
              controls
            />
          </div>
        )}
        {previewUrls && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div className="bg-muted rounded p-2">
              <span className="text-muted-foreground">HLS</span>
              <code className="block truncate mt-0.5">{previewUrls.hls}</code>
            </div>
            <div className="bg-muted rounded p-2">
              <span className="text-muted-foreground">HTTP-FLV</span>
              <code className="block truncate mt-0.5">{previewUrls.flv}</code>
            </div>
            <div className="bg-muted rounded p-2">
              <span className="text-muted-foreground">WebRTC (WHEP)</span>
              <code className="block truncate mt-0.5">{previewUrls.whep}</code>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ChannelDetailPage() {
  const [, params] = useRoute("/channels/:id");
  const channelId = params?.id;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedSourceMode, setSelectedSourceMode] = useState("");
  const [switchPlaylist, setSwitchPlaylist] = useState("");
  const [switchLiveInput, setSwitchLiveInput] = useState("");

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

  const handleSwitchSource = () => {
    const mode = selectedSourceMode || channel?.sourceMode;
    if (mode === "playlist" && switchPlaylist) {
      switchMutation.mutate({ sourceMode: "playlist", playlistId: Number(switchPlaylist) });
    } else if (mode === "live_input" && switchLiveInput) {
      switchMutation.mutate({ sourceMode: "live_input", liveInputId: Number(switchLiveInput) });
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
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Current Mode</Label>
                <p className="text-sm font-medium capitalize">{channel.sourceMode.replace("_", " ")}</p>
              </div>

              {channel.sourceMode === "playlist" && channel.playlist && (
                <div className="rounded-md bg-accent/30 p-3 space-y-1">
                  <div className="text-xs text-muted-foreground">Active Playlist</div>
                  <div className="font-medium text-sm">{channel.playlist.name}</div>
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
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="playlist">Playlist</SelectItem>
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

                {activeSourceMode === "fallback" && (
                  <p className="text-xs text-muted-foreground">Will broadcast the fallback slate until switched to another source.</p>
                )}

                <Button
                  size="sm"
                  className="w-full"
                  disabled={
                    switchMutation.isPending ||
                    (activeSourceMode === "playlist" && !switchPlaylist) ||
                    (activeSourceMode === "live_input" && !switchLiveInput)
                  }
                  onClick={handleSwitchSource}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-2" />
                  {switchMutation.isPending ? "Switching…" : "Switch Source"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live Preview */}
        {channel.sourceMode === "live_input" && channel.liveInput && (
          <LivePreviewCard streamKey={channel.liveInput.streamKey} inputName={channel.liveInput.name} />
        )}

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
