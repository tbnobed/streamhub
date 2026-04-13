import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin, getTenantId } from "../lib/authMiddleware";

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

export default router;
