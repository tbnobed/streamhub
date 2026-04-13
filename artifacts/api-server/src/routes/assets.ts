import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { assetsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { getTenantId } from "../lib/authMiddleware";
import {
  CreateAssetBody,
  GetAssetParams,
  UpdateAssetParams,
  UpdateAssetBody,
  DeleteAssetParams,
  ListAssetsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/assets/stats", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const all = await db.select().from(assetsTable).where(eq(assetsTable.tenantId, tenantId));

  const total = all.length;
  const totalSizeBytes = all.reduce((acc, a) => acc + (a.fileSize ?? 0), 0);
  const byStatus: Record<string, number> = {};
  const byFormat: Record<string, number> = {};

  for (const a of all) {
    byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    if (a.codec) {
      byFormat[a.codec] = (byFormat[a.codec] ?? 0) + 1;
    }
  }

  res.json({ total, totalSizeBytes, byStatus, byFormat });
});

router.get("/assets", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const params = ListAssetsQueryParams.safeParse(req.query);
  let assets = await db.select().from(assetsTable).where(eq(assetsTable.tenantId, tenantId)).orderBy(assetsTable.createdAt);

  if (params.success && params.data.channelId != null) {
    assets = assets.filter((a) => a.channelId === params.data.channelId);
  }

  res.json(assets);
});

router.post("/assets", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const parsed = CreateAssetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [asset] = await db
    .insert(assetsTable)
    .values({ ...parsed.data, status: "ready", tenantId })
    .returning();

  res.status(201).json(asset);
});

router.get("/assets/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const params = GetAssetParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [asset] = await db.select().from(assetsTable).where(and(eq(assetsTable.id, params.data.id), eq(assetsTable.tenantId, tenantId)));

  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  res.json(asset);
});

router.patch("/assets/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const params = UpdateAssetParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateAssetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name != null) updates.name = parsed.data.name;
  if (parsed.data.status != null) updates.status = parsed.data.status;
  if (parsed.data.channelId !== undefined) updates.channelId = parsed.data.channelId;

  const [asset] = await db
    .update(assetsTable)
    .set(updates)
    .where(and(eq(assetsTable.id, params.data.id), eq(assetsTable.tenantId, tenantId)))
    .returning();

  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  res.json(asset);
});

router.delete("/assets/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const params = DeleteAssetParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [asset] = await db
    .delete(assetsTable)
    .where(and(eq(assetsTable.id, params.data.id), eq(assetsTable.tenantId, tenantId)))
    .returning();

  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
