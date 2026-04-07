import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ListVideo, Plus, Trash2, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { apiBase } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Playlist {
  id: number;
  name: string;
  description?: string;
  itemCount?: number;
  totalDuration?: number;
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

export default function PlaylistsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  const { data: playlists = [], isLoading } = useQuery<Playlist[]>({
    queryKey: ["playlists"],
    queryFn: () => apiFetch("/playlists"),
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) => apiFetch<Playlist>("/playlists", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setCreateOpen(false);
      setForm({ name: "", description: "" });
      qc.invalidateQueries({ queryKey: ["playlists"] });
      setTimeout(() => toast({ title: "Playlist created" }), 100);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/playlists/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["playlists"] }); toast({ title: "Playlist deleted" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  function formatDuration(secs?: number): string {
    if (!secs) return "—";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return h ? `${h}h ${m}m` : `${m}m`;
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Playlists</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage ordered asset sequences</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />New Playlist
          </Button>
        </div>

        {isLoading && <div className="flex justify-center py-20"><Spinner className="size-8" /></div>}

        {!isLoading && playlists.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center">
              <ListVideo className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">No playlists yet. Create one to sequence your assets.</p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3">
          {playlists.map((pl) => (
            <Card key={pl.id} className="hover:border-primary/20 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <ListVideo className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{pl.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {pl.itemCount ?? 0} items · {formatDuration(pl.totalDuration)} · Created {new Date(pl.createdAt).toLocaleDateString()}
                    </div>
                    {pl.description && <div className="text-xs text-muted-foreground mt-1 truncate">{pl.description}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/playlists/${pl.id}`}>
                      <Button size="sm" variant="outline">
                        Edit <ChevronRight className="w-3.5 h-3.5 ml-1" />
                      </Button>
                    </Link>
                    <Button size="icon" variant="ghost" onClick={() => { if (confirm("Delete playlist?")) deleteMutation.mutate(pl.id); }}>
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
          <DialogHeader><DialogTitle>Create Playlist</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Morning Show" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" rows={2} />
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
