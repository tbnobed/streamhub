import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Film, Plus, Trash2, FileVideoCamera, Image, Music } from "lucide-react";
import { useState } from "react";
import { apiBase } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Asset {
  id: number;
  name: string;
  type: string;
  duration?: number;
  filePath?: string;
  fileSize?: number;
  status: string;
  createdAt: string;
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
  return <FileVideoCamera className="w-5 h-5 text-purple-400" />;
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

export default function AssetsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    name: "",
    type: "video",
    filePath: "",
    duration: "",
    description: "",
  });

  const { data: assets = [], isLoading } = useQuery<Asset[]>({
    queryKey: ["assets"],
    queryFn: () => apiFetch("/assets"),
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch<Asset>("/assets", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setCreateOpen(false);
      setForm({ name: "", type: "video", filePath: "", duration: "", description: "" });
      qc.invalidateQueries({ queryKey: ["assets"] });
      setTimeout(() => toast({ title: "Asset registered" }), 100);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/assets/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assets"] }); toast({ title: "Asset deleted" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

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
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />Register Asset
          </Button>
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
              <p className="text-muted-foreground">No assets found. Register a media file to get started.</p>
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
                      {asset.filePath && <span className="truncate max-w-xs">{asset.filePath}</span>}
                      <span>{formatDuration(asset.duration)}</span>
                      <span>{formatBytes(asset.fileSize)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={asset.status === "ready" ? "default" : "secondary"} className="capitalize">
                      {asset.status}
                    </Badge>
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Register Asset</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My Video Clip" />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                  <SelectItem value="audio">Audio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>File Path</Label>
              <Input value={form.filePath} onChange={(e) => setForm({ ...form, filePath: e.target.value })} placeholder="/media/clips/my-video.mp4" />
            </div>
            <div className="space-y-2">
              <Label>Duration (seconds)</Label>
              <Input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="120" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!form.name || createMutation.isPending}
              onClick={() => createMutation.mutate({
                name: form.name,
                type: form.type,
                filePath: form.filePath || undefined,
                duration: form.duration ? parseInt(form.duration) : undefined,
                description: form.description || undefined,
              })}
            >
              {createMutation.isPending ? "Registering…" : "Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
