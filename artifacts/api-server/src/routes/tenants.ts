import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tenantsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin, getTenantId } from "../lib/authMiddleware";
import { hashPassword } from "./auth";

const router: IRouter = Router();

router.get("/tenants/current", requireAuth, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json(tenant);
});

router.patch("/tenants/current", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);

  const { name, slug, settings } = req.body;
  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (slug != null) updates.slug = slug;
  if (settings != null) updates.settings = settings;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [tenant] = await db
    .update(tenantsTable)
    .set(updates)
    .where(eq(tenantsTable.id, tenantId))
    .returning();

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json(tenant);
});

router.get("/tenants", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const tenants = await db.select().from(tenantsTable).orderBy(tenantsTable.id);

  const tenantsWithCounts = await Promise.all(
    tenants.map(async (tenant) => {
      const users = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.tenantId, tenant.id));
      return { ...tenant, userCount: users.length };
    })
  );

  res.json(tenantsWithCounts);
});

router.post("/tenants", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { name, slug, adminUsername, adminEmail, adminPassword } = req.body;

  if (!name?.trim() || !slug?.trim()) {
    res.status(400).json({ error: "Name and slug are required" });
    return;
  }

  if (!adminUsername?.trim() || !adminEmail?.trim() || !adminPassword?.trim()) {
    res.status(400).json({ error: "Admin username, email, and password are required" });
    return;
  }

  if (adminPassword.length < 6) {
    res.status(400).json({ error: "Admin password must be at least 6 characters" });
    return;
  }

  const slugClean = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");

  const [existingSlug] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, slugClean));

  if (existingSlug) {
    res.status(409).json({ error: "A tenant with this slug already exists" });
    return;
  }

  const [existingUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, adminUsername.trim()));

  if (existingUser) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const [tenant] = await db
    .insert(tenantsTable)
    .values({ name: name.trim(), slug: slugClean })
    .returning();

  await db.insert(usersTable).values({
    username: adminUsername.trim(),
    email: adminEmail.trim(),
    passwordHash: hashPassword(adminPassword),
    role: "admin",
    isActive: true,
    tenantId: tenant!.id,
  });

  res.status(201).json(tenant);
});

router.patch("/tenants/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const tenantId = Number(req.params.id);
  if (isNaN(tenantId)) {
    res.status(400).json({ error: "Invalid tenant ID" });
    return;
  }

  const { name, slug, settings } = req.body;
  const updates: Record<string, unknown> = {};
  if (name != null) updates.name = name;
  if (slug != null) updates.slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (settings != null) updates.settings = settings;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  if (updates.slug) {
    const [existing] = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.slug, updates.slug as string));
    if (existing && existing.id !== tenantId) {
      res.status(409).json({ error: "A tenant with this slug already exists" });
      return;
    }
  }

  const [tenant] = await db
    .update(tenantsTable)
    .set(updates)
    .where(eq(tenantsTable.id, tenantId))
    .returning();

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json(tenant);
});

router.get("/tenants/:id/users", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const tenantId = Number(req.params.id);
  if (isNaN(tenantId)) {
    res.status(400).json({ error: "Invalid tenant ID" });
    return;
  }

  const users = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      email: usersTable.email,
      role: usersTable.role,
      isActive: usersTable.isActive,
      tenantId: usersTable.tenantId,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.tenantId, tenantId))
    .orderBy(usersTable.createdAt);

  res.json(users);
});

router.patch("/tenants/:id/users/:userId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const tenantId = Number(req.params.id);
  const userId = Number(req.params.userId);
  if (isNaN(tenantId) || isNaN(userId)) {
    res.status(400).json({ error: "Invalid tenant or user ID" });
    return;
  }

  const [targetTenant] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));

  if (!targetTenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ tenantId })
    .where(eq(usersTable.id, userId))
    .returning({
      id: usersTable.id,
      username: usersTable.username,
      email: usersTable.email,
      role: usersTable.role,
      tenantId: usersTable.tenantId,
    });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(user);
});

export default router;
