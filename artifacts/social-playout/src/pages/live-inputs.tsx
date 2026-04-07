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
import { Radio, Plus, Trash2, Copy, Check } from "lucide-react";
import { useState } from "react";
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    connected: "bg-green-500",
    active: "bg-green-500",
    idle: "bg-muted-foreground/40",
    error: "bg-red-500",
  };
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors[status] ?? "bg-muted-foreground/40"} ${status === "connected" ? "animate-pulse" : ""}`} />;
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
          {inputs.map((input) => (
            <Card key={input.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
                      <Radio className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <StatusDot status={input.status} />
                        <span className="font-semibold">{input.name}</span>
                        <Badge variant="outline" className="text-xs uppercase">{input.protocol}</Badge>
                      </div>
                      {input.ingestUrl && (
                        <div className="mt-2 space-y-1">
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
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={input.status === "connected" ? "default" : "secondary"} className="capitalize">
                      {input.status}
                    </Badge>
                    <Button size="icon" variant="ghost" onClick={() => { if (confirm("Delete input?")) deleteMutation.mutate(input.id); }}>
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
