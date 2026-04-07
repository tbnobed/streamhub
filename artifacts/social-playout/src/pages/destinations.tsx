import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Share2, Plus, Trash2, Youtube, Facebook, Twitch, MonitorPlay } from "lucide-react";
import { useState } from "react";
import { apiBase } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Destination {
  id: number;
  name: string;
  platform: string;
  streamUrl: string;
  streamKey?: string;
  enabled: boolean;
  channelId?: number;
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

const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  youtube: Youtube,
  facebook: Facebook,
  twitch: Twitch,
};

const PLATFORM_RTMP_URLS: Record<string, string> = {
  youtube: "rtmp://a.rtmp.youtube.com/live2",
  facebook: "rtmps://live-api-s.facebook.com:443/rtmp",
  twitch: "rtmp://live.twitch.tv/live",
  custom: "",
};

function PlatformIcon({ platform }: { platform: string }) {
  const Icon = PLATFORM_ICONS[platform] ?? MonitorPlay;
  return <Icon className="w-5 h-5 text-primary" />;
}

export default function DestinationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", platform: "youtube", streamUrl: "", streamKey: "" });

  const { data: destinations = [], isLoading } = useQuery<Destination[]>({
    queryKey: ["destinations"],
    queryFn: () => apiFetch("/destinations"),
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) => apiFetch<Destination>("/destinations", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setCreateOpen(false);
      setForm({ name: "", platform: "youtube", streamUrl: "", streamKey: "" });
      qc.invalidateQueries({ queryKey: ["destinations"] });
      setTimeout(() => toast({ title: "Destination created" }), 100);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/destinations/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["destinations"] }); toast({ title: "Destination deleted" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiFetch(`/destinations/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["destinations"] }),
  });

  const handlePlatformChange = (platform: string) => {
    setForm({ ...form, platform, streamUrl: PLATFORM_RTMP_URLS[platform] ?? "" });
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Destinations</h1>
            <p className="text-muted-foreground text-sm mt-1">Output streaming destinations</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />Add Destination
          </Button>
        </div>

        {isLoading && <div className="flex justify-center py-20"><Spinner className="size-8" /></div>}

        {!isLoading && destinations.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center">
              <Share2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">No destinations yet. Add a streaming platform to get started.</p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4">
          {destinations.map((dest) => (
            <Card key={dest.id} className={!dest.enabled ? "opacity-60" : ""}>
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
                    <PlatformIcon platform={dest.platform} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{dest.name}</span>
                      <Badge variant="outline" className="capitalize text-xs">{dest.platform}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 truncate">{dest.streamUrl}</div>
                    {dest.streamKey && (
                      <div className="text-xs text-muted-foreground">Key: {"•".repeat(Math.min(dest.streamKey.length, 12))}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={dest.enabled}
                      onCheckedChange={(v) => toggleMutation.mutate({ id: dest.id, enabled: v })}
                    />
                    <Button size="icon" variant="ghost" onClick={() => { if (confirm("Delete destination?")) deleteMutation.mutate(dest.id); }}>
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
          <DialogHeader><DialogTitle>Add Destination</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="YouTube Main Channel" />
            </div>
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={form.platform} onValueChange={handlePlatformChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="youtube">YouTube Live</SelectItem>
                  <SelectItem value="facebook">Facebook Live</SelectItem>
                  <SelectItem value="twitch">Twitch</SelectItem>
                  <SelectItem value="custom">Custom RTMP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>RTMP URL</Label>
              <Input value={form.streamUrl} onChange={(e) => setForm({ ...form, streamUrl: e.target.value })} placeholder="rtmp://a.rtmp.youtube.com/live2" />
            </div>
            <div className="space-y-2">
              <Label>Stream Key</Label>
              <Input type="password" value={form.streamKey} onChange={(e) => setForm({ ...form, streamKey: e.target.value })} placeholder="xxxx-xxxx-xxxx-xxxx" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={!form.name || !form.streamUrl || createMutation.isPending} onClick={() => createMutation.mutate(form)}>
              {createMutation.isPending ? "Adding…" : "Add Destination"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
