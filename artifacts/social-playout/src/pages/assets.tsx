import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Film, Trash2, Upload, Image, Music, FileVideo, Radio, Eye } from "lucide-react";
import { useState, useRef } from "react";
import { apiBase } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface RawAsset {
  id: number;
  name: string;
  filename?: string;
  duration?: number;
  filePath?: string;
  fileSize?: number;
  mimeType?: string;
  status: string;
  createdAt: string;
}

interface Asset extends RawAsset {
  type: string;
  previewUrl?: string;
}

function deriveAssetType(a: RawAsset): string {
  if (a.mimeType === "rtmp" || a.mimeType === "m3u8") return "stream";
  if (a.mimeType?.startsWith("video/")) return "video";
  if (a.mimeType?.startsWith("audio/")) return "audio";
  if (a.mimeType?.startsWith("image/")) return "image";
  const fp = (a.filePath ?? a.filename ?? "").toLowerCase();
  if (fp.endsWith(".mp4") || fp.endsWith(".mov") || fp.endsWith(".mkv") || fp.endsWith(".avi") || fp.endsWith(".webm") || fp.endsWith(".ts")) return "video";
  if (fp.endsWith(".mp3") || fp.endsWith(".wav") || fp.endsWith(".flac") || fp.endsWith(".aac") || fp.endsWith(".ogg")) return "audio";
  if (fp.endsWith(".jpg") || fp.endsWith(".jpeg") || fp.endsWith(".png") || fp.endsWith(".gif") || fp.endsWith(".webp") || fp.endsWith(".bmp") || fp.endsWith(".svg")) return "image";
  if (fp.endsWith(".m3u8")) return "stream";
  return "video";
}

function resolvePreviewUrl(a: RawAsset): string | undefined {
  if (!a.filePath) return undefined;
  if (a.filePath.startsWith("http://") || a.filePath.startsWith("https://") || a.filePath.startsWith("rtmp://") || a.filePath.startsWith("rtmps://")) {
    return a.filePath;
  }
  if (a.filePath.startsWith("/api/")) {
    return `${apiBase()}${a.filePath.replace(/^\/api/, "")}`;
  }
  return a.filePath;
}

