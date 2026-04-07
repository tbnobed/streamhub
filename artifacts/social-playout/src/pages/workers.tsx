import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ServerCog, RefreshCw, Trash2, Activity, Clock } from "lucide-react";
import { apiBase } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Worker {
  id: string;
  hostname: string;
  status: string;
  activeJobs: number;
  version?: string;
  lastHeartbeat?: string;
  registeredAt?: string;
}

interface WorkerEvent {
  id: number;
  workerId: string;
  eventType: string;
  message: string;
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

function WorkerStatusBadge({ status }: { status: string }) {
  if (status === "online") return <Badge className="bg-green-500 text-white">Online</Badge>;
  if (status === "busy") return <Badge className="bg-yellow-500 text-black">Busy</Badge>;
  return <Badge variant="secondary">Offline</Badge>;
}

function timeAgo(date?: string): string {
  if (!date) return "Never";
  const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

export default function WorkersPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: workers = [], isLoading } = useQuery<Worker[]>({
    queryKey: ["workers"],
    queryFn: () => apiFetch("/workers"),
    refetchInterval: 10000,
  });

  const { data: events = [] } = useQuery<WorkerEvent[]>({
    queryKey: ["worker-events"],
    queryFn: () => apiFetch("/workers/events?limit=20"),
    refetchInterval: 15000,
  });

  const deregisterMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/workers/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["workers"] }); toast({ title: "Worker deregistered" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const online = workers.filter((w) => w.status !== "offline").length;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Worker Nodes</h1>
            <p className="text-muted-foreground text-sm mt-1">{online} of {workers.length} workers online</p>
          </div>
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["workers"] })}>
            <RefreshCw className="w-4 h-4 mr-2" />Refresh
          </Button>
        </div>

        {isLoading && <div className="flex justify-center py-20"><Spinner className="size-8" /></div>}

        {!isLoading && workers.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center">
              <ServerCog className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground mb-2">No workers registered yet.</p>
              <p className="text-sm text-muted-foreground">Start a worker node to begin processing playout jobs.</p>
              <div className="mt-4 p-3 bg-muted rounded-lg text-left max-w-sm mx-auto">
                <code className="text-xs">
                  API_URL=http://your-api/api node worker/dist/index.js
                </code>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4">
          {workers.map((worker) => (
            <Card key={worker.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      worker.status === "online" ? "bg-green-500/10" : "bg-accent"
                    }`}>
                      <ServerCog className={`w-5 h-5 ${worker.status === "online" ? "text-green-500" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{worker.hostname}</span>
                        <WorkerStatusBadge status={worker.status} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex gap-4">
                        <span className="flex items-center gap-1">
                          <Activity className="w-3 h-3" />{worker.activeJobs} active jobs
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />Last seen: {timeAgo(worker.lastHeartbeat)}
                        </span>
                        {worker.version && <span>v{worker.version}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 font-mono">{worker.id}</div>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm("Deregister worker?")) deregisterMutation.mutate(worker.id); }}>
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Events */}
        {events.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Recent Events</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {events.map((evt) => (
                  <div key={evt.id} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
                    <div className="w-2 h-2 mt-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{evt.message}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        <span className="font-mono">{evt.workerId}</span> · {evt.eventType} · {new Date(evt.createdAt).toLocaleString()}
                      </div>
                    </div>
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
