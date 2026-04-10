import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Radio, Plus, Trash2, Copy, Check, Wifi, WifiOff, MonitorPlay, Activity, Server } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { apiBase } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface LiveInput {
  id: number;
  name: string;
  protocol: string;
  streamKey: string;
  status: string;
  ingestUrl?: string;
  createdAt: string;
}

interface SrsInputStatus {
  inputId: number;
  inputName: string;
  streamKey: string;
  protocol: string;
  srs: {
    isLive: boolean;
    bitrate_kbps: number;
    clients: number;
    video?: { codec: string; width: number; height: number };
    audio?: { codec: string; sample_rate: number; channels: number };
  } | null;
}

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
  const copy = () => {
    copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
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

function SrsHealthCard({ health }: { health: SrsHealth }) {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Server className="w-4 h-4" />
          SRS Ingest Server
          {health.reachable ? (
            <Badge variant="default" className="ml-auto bg-green-600 text-xs">Online</Badge>
          ) : (
            <Badge variant="destructive" className="ml-auto text-xs">Unreachable</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {health.reachable ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Version</div>
              <div className="font-mono font-medium">{health.version ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Uptime</div>
              <div className="font-medium">{health.uptime ? formatUptime(health.uptime) : "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Active Streams</div>
              <div className="font-medium">{health.active_streams}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Total Ingest</div>
              <div className="font-medium">{formatBitrate(health.total_recv_kbps)}</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Cannot reach SRS API.{" "}
            {health.error && <span className="text-destructive">{health.error}</span>}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StreamStatusBadge({ srs }: { srs: SrsInputStatus["srs"] }) {
  if (!srs) {
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <WifiOff className="w-3.5 h-3.5" />
        <span className="text-xs">No stream</span>
      </div>
    );
  }

  if (!srs.isLive) {
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <WifiOff className="w-3.5 h-3.5" />
        <span className="text-xs">Inactive</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-green-500">
      <Wifi className="w-3.5 h-3.5 animate-pulse" />
      <span className="text-xs font-medium">Live</span>
    </div>
  );
}

function StreamDetails({ srs }: { srs: NonNullable<SrsInputStatus["srs"]> }) {
  if (!srs.isLive) return null;

  return (
    <div className="mt-3 rounded-md bg-green-500/5 border border-green-500/20 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="w-3.5 h-3.5 text-green-500" />
        <span className="text-xs font-medium text-green-400">Stream Active</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <span className="text-muted-foreground">Bitrate</span>
          <div className="font-mono font-medium">{formatBitrate(srs.bitrate_kbps)}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Clients</span>
          <div className="font-mono font-medium">{srs.clients}</div>
        </div>
        {srs.video && (
          <div>
            <span className="text-muted-foreground">Video</span>
            <div className="font-mono font-medium">{srs.video.codec} {srs.video.width}×{srs.video.height}</div>
          </div>
        )}
        {srs.audio && (
          <div>
            <span className="text-muted-foreground">Audio</span>
            <div className="font-mono font-medium">{srs.audio.codec} {srs.audio.sample_rate / 1000}kHz</div>
          </div>
        )}
      </div>
    </div>
  );
}

function FlvPreview({ streamKey }: { streamKey: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: previewUrls } = useQuery<{ flv: string; hls: string; whep: string }>({
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
          setError("FLV playback not supported in this browser.");
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
    <div className="h-full flex flex-col">
      {!error ? (
        <div className="flex-1 bg-black rounded-lg overflow-hidden min-h-0">
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            muted
            playsInline
            controls
          />
        </div>
      ) : (
        <div className="flex-1 bg-muted/30 rounded-lg flex flex-col items-center justify-center gap-2 min-h-[120px]">
          <MonitorPlay className="w-8 h-8 text-muted-foreground/20" />
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      )}
      {flvUrl && (
        <div className="mt-1.5 text-xs text-muted-foreground bg-muted rounded px-2 py-1 flex items-center gap-2">
          <code className="truncate flex-1">{flvUrl}</code>
          <CopyButton text={flvUrl} />
        </div>
      )}
    </div>
  );
}

export default function LiveInputsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", protocol: "rtmp" });

  const { data: inputs = [], isLoading } = useQuery<LiveInput[]>({
    queryKey: ["live-inputs"],
    queryFn: () => apiFetch("/live-inputs"),
    refetchInterval: 10000,
  });

  const { data: srsHealth } = useQuery<SrsHealth>({
    queryKey: ["srs-health"],
    queryFn: () => apiFetch("/srs/health"),
    refetchInterval: 15000,
  });

  const { data: inputStatuses = [] } = useQuery<SrsInputStatus[]>({
    queryKey: ["srs-input-status"],
    queryFn: () => apiFetch("/srs/input-status"),
    refetchInterval: 5000,
  });

  const srsStatusMap = new Map(inputStatuses.map((s) => [s.inputId, s]));

  const createMutation = useMutation({
    mutationFn: (body: typeof form) => apiFetch<LiveInput>("/live-inputs", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setCreateOpen(false);
      setForm({ name: "", protocol: "rtmp" });
      qc.invalidateQueries({ queryKey: ["live-inputs"] });
      setTimeout(() => toast({ title: "Live input created" }), 100);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/live-inputs/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["live-inputs"] }); toast({ title: "Input deleted" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Live Inputs</h1>
            <p className="text-muted-foreground text-sm mt-1">RTMP and SRT ingest endpoints</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />New Input
          </Button>
        </div>

        {srsHealth && <SrsHealthCard health={srsHealth} />}

        {isLoading && <div className="flex justify-center py-20"><Spinner className="size-8" /></div>}

        {!isLoading && inputs.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center">
              <Radio className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">No live inputs yet. Create one to receive RTMP or SRT streams.</p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4">
          {inputs.map((input) => {
            const srsStatus = srsStatusMap.get(input.id);
            return (
              <Card key={input.id}>
                <CardContent className="p-5">
                  <div className="grid grid-cols-[1fr_1fr] gap-5 items-stretch">
                    <div className="flex flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
                            {srsStatus?.srs?.isLive ? (
                              <MonitorPlay className="w-5 h-5 text-green-500" />
                            ) : (
                              <Radio className="w-5 h-5 text-primary" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{input.name}</span>
                              <Badge variant="outline" className="text-xs uppercase">{input.protocol}</Badge>
                              <StreamStatusBadge srs={srsStatus?.srs ?? null} />
                            </div>
                          </div>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => { if (confirm("Delete input?")) deleteMutation.mutate(input.id); }}>
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </div>
                      {input.ingestUrl && (
                        <div className="mt-3 space-y-1">
                          <div className="text-xs text-muted-foreground">Ingest URL</div>
                          <div className="flex items-center gap-2 bg-muted rounded px-2 py-1">
                            <code className="text-xs flex-1 truncate">{input.ingestUrl}</code>
                            <CopyButton text={input.ingestUrl} />
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">Stream Key</div>
                          <div className="flex items-center gap-2 bg-muted rounded px-2 py-1">
                            <code className="text-xs flex-1 font-mono">{input.streamKey}</code>
                            <CopyButton text={input.streamKey} />
                          </div>
                        </div>
                      )}
                      {srsStatus?.srs && <StreamDetails srs={srsStatus.srs} />}
                    </div>
                    <FlvPreview streamKey={input.streamKey} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Live Input</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Studio Camera 1" />
            </div>
            <div className="space-y-2">
              <Label>Protocol</Label>
              <Select value={form.protocol} onValueChange={(v) => setForm({ ...form, protocol: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rtmp">RTMP</SelectItem>
                  <SelectItem value="srt">SRT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={!form.name || createMutation.isPending} onClick={() => createMutation.mutate(form)}>
              {createMutation.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
