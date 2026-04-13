import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Mail, Bell, CheckCircle, AlertTriangle } from "lucide-react";

function apiBase() {
  return import.meta.env.VITE_API_URL || `${window.location.origin}${import.meta.env.BASE_URL}api`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

interface NotificationPrefs {
  onStreamStart: boolean;
  onStreamStop: boolean;
  onStreamError: boolean;
}

export default function NotificationsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: emailStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["email-status"],
    queryFn: () => apiFetch("/email/status"),
  });

  const { data: prefs } = useQuery<NotificationPrefs>({
    queryKey: ["notification-prefs"],
    queryFn: () => apiFetch("/notifications/preferences"),
  });

  const updatePrefsMutation = useMutation({
    mutationFn: (body: Partial<NotificationPrefs>) =>
      apiFetch("/notifications/preferences", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-prefs"] });
      toast({ title: "Notification preferences updated" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your stream notification preferences
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Email Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {emailStatus?.configured ? (
                <>
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-green-400">SendGrid configured and ready</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm text-yellow-400">
                    Email not configured — set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL environment variables
                  </span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4" />
              My Notification Preferences
            </CardTitle>
            <CardDescription>Choose which stream events trigger email notifications to you</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Stream Started</p>
                <p className="text-xs text-muted-foreground">Get notified when a channel goes live</p>
              </div>
              <Switch
                checked={prefs?.onStreamStart ?? true}
                onCheckedChange={(v) => updatePrefsMutation.mutate({ onStreamStart: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Stream Stopped</p>
                <p className="text-xs text-muted-foreground">Get notified when a channel goes offline</p>
              </div>
              <Switch
                checked={prefs?.onStreamStop ?? false}
                onCheckedChange={(v) => updatePrefsMutation.mutate({ onStreamStop: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Stream Error</p>
                <p className="text-xs text-muted-foreground">Get notified when a channel encounters an error</p>
              </div>
              <Switch
                checked={prefs?.onStreamError ?? true}
                onCheckedChange={(v) => updatePrefsMutation.mutate({ onStreamError: v })}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
