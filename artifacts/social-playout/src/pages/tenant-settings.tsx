import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiBase, getToken } from "@/lib/api";
import { Building2, Plus, Users } from "lucide-react";

interface Tenant {
  id: number;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  userCount?: number;
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

  const headers = { Authorization: `Bearer ${getToken()}` };

  useEffect(() => {
    fetch(`${apiBase()}/tenants/current`, { headers })
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

  const loadAllTenants = () => {
    setTenantsLoading(true);
    fetch(`${apiBase()}/tenants`, { headers })
      .then((res) => res.json())
      .then((data) => setAllTenants(data))
      .catch(() => {})
      .finally(() => setTenantsLoading(false));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${apiBase()}/tenants/current`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
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
      const res = await fetch(`${apiBase()}/tenants`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
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
          <h1 className="text-2xl font-bold">Tenant Settings</h1>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold">Current Tenant</h2>

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
            <p className="text-xs text-muted-foreground">
              URL-friendly identifier. Only lowercase letters, numbers, and hyphens.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tenant ID</Label>
              <p className="text-sm text-muted-foreground">{tenant?.id}</p>
            </div>
            <div className="space-y-2">
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
                      if (!newSlug || newSlug === newName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")) {
                        setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
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
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-2 font-medium">ID</th>
                    <th className="text-left px-4 py-2 font-medium">Name</th>
                    <th className="text-left px-4 py-2 font-medium">Slug</th>
                    <th className="text-left px-4 py-2 font-medium">Users</th>
                    <th className="text-left px-4 py-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {allTenants.map((t) => (
                    <tr
                      key={t.id}
                      className={`border-b border-border last:border-0 ${t.id === tenant?.id ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-4 py-2 text-muted-foreground">{t.id}</td>
                      <td className="px-4 py-2 font-medium">
                        {t.name}
                        {t.id === tenant?.id && (
                          <span className="ml-2 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">current</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground font-mono text-xs">{t.slug}</td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Users className="w-3 h-3" />
                          {t.userCount ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground text-xs">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