function enrichAsset(raw: RawAsset): Asset {
  return { ...raw, type: deriveAssetType(raw), previewUrl: resolvePreviewUrl(raw) };
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

function AssetIcon({ type }: { type: string }) {
  if (type === "image") return <Image className="w-5 h-5 text-blue-400" />;
  if (type === "audio") return <Music className="w-5 h-5 text-green-400" />;
  if (type === "stream") return <Radio className="w-5 h-5 text-red-400" />;
  return <FileVideo className="w-5 h-5 text-purple-400" />;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatDuration(secs?: number): string {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function detectMediaType(mime: string): string {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  return "video";
}

export default function AssetsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const [streamOpen, setStreamOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [streamForm, setStreamForm] = useState({
    name: "",
    url: "",
    protocol: "rtmp" as "rtmp" | "m3u8",
  });

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: assets = [], isLoading } = useQuery<Asset[]>({
    queryKey: ["assets"],
    queryFn: async () => {
      const raw = await apiFetch<RawAsset[]>("/assets");
      return raw.map(enrichAsset);
    },
  });

  const streamMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch<Asset>("/assets", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setStreamOpen(false);
      setStreamForm({ name: "", url: "", protocol: "rtmp" });
      qc.invalidateQueries({ queryKey: ["assets"] });
      setTimeout(() => toast({ title: "Stream added" }), 100);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/assets/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assets"] }); toast({ title: "Asset deleted" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  async function handleFileUpload(file: File) {
    setUploading(true);
    setUploadProgress(0);
    setUploadFileName(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await new Promise<{ objectPath: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${apiBase()}/storage/upload`, true);

        const token = localStorage.getItem("auth_token");
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        });

        xhr.addEventListener("error", () => reject(new Error("Upload failed")));
        xhr.send(formData);
      });

      const servingUrl = `${apiBase()}/storage${uploadRes.objectPath}`;
      const mediaType = detectMediaType(file.type);
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");

      await apiFetch("/assets", {
        method: "POST",
        body: JSON.stringify({
          name: nameWithoutExt,
          type: mediaType,
          filePath: servingUrl,
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
        }),
      });

      qc.invalidateQueries({ queryKey: ["assets"] });
      setUploadOpen(false);
      toast({ title: "Asset uploaded", description: file.name });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const filtered = assets.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Asset Library</h1>
            <p className="text-muted-foreground text-sm mt-1">{assets.length} assets registered</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setUploadOpen(true)} variant="default">
              <Upload className="w-4 h-4 mr-2" />Upload File
            </Button>
            <Button onClick={() => setStreamOpen(true)} variant="outline">
              <Radio className="w-4 h-4 mr-2" />Add Stream
            </Button>
          </div>
        </div>

        <div className="flex gap-3">
          <Input
            placeholder="Search assets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>

        {isLoading && <div className="flex justify-center py-20"><Spinner className="size-8" /></div>}

        {!isLoading && filtered.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center">
              <Film className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">No assets found. Upload a media file to get started.</p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3">
          {filtered.map((asset) => (
            <Card key={asset.id} className="hover:border-primary/20 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
                    <AssetIcon type={asset.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{asset.name}</div>
                    <div className="text-xs text-muted-foreground flex gap-3 mt-0.5">
                      <span className="capitalize">{asset.type}</span>
                      {asset.type === "stream" && asset.mimeType && (
                        <span className="uppercase font-mono text-[10px] bg-accent/50 px-1 rounded">{asset.mimeType}</span>
                      )}
                      {asset.filePath && <span className="truncate max-w-xs font-mono">{asset.filePath}</span>}
                      {asset.type !== "stream" && <span>{formatDuration(asset.duration)}</span>}
                      {asset.type !== "stream" && <span>{formatBytes(asset.fileSize)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={asset.status === "ready" ? "default" : "secondary"} className="capitalize">
                      {asset.status}
                    </Badge>
                    {asset.filePath && (
                      <Button size="icon" variant="ghost" onClick={() => setPreviewAsset(asset)} title="Preview">
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => { if (confirm("Delete asset?")) deleteMutation.mutate(asset.id); }}>
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={uploadOpen} onOpenChange={(open) => { if (!uploading) setUploadOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Media File</DialogTitle>
            <DialogDescription>Select a video, audio, or image file to upload to your asset library.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {uploading ? (
              <div className="space-y-3 py-4">
                <div className="text-sm text-muted-foreground text-center">{uploadFileName}</div>
                <Progress value={uploadProgress} className="h-2" />
                <div className="text-xs text-muted-foreground text-center">{uploadProgress}% uploaded</div>
              </div>
            ) : (
              <div
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-sm font-medium">Click to select a file</p>
                <p className="text-xs text-muted-foreground mt-1">
                  MP4, MOV, MKV, MP3, WAV, JPG, PNG — up to 500 MB
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="video/*,audio/*,image/*,.mp4,.mov,.mkv,.avi,.mp3,.wav,.flac,.jpg,.jpeg,.png,.bmp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                />
              </div>
            )}
          </div>
          {!uploading && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewAsset} onOpenChange={(open) => { if (!open) setPreviewAsset(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {previewAsset && <AssetIcon type={previewAsset.type} />}
              {previewAsset?.name}
            </DialogTitle>
            <DialogDescription>
              {previewAsset?.type === "stream"
                ? `${(previewAsset.mimeType ?? "").toUpperCase()} stream preview`
                : `${previewAsset?.type ?? "media"} preview`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {previewAsset?.type === "video" && previewAsset.previewUrl && (
              <video
                key={previewAsset.id}
                src={previewAsset.previewUrl}
                controls
                autoPlay
                className="w-full rounded-lg bg-black max-h-[500px]"
              />
            )}
            {previewAsset?.type === "audio" && previewAsset.previewUrl && (
              <div className="flex flex-col items-center gap-4 py-8">
                <Music className="w-16 h-16 text-green-400/40" />
                <audio
                  key={previewAsset.id}
                  src={previewAsset.previewUrl}
                  controls
                  autoPlay
                  className="w-full"
                />
              </div>
            )}
            {previewAsset?.type === "image" && previewAsset.previewUrl && (
              <img
                key={previewAsset.id}
                src={previewAsset.previewUrl}
                alt={previewAsset.name}
                className="w-full rounded-lg max-h-[500px] object-contain bg-black"
              />
            )}
            {previewAsset?.type === "stream" && previewAsset.previewUrl && (
              <div className="space-y-3">
                {previewAsset.mimeType === "m3u8" ? (
                  <video
                    key={previewAsset.id}
                    src={previewAsset.previewUrl}
                    controls
                    autoPlay
                    className="w-full rounded-lg bg-black max-h-[500px]"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
                    <Radio className="w-12 h-12 opacity-30" />
                    <p className="text-sm">RTMP streams cannot be previewed in the browser.</p>
                    <p className="text-xs">Use a player like VLC or OBS to preview this stream.</p>
                  </div>
                )}
                <div className="bg-accent/30 rounded-md px-3 py-2">
                  <p className="text-xs text-muted-foreground mb-1">Stream URL</p>
                  <code className="text-xs font-mono break-all">{previewAsset.filePath}</code>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewAsset(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={streamOpen} onOpenChange={setStreamOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Stream</DialogTitle>
            <DialogDescription>Add an RTMP or M3U8/HLS stream URL as a playout source.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={streamForm.name} onChange={(e) => setStreamForm({ ...streamForm, name: e.target.value })} placeholder="Live Feed 1" />
            </div>
            <div className="space-y-2">
              <Label>Protocol</Label>
              <Select value={streamForm.protocol} onValueChange={(v) => setStreamForm({ ...streamForm, protocol: v as "rtmp" | "m3u8" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rtmp">RTMP / RTMPS</SelectItem>
                  <SelectItem value="m3u8">M3U8 / HLS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Stream URL</Label>
              <Input
                value={streamForm.url}
                onChange={(e) => setStreamForm({ ...streamForm, url: e.target.value })}
                placeholder={streamForm.protocol === "rtmp" ? "rtmp://server/live/stream_key" : "https://server/path/playlist.m3u8"}
              />
              <p className="text-xs text-muted-foreground">
                {streamForm.protocol === "rtmp"
                  ? "Full RTMP or RTMPS URL including stream key"
                  : "Full URL to an M3U8 playlist (HLS)"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStreamOpen(false)}>Cancel</Button>
            <Button
              disabled={!streamForm.name || !streamForm.url || streamMutation.isPending}
              onClick={() => streamMutation.mutate({
                name: streamForm.name,
                type: "stream",
                filePath: streamForm.url,
                filename: streamForm.name,
                mimeType: streamForm.protocol,
                status: "ready",
              })}
            >
              {streamMutation.isPending ? "Adding…" : "Add Stream"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
