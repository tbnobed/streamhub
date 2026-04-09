import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Tv2, Play, Square, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { apiBase } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Channel {
  id: number;
  name: string;
  description?: string;
  status: string;
  sourceMode: string;
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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    live: "bg-red-500 text-white",
    starting: "bg-yellow-500 text-black",
    stopping: "bg-orange-500 text-white",
    on_air: "bg-red-500 text-white",
    idle: "bg-secondary text-secondary-foreground",
    error: "bg-destructive text-destructive-foreground",
  };
  const label = status === "on_air" ? "ON AIR" : status.toUpperCase();
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${colors[status] ?? "bg-secondary text-secondary-foreground"}`}>
      {(status === "on_air" || status === "live") && <span className="w-1.5 h-1.5 rounded-full bg-white mr-1.5 animate-pulse" />}
      {label}
    </span>
  );
}

export default function ChannelsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", sourceMode: "playlist" });

  const { data: channels = [], isLoading } = useQuery<Channel[]>({
    queryKey: ["channels"],
    queryFn: () => apiFetch("/channels"),
    refetchInterval: 8000,
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) => apiFetch<Channel>("/channels", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setCreateOpen(false);
      setForm({ name: "", description: "", sourceMode: "playlist" });
      qc.invalidateQueries({ queryKey: ["channels"] });
      setTimeout(() => toast({ title: "Channel created" }), 100);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const startMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/channels/${id}/start`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
    onError: (e: Error) => toast({ variant: "destructive", title: "Failed to start", description: e.message }),
  });

  const stopMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/channels/${id}/stop`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
    onError: (e: Error) => toast({ variant: "destructive", title: "Failed to stop", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/channels/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["channels"] }); toast({ title: "Channel deleted" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Channels</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage your broadcast channels</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Channel
          </Button>
        </div>

        {isLoading && (
          <div className="flex justify-center py-20">
            <Spinner className="size-8" />
          </div>
        )}

        {!isLoading && channels.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center">
              <Tv2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">No channels yet. Create your first channel to get started.</p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4">
          {channels.map((ch) => (
            <Card key={ch.id} className="hover:border-primary/30 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${ch.status === "on_air" || ch.status === "live" ? "bg-red-500/20" : "bg-primary/10"}`}>
                      <Tv2 className={`w-5 h-5 ${ch.status === "on_air" || ch.status === "live" ? "text-red-500" : "text-primary"}`} />
                    </div>
                    <div className="min-w-0">
                      <Link href={`/channels/${ch.id}`}>
                        <div className="font-semibold hover:text-primary cursor-pointer">{ch.name}</div>
                      </Link>
                      <div className="text-xs text-muted-foreground capitalize">{ch.sourceMode.replace("_", " ")} · Created {new Date(ch.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <StatusBadge status={ch.status} />
                    {ch.status === "idle" || ch.status === "error" ? (
                      <Button size="sm" onClick={() => startMutation.mutate(ch.id)} disabled={startMutation.isPending}>
                        <Play className="w-3.5 h-3.5 mr-1.5" />
                        Start
                      </Button>
                    ) : ch.status === "on_air" || ch.status === "live" || ch.status === "starting" ? (
                      <Button size="sm" variant="destructive" onClick={() => stopMutation.mutate(ch.id)} disabled={stopMutation.isPending}>
                        <Square className="w-3.5 h-3.5 mr-1.5" />
                        Stop
                      </Button>
                    ) : null}
                    <Button size="icon" variant="ghost" onClick={() => { if (confirm("Delete this channel?")) deleteMutation.mutate(ch.id); }}>
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
          <DialogHeader>
            <DialogTitle>Create Channel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Channel Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Main Channel" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Source Mode</Label>
              <Select value={form.sourceMode} onValueChange={(v) => setForm({ ...form, sourceMode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="playlist">Playlist</SelectItem>
                  <SelectItem value="live_input">Live Input</SelectItem>
                  <SelectItem value="fallback">Fallback Slate</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate(form)} disabled={!form.name || createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
