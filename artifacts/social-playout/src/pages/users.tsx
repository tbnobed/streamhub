import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, Pencil, Trash2, ShieldCheck, Eye, Radio, Mail, UserPlus, RefreshCw, CheckCircle, XCircle, Clock } from "lucide-react";
import { useState } from "react";
import { apiBase } from "@/lib/api";
import { useAuth } from "@/context/auth";

interface Invite {
  id: number;
  email: string;
  username: string;
  role: string;
  accepted: boolean;
  expiresAt: string;
  createdAt: string;
}

interface UserRecord {
  id: number;
  username: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
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
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

const roleMeta: Record<string, { label: string; color: string; icon: typeof ShieldCheck }> = {
  admin: { label: "Admin", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: ShieldCheck },
  operator: { label: "Operator", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Radio },
  viewer: { label: "Viewer", color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: Eye },
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserRecord | null>(null);

  const [form, setForm] = useState({ username: "", email: "", password: "", role: "operator" });
  const [editForm, setEditForm] = useState({ email: "", role: "", password: "", isActive: true });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", role: "operator" });
  const isAdmin = currentUser?.role === "admin";

  const { data: users = [], isLoading } = useQuery<UserRecord[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch("/users"),
  });

  const { data: invites = [] } = useQuery<Invite[]>({
    queryKey: ["invites"],
    queryFn: () => apiFetch("/invites"),
    enabled: isAdmin,
  });

  const createMut = useMutation({
    mutationFn: (data: typeof form) => apiFetch("/users", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setCreateOpen(false);
      setForm({ username: "", email: "", password: "", role: "operator" });
      toast({ title: "User created" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Failed to create user", description: e.message }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: { id: number; email?: string; role?: string; isActive?: boolean; password?: string }) =>
      apiFetch(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setEditUser(null);
      toast({ title: "User updated" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Failed to update user", description: e.message }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setDeleteUser(null);
      toast({ title: "User deleted" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Failed to delete user", description: e.message }),
  });

  const inviteMut = useMutation({
    mutationFn: (data: typeof inviteForm) =>
      apiFetch<{ invite: Invite; emailSent: boolean }>("/invites", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["invites"] });
      setInviteOpen(false);
      setInviteForm({ username: "", email: "", role: "operator" });
      if (data.emailSent) {
        toast({ title: "Invite sent", description: `Setup email sent to ${data.invite.email}` });
      } else {
        toast({ title: "Invite created", description: "Email not configured — the user won't receive an email. You can resend later once email is set up." });
      }
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Failed to invite user", description: e.message }),
  });

  const resendMut = useMutation({
    mutationFn: (id: number) => apiFetch<{ ok: boolean; emailSent: boolean }>(`/invites/${id}/resend`, { method: "POST" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["invites"] });
      if (data.emailSent) {
        toast({ title: "Invite resent", description: "A new setup email has been sent." });
      } else {
        toast({ variant: "destructive", title: "Email not configured", description: "SendGrid is not set up — the invite was renewed but no email was sent." });
      }
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Failed to resend", description: e.message }),
  });

  const deleteInviteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/invites/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invites"] });
      toast({ title: "Invite deleted" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Failed to delete invite", description: e.message }),
  });

  const openEdit = (u: UserRecord) => {
    setEditUser(u);
    setEditForm({ email: u.email, role: u.role, password: "", isActive: u.isActive });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username || !form.email || !form.password) return;
    createMut.mutate(form);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    const payload: Record<string, unknown> = { id: editUser.id };
    if (editForm.email !== editUser.email) payload.email = editForm.email;
    if (editForm.role !== editUser.role) payload.role = editForm.role;
    if (editForm.isActive !== editUser.isActive) payload.isActive = editForm.isActive;
    if (editForm.password) payload.password = editForm.password;
    updateMut.mutate(payload as Parameters<typeof updateMut.mutate>[0]);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="w-6 h-6" /> User Management
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{users.length} user{users.length !== 1 ? "s" : ""}</p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setInviteOpen(true)}>
                <UserPlus className="w-4 h-4 mr-2" /> Invite User
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> New User
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : (
          <div className="grid gap-4">
            {users.map((u) => {
              const meta = roleMeta[u.role] || roleMeta.viewer;
              const RoleIcon = meta.icon;
              return (
                <Card key={u.id} className={!u.isActive ? "opacity-50" : ""}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-lg font-bold uppercase">
                        {u.username[0]}
                      </div>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {u.username}
                          {!u.isActive && <Badge variant="outline" className="text-xs">Disabled</Badge>}
                        </div>
                        <div className="text-sm text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={meta.color}>
                        <RoleIcon className="w-3 h-3 mr-1" />
                        {meta.label}
                      </Badge>
                      <div className="text-xs text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </div>
                      {isAdmin && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          {u.id !== currentUser?.id && (
                            <Button variant="ghost" size="icon" onClick={() => setDeleteUser(u)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {isAdmin && invites.filter((i) => !i.accepted).length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5" /> Pending Invitations
            </h2>
            <div className="grid gap-3">
              {invites.filter((i) => !i.accepted).map((inv) => {
                const expired = new Date(inv.expiresAt) < new Date();
                const meta = roleMeta[inv.role] || roleMeta.viewer;
                const RoleIcon = meta.icon;
                return (
                  <Card key={inv.id} className={expired ? "opacity-60" : ""}>
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-muted/50 border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-lg font-bold uppercase text-muted-foreground">
                          {(inv.username || inv.email)[0]}
                        </div>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {inv.username || inv.email.split("@")[0]}
                            {expired ? (
                              <Badge variant="outline" className="text-xs bg-red-500/10 text-red-400 border-red-500/30">
                                <XCircle className="w-3 h-3 mr-1" /> Expired
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
                                Pending Setup
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">{inv.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className={meta.color}>
                          <RoleIcon className="w-3 h-3 mr-1" />
                          {meta.label}
                        </Badge>
                        <div className="text-xs text-muted-foreground">
                          Invited {new Date(inv.createdAt).toLocaleDateString()}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            disabled={resendMut.isPending}
                            onClick={() => resendMut.mutate(inv.id)}
                          >
                            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Resend
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteInviteMut.mutate(inv.id)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
            <DialogDescription>Add a new user to the system.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? "Creating…" : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User: {editUser?.username}</DialogTitle>
            <DialogDescription>Update user details. Leave password blank to keep it unchanged.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>New Password (optional)</Label>
              <Input type="password" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} placeholder="Leave blank to keep current" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={editForm.isActive}
                onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                className="rounded border-border"
              />
              <Label htmlFor="isActive">Active</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button type="submit" disabled={updateMut.isPending}>
                {updateMut.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete <strong>{deleteUser?.username}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUser(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteUser && deleteMut.mutate(deleteUser.id)} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? "Deleting…" : "Delete User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" /> Invite User
            </DialogTitle>
            <DialogDescription>
              Send an invitation email so the user can set up their own account and password.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!inviteForm.email) return;
              inviteMut.mutate(inviteForm);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                placeholder="john@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteForm.role} onValueChange={(v) => setInviteForm({ ...inviteForm, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={inviteMut.isPending}>
                {inviteMut.isPending ? "Sending…" : "Send Invite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
