import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Youtube, Plus, ExternalLink, Trash2, Video } from "lucide-react";
import { useState } from "react";
import { apiBase } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface YouTubeAccount {
  id: number;
  channelName: string;
  channelId: string;
  status: string;
  connectedAt?: string;
}

interface YouTubeBroadcast {
  id: number;
  title: string;
  status: string;
  scheduledStartTime?: string;
  youtubeBroadcastId?: string;
  streamUrl?: string;
  streamKey?: string;
  accountId: number;
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

export default function YouTubePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({
    title: "",
    description: "",
    scheduledStartTime: "",
    privacyStatus: "public",
    accountId: "",
  });

  const { data: accounts = [], isLoading: accountsLoading } = useQuery<YouTubeAccount[]>({
    queryKey: ["youtube-accounts"],
    queryFn: () => apiFetch("/youtube/accounts"),
  });

  const { data: broadcasts = [], isLoading: broadcastsLoading } = useQuery<YouTubeBroadcast[]>({
    queryKey: ["youtube-broadcasts"],
    queryFn: () => apiFetch("/youtube/broadcasts"),
  });

  const connectMutation = useMutation({
    mutationFn: () => apiFetch<{ url: string }>("/youtube/auth-url"),
    onSuccess: (data) => { window.open(data.url, "_blank"); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const createBroadcastMutation = useMutation({
    mutationFn: (body: typeof broadcastForm) => apiFetch<YouTubeBroadcast>("/youtube/broadcasts", {
      method: "POST",
      body: JSON.stringify({
        ...body,
        accountId: parseInt(body.accountId),
        scheduledStartTime: body.scheduledStartTime || undefined,
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["youtube-broadcasts"] });
      setBroadcastOpen(false);
      setBroadcastForm({ title: "", description: "", scheduledStartTime: "", privacyStatus: "public", accountId: "" });
      toast({ title: "Broadcast created" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const deleteBroadcastMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/youtube/broadcasts/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["youtube-broadcasts"] }); toast({ title: "Broadcast deleted" }); },
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">YouTube Integration</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage YouTube Live accounts and broadcasts</p>
          </div>
        </div>

        {/* Accounts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Youtube className="w-4 h-4 text-red-500" />YouTube Accounts
            </CardTitle>
            <Button size="sm" onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />Connect Account
            </Button>
          </CardHeader>
          <CardContent>
            {accountsLoading && <Spinner />}
            {!accountsLoading && accounts.length === 0 && (
              <div className="py-6 text-center text-muted-foreground text-sm">
                <Youtube className="w-8 h-8 mx-auto mb-2 opacity-20" />
                No YouTube accounts connected yet.
                <br />
                <span className="text-xs">Note: Requires YouTube OAuth credentials to be configured.</span>
              </div>
            )}
            {accounts.map((acc) => (
              <div key={acc.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/30 mb-2">
                <div>
                  <div className="font-medium">{acc.channelName}</div>
                  <div className="text-xs text-muted-foreground">{acc.channelId}</div>
                </div>
                <Badge variant={acc.status === "active" ? "default" : "secondary"}>{acc.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Broadcasts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Video className="w-4 h-4" />Broadcasts
            </CardTitle>
            <Button
              size="sm"
              onClick={() => setBroadcastOpen(true)}
              disabled={accounts.length === 0}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />Schedule Broadcast
            </Button>
          </CardHeader>
          <CardContent>
            {broadcastsLoading && <Spinner />}
            {!broadcastsLoading && broadcasts.length === 0 && (
              <div className="py-6 text-center text-muted-foreground text-sm">
                No broadcasts scheduled yet.
              </div>
            )}
            <div className="space-y-2">
              {broadcasts.map((b) => (
                <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/30">
                  <div>
                    <div className="font-medium">{b.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {b.scheduledStartTime ? new Date(b.scheduledStartTime).toLocaleString() : "Not scheduled"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">{b.status}</Badge>
                    {b.youtubeBroadcastId && (
                      <a
                        href={`https://youtube.com/watch?v=${b.youtubeBroadcastId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button size="icon" variant="ghost"><ExternalLink className="w-3.5 h-3.5" /></Button>
                      </a>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => deleteBroadcastMutation.mutate(b.id)}>
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={broadcastOpen} onOpenChange={setBroadcastOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule Broadcast</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Account</Label>
              <Select value={broadcastForm.accountId} onValueChange={(v) => setBroadcastForm({ ...broadcastForm, accountId: v })}>
                <SelectTrigger><SelectValue placeholder="Select account…" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.channelName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={broadcastForm.title} onChange={(e) => setBroadcastForm({ ...broadcastForm, title: e.target.value })} placeholder="Live Stream Title" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={broadcastForm.description} onChange={(e) => setBroadcastForm({ ...broadcastForm, description: e.target.value })} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Scheduled Start</Label>
              <Input type="datetime-local" value={broadcastForm.scheduledStartTime} onChange={(e) => setBroadcastForm({ ...broadcastForm, scheduledStartTime: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Privacy</Label>
              <Select value={broadcastForm.privacyStatus} onValueChange={(v) => setBroadcastForm({ ...broadcastForm, privacyStatus: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="unlisted">Unlisted</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBroadcastOpen(false)}>Cancel</Button>
            <Button
              disabled={!broadcastForm.title || !broadcastForm.accountId || createBroadcastMutation.isPending}
              onClick={() => createBroadcastMutation.mutate(broadcastForm)}
            >
              {createBroadcastMutation.isPending ? "Scheduling…" : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
