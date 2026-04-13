import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiBase, getToken } from "@/lib/api";
import { Building2, Plus, Users, Pencil, ChevronDown, ChevronRight, ArrowRightLeft, ShieldCheck, Radio, Eye } from "lucide-react";

interface Tenant {
  id: number;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  userCount?: number;
}

interface TenantUser {
  id: number;
  username: string;
  email: string;
  role: string;
  isActive: boolean;
  tenantId: number;
  createdAt: string;
}

const roleMeta: Record<string, { label: string; color: string; icon: typeof ShieldCheck }> = {
  admin: { label: "Admin", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: ShieldCheck },
  operator: { label: "Operator", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Radio },
  viewer: { label: "Viewer", color: "bg-gray-500/20 text-gray-400 border-gray-500/30", icon: Eye },
};

function apiFetch(path: string, init?: RequestInit) {
  return fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...init?.headers,
    },
  });
}

export default function TenantSettingsPage() {
  const { toast } = useToast();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newAdminUsername, setNewAdminUsername] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const [expandedTenant, setExpandedTenant] = useState<number | null>(null);
  const [tenantUsers, setTenantUsers] = useState<Record<number, TenantUser[]>>({});
  const [usersLoading, setUsersLoading] = useState<number | null>(null);

  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [moveUser, setMoveUser] = useState<TenantUser | null>(null);
  const [moveTargetTenant, setMoveTargetTenant] = useState("");
  const [moveLoading, setMoveLoading] = useState(false);

  useEffect(() => {
    apiFetch("/tenants/current")
      .then((res) => res.json())
      .then((data) => {
        setTenant(data);
        setName(data.name);
        setSlug(data.slug);
      })
      .catch(() => {
        toast({ title: "Error", description: "Failed to load tenant settings", variant: "destructive" });
      })
      .finally(() => setLoading(false));

    loadAllTenants();
  }, []);

  const loadAllTenants = useCallback(() => {
    setTenantsLoading(true);
    apiFetch("/tenants")
      .then((res) => res.json())
      .then((data) => setAllTenants(data))
      .catch(() => {})
      .finally(() => setTenantsLoading(false));
  }, []);

  const loadTenantUsers = useCallback(async (tid: number) => {
    setUsersLoading(tid);
    try {
      const res = await apiFetch(`/tenants/${tid}/users`);
      const data = await res.json();
      setTenantUsers((prev) => ({ ...prev, [tid]: data }));
    } catch {
    } finally {
      setUsersLoading(null);
    }
  }, []);

  const toggleExpand = (tid: number) => {
    if (expandedTenant === tid) {
      setExpandedTenant(null);
    } else {
      setExpandedTenant(tid);
      if (!tenantUsers[tid]) {
        loadTenantUsers(tid);
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/tenants/current", {
        method: "PATCH",
        body: JSON.stringify({ name, slug }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save");
      }
      const updated = await res.json();
      setTenant(updated);
      toast({ title: "Saved", description: "Tenant settings updated successfully" });
      loadAllTenants();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await apiFetch("/tenants", {
        method: "POST",
        body: JSON.stringify({
          name: newName,
          slug: newSlug,
          adminUsername: newAdminUsername,
          adminEmail: newAdminEmail,
          adminPassword: newAdminPassword,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create tenant");
      }
      toast({ title: "Created", description: `Tenant "${newName}" created successfully` });
      setNewName("");
      setNewSlug("");
      setNewAdminUsername("");
      setNewAdminEmail("");
      setNewAdminPassword("");
      setShowCreate(false);
      loadAllTenants();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleEditSave = async () => {
    if (!editTenant) return;
    setEditSaving(true);
    try {
      const res = await apiFetch(`/tenants/${editTenant.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editName, slug: editSlug }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update tenant");
      }
      toast({ title: "Saved", description: `Tenant "${editName}" updated` });
      setEditTenant(null);
      loadAllTenants();
      if (editTenant.id === tenant?.id) {
        setTenant({ ...tenant, name: editName, slug: editSlug });
        setName(editName);
        setSlug(editSlug);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const handleMoveUser = async () => {
    if (!moveUser || !moveTargetTenant) return;
    setMoveLoading(true);
    try {
      const targetId = Number(moveTargetTenant);
      const res = await apiFetch(`/tenants/${targetId}/users/${moveUser.id}`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to move user");
      }
      const targetName = allTenants.find((t) => t.id === targetId)?.name || `Tenant ${targetId}`;
      toast({ title: "User moved", description: `${moveUser.username} moved to ${targetName}` });
      setMoveUser(null);
      setMoveTargetTenant("");
      loadAllTenants();
      if (expandedTenant != null) loadTenantUsers(expandedTenant);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setMoveLoading(false);
    }
  };

  const openEdit = (t: Tenant) => {
    setEditTenant(t);
    setEditName(t.name);
    setEditSlug(t.slug);
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <Building2 className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Tenant Management</h1>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold">Your Tenant</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tenant-name">Organization Name</Label>
              <Input
                id="tenant-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Organization"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-slug">Slug</Label>
              <Input
                id="tenant-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="my-org"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Tenant ID</Label>
              <p className="text-sm text-muted-foreground">{tenant?.id}</p>
            </div>
            <div className="space-y-1">
              <Label>Created</Label>
              <p className="text-sm text-muted-foreground">
                {tenant?.createdAt ? new Date(tenant.createdAt).toLocaleString() : "—"}
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-border">
            <Button onClick={handleSave} disabled={saving || !name.trim() || !slug.trim()}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">All Tenants</h2>
            <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
              <Plus className="w-4 h-4 mr-1" />
              New Tenant
            </Button>
          </div>

          {showCreate && (
            <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/30">
              <h3 className="font-medium">Create New Tenant</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new-tenant-name">Tenant Name</Label>
                  <Input
                    id="new-tenant-name"
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      const autoSlug = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
                      if (!newSlug || newSlug === newName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")) {
                        setNewSlug(autoSlug);
                      }
                    }}
                    placeholder="Acme Corp"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-tenant-slug">Slug</Label>
                  <Input
                    id="new-tenant-slug"
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="acme-corp"
                  />
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-sm text-muted-foreground mb-3">
                  An initial admin user will be created for this tenant.
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-admin-username">Admin Username</Label>
                    <Input
                      id="new-admin-username"
                      value={newAdminUsername}
                      onChange={(e) => setNewAdminUsername(e.target.value)}
                      placeholder="admin"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-admin-email">Admin Email</Label>
                    <Input
                      id="new-admin-email"
                      type="email"
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      placeholder="admin@acme.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-admin-password">Admin Password</Label>
                    <Input
                      id="new-admin-password"
                      type="password"
                      value={newAdminPassword}
                      onChange={(e) => setNewAdminPassword(e.target.value)}
                      placeholder="Min 6 characters"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={creating || !newName.trim() || !newSlug.trim() || !newAdminUsername.trim() || !newAdminEmail.trim() || newAdminPassword.length < 6}
                >
                  {creating ? "Creating..." : "Create Tenant"}
                </Button>
              </div>
            </div>
          )}

          {tenantsLoading ? (
            <div className="flex items-center justify-center h-20">
              <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="space-y-2">
              {allTenants.map((t) => {
                const isExpanded = expandedTenant === t.id;
                const users = tenantUsers[t.id] || [];
                const isLoadingUsers = usersLoading === t.id;

                return (
                  <div key={t.id} className="border border-border rounded-lg overflow-hidden">
                    <div
                      className={`flex items-center px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors ${t.id === tenant?.id ? "bg-primary/5" : ""}`}
                      onClick={() => toggleExpand(t.id)}
                    >
                      <div className="mr-3 text-muted-foreground">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{t.name}</span>
                          {t.id === tenant?.id && (
                            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">current</span>
                          )}
                          <span className="text-xs text-muted-foreground font-mono">{t.slug}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {t.userCount ?? 0} user{(t.userCount ?? 0) !== 1 ? "s" : ""}
                        </span>
                        <span className="text-xs">{new Date(t.createdAt).toLocaleDateString()}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(t);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-border bg-muted/10 px-4 py-3">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-medium text-muted-foreground">Users in this tenant</h4>
                        </div>
                        {isLoadingUsers ? (
                          <div className="flex items-center justify-center h-12">
                            <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                          </div>
                        ) : users.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-2">No users in this tenant.</p>
                        ) : (
                          <div className="space-y-1">
                            {users.map((u) => {
                              const meta = roleMeta[u.role] || roleMeta.viewer;
                              const RoleIcon = meta.icon;
                              return (
                                <div key={u.id} className="flex items-center justify-between py-2 px-3 rounded hover:bg-muted/30">
                                  <div className="flex items-center gap-3">
                                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold uppercase">
                                      {u.username[0]}
                                    </div>
                                    <div>
                                      <span className="text-sm font-medium">{u.username}</span>
                                      <span className="text-xs text-muted-foreground ml-2">{u.email}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className={`text-xs ${meta.color}`}>
                                      <RoleIcon className="w-3 h-3 mr-1" />
                                      {meta.label}
                                    </Badge>
                                    {!u.isActive && (
                                      <Badge variant="outline" className="text-xs">Disabled</Badge>
                                    )}
                                    {allTenants.length > 1 && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => {
                                          setMoveUser(u);
                                          setMoveTargetTenant("");
                                        }}
                                      >
                                        <ArrowRightLeft className="w-3 h-3 mr-1" />
                                        Move
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!editTenant} onOpenChange={(open) => !open && setEditTenant(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tenant</DialogTitle>
            <DialogDescription>Update the tenant's name and slug.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Organization Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Organization name"
              />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input
                value={editSlug}
                onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="org-slug"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditTenant(null)}>Cancel</Button>
              <Button onClick={handleEditSave} disabled={editSaving || !editName.trim() || !editSlug.trim()}>
                {editSaving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!moveUser} onOpenChange={(open) => !open && setMoveUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move User to Another Tenant</DialogTitle>
            <DialogDescription>
              Move <strong>{moveUser?.username}</strong> to a different tenant. They will only see resources belonging to their new tenant.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Target Tenant</Label>
              <Select value={moveTargetTenant} onValueChange={setMoveTargetTenant}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a tenant" />
                </SelectTrigger>
                <SelectContent>
                  {allTenants
                    .filter((t) => t.id !== moveUser?.tenantId)
                    .map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name} ({t.slug})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMoveUser(null)}>Cancel</Button>
              <Button onClick={handleMoveUser} disabled={moveLoading || !moveTargetTenant}>
                {moveLoading ? "Moving..." : "Move User"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
