import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth";
import { Mail, UserPlus, Trash2, Copy, Bell, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

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

interface Invite {
  id: number;
  email: string;
  role: string;
  accepted: boolean;
  expiresAt: string;
  createdAt: string;
}

interface NotificationPrefs {
  onStreamStart: boolean;
  onStreamStop: boolean;
  onStreamError: boolean;
}

export default function InvitesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("operator");
  const [lastTempPassword, setLastTempPassword] = useState<string | null>(null);

  const { data: emailStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["email-status"],
    queryFn: () => apiFetch("/email/status"),
  });

  const { data: invites = [] } = useQuery<Invite[]>({
    queryKey: ["invites"],
    queryFn: () => apiFetch("/invites"),
    enabled: isAdmin,
  });

  const { data: prefs } = useQuery<NotificationPrefs>({
    queryKey: ["notification-prefs"],
    queryFn: () => apiFetch("/notifications/preferences"),
  });

  const inviteMutation = useMutation({
    mutationFn: (body: { email: string; username: string; role: string }) =>
      apiFetch<{ invite: Invite; user: any; emailSent: boolean; tempPassword?: string }>("/invites", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["invites"] });
      qc.invalidateQueries({ queryKey: ["users"] });
      setEmail("");
      setUsername("");
      setRole("operator");
      if (data.tempPassword) {
        setLastTempPassword(data.tempPassword);
        toast({ title: "User created", description: "Email not configured — temporary password shown below." });
      } else {
        setLastTempPassword(null);
        toast({ title: "Invite sent", description: `Invitation email sent to ${data.invite.email}` });
      }
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const deleteInviteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/invites/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invites"] });
      toast({ title: "Invite removed" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
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
          <h1 className="text-2xl font-bold">Email & Notifications</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage user invitations and stream notification preferences
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

        {isAdmin && (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="w-4 h-4" />
                  Invite New User
                </CardTitle>
                <CardDescription>
                  {emailStatus?.configured
                    ? "Create a user account and send an invitation email with login credentials"
                    : "Create a user account (email not configured — password will be shown after creation)"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    inviteMutation.mutate({ email, username, role });
                  }}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-username">Username</Label>
                    <Input
                      id="inv-username"
                      placeholder="johndoe"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-email">Email</Label>
                    <Input
                      id="inv-email"
                      type="email"
                      placeholder="john@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-role">Role</Label>
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger id="inv-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="operator">Operator</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button type="submit" disabled={inviteMutation.isPending} className="w-full">
                      {inviteMutation.isPending ? "Creating..." : "Create & Invite"}
                    </Button>
                  </div>
                </form>

                {lastTempPassword && (
                  <div className="mt-4 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/30">
                    <p className="text-sm text-yellow-400 mb-1 font-medium">Temporary Password (share securely)</p>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono bg-background/50 px-2 py-1 rounded">{lastTempPassword}</code>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => {
                          navigator.clipboard.writeText(lastTempPassword);
                          toast({ title: "Copied to clipboard" });
                        }}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Invitation History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {invites.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No invitations sent yet</p>
                ) : (
                  <div className="space-y-2">
                    {invites.map((inv) => {
                      const expired = new Date(inv.expiresAt) < new Date();
                      return (
                        <div key={inv.id} className="flex items-center justify-between p-3 rounded-md bg-accent/20">
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">{inv.email}</span>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] uppercase text-muted-foreground px-1.5 py-0.5 rounded bg-accent/40">
                                  {inv.role}
                                </span>
                                {inv.accepted ? (
                                  <span className="text-[10px] text-green-400 flex items-center gap-0.5">
                                    <CheckCircle className="w-3 h-3" /> Accepted
                                  </span>
                                ) : expired ? (
                                  <span className="text-[10px] text-red-400 flex items-center gap-0.5">
                                    <XCircle className="w-3 h-3" /> Expired
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-yellow-400">Pending</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {new Date(inv.createdAt).toLocaleDateString()}
                            </span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-red-400"
                              onClick={() => deleteInviteMutation.mutate(inv.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
