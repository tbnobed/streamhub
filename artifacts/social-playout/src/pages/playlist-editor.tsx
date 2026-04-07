import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Plus, Trash2, GripVertical } from "lucide-react";
import { useState } from "react";
import { apiBase } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface PlaylistItem {
  id: number;
  assetId: number;
  assetName: string;
  position: number;
  duration?: number;
}

interface Asset {
  id: number;
  name: string;
  type: string;
  duration?: number;
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

export default function PlaylistEditorPage() {
  const [, params] = useRoute("/playlists/:id");
  const playlistId = params?.id;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedAsset, setSelectedAsset] = useState("");

  const { data: items = [], isLoading: itemsLoading } = useQuery<PlaylistItem[]>({
    queryKey: ["playlist-items", playlistId],
    queryFn: () => apiFetch(`/playlists/${playlistId}/items`),
    enabled: !!playlistId,
  });

  const { data: assets = [] } = useQuery<Asset[]>({
    queryKey: ["assets"],
    queryFn: () => apiFetch("/assets"),
  });

  const { data: playlist } = useQuery<{ id: number; name: string }>({
    queryKey: ["playlist", playlistId],
    queryFn: () => apiFetch(`/playlists/${playlistId}`),
    enabled: !!playlistId,
  });

  const addMutation = useMutation({
    mutationFn: (assetId: number) => apiFetch(`/playlists/${playlistId}/items`, {
      method: "POST",
      body: JSON.stringify({ assetId, position: items.length }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["playlist-items", playlistId] });
      setSelectedAsset("");
      toast({ title: "Asset added" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: number) => apiFetch(`/playlists/${playlistId}/items/${itemId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["playlist-items", playlistId] }),
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const totalDuration = items.reduce((s, i) => s + (i.duration ?? 0), 0);

  function formatDuration(secs?: number): string {
    if (!secs) return "—";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/playlists">
            <Button variant="ghost" size="icon"><ChevronLeft className="w-5 h-5" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{playlist?.name ?? "Playlist Editor"}</h1>
            <p className="text-muted-foreground text-sm mt-1">{items.length} items · Total: {formatDuration(totalDuration)}</p>
          </div>
        </div>

        {/* Add item */}
        <Card>
          <CardHeader><CardTitle className="text-base">Add Asset</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Select value={selectedAsset} onValueChange={setSelectedAsset}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select an asset to add…" />
                </SelectTrigger>
                <SelectContent>
                  {assets.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name} {a.duration ? `(${formatDuration(a.duration)})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!selectedAsset || addMutation.isPending}
                onClick={() => addMutation.mutate(parseInt(selectedAsset))}
              >
                <Plus className="w-4 h-4 mr-2" />Add
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Items list */}
        <Card>
          <CardHeader><CardTitle className="text-base">Playlist Order</CardTitle></CardHeader>
          <CardContent>
            {itemsLoading && <div className="flex justify-center py-8"><Spinner /></div>}
            {!itemsLoading && items.length === 0 && (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No items yet. Add assets from above to build your playlist.
              </div>
            )}
            <div className="space-y-2">
              {[...items].sort((a, b) => a.position - b.position).map((item, idx) => (
                <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-accent/30 group">
                  <GripVertical className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                  <div className="w-6 h-6 rounded bg-primary/20 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{item.assetName}</div>
                    <div className="text-xs text-muted-foreground">{formatDuration(item.duration)}</div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeMutation.mutate(item.id)}
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
