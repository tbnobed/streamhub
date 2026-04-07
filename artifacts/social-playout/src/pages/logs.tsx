import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ScrollText, RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import { apiBase } from "@/lib/api";

interface AuditLog {
  id: number;
  userId?: number;
  username?: string;
  action: string;
  entityType?: string;
  entityId?: number;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
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

const ACTION_COLORS: Record<string, string> = {
  login: "bg-blue-500/20 text-blue-400",
  logout: "bg-slate-500/20 text-slate-400",
  create: "bg-green-500/20 text-green-400",
  update: "bg-yellow-500/20 text-yellow-400",
  delete: "bg-red-500/20 text-red-400",
  start: "bg-emerald-500/20 text-emerald-400",
  stop: "bg-orange-500/20 text-orange-400",
};

export default function LogsPage() {
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");

  const { data: logs = [], isLoading, refetch, isFetching } = useQuery<AuditLog[]>({
    queryKey: ["audit-logs", entityFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (entityFilter !== "all") params.set("entityType", entityFilter);
      return apiFetch(`/logs/audit?${params}`);
    },
    refetchInterval: 30000,
  });

  const filtered = logs.filter((log) => {
    if (!search) return true;
    return (
      log.action.includes(search.toLowerCase()) ||
      log.username?.toLowerCase().includes(search.toLowerCase()) ||
      log.entityType?.toLowerCase().includes(search.toLowerCase())
    );
  });

  function getActionColor(action: string): string {
    for (const [key, cls] of Object.entries(ACTION_COLORS)) {
      if (action.toLowerCase().includes(key)) return cls;
    }
    return "bg-secondary text-secondary-foreground";
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Audit Logs</h1>
            <p className="text-muted-foreground text-sm mt-1">{logs.length} recent events</p>
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search logs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="channel">Channels</SelectItem>
              <SelectItem value="asset">Assets</SelectItem>
              <SelectItem value="playlist">Playlists</SelectItem>
              <SelectItem value="user">Users</SelectItem>
              <SelectItem value="worker">Workers</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading && <div className="flex justify-center py-20"><Spinner className="size-8" /></div>}

        {!isLoading && filtered.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center">
              <ScrollText className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">No audit logs found.</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {filtered.map((log) => (
                <div key={log.id} className="flex items-start gap-4 p-4 hover:bg-accent/20 transition-colors">
                  <div className="flex-shrink-0 mt-0.5">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-mono font-semibold ${getActionColor(log.action)}`}>
                      {log.action}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {log.username && <span className="text-sm font-medium">{log.username}</span>}
                      {log.entityType && (
                        <Badge variant="outline" className="text-xs capitalize">{log.entityType}</Badge>
                      )}
                      {log.entityId && <span className="text-xs text-muted-foreground">#{log.entityId}</span>}
                    </div>
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <div className="text-xs text-muted-foreground mt-1 font-mono truncate">
                        {JSON.stringify(log.metadata)}
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
