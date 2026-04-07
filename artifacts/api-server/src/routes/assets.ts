import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { assetsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  CreateAssetBody,
  GetAssetParams,
  UpdateAssetParams,
  UpdateAssetBody,
  DeleteAssetParams,
  ListAssetsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/assets/stats", async (_req, res): Promise<void> => {
  const all = await db.select().from(assetsTable);

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
  const params = ListAssetsQueryParams.safeParse(req.query);
  let assets = await db.select().from(assetsTable).orderBy(assetsTable.createdAt);

  if (params.success && params.data.channelId != null) {
    assets = assets.filter((a) => a.channelId === params.data.channelId);
  }

  res.json(assets);
});

router.post("/assets", async (req, res): Promise<void> => {
  const parsed = CreateAssetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [asset] = await db
    .insert(assetsTable)
    .values({ ...parsed.data, status: "ready" })
    .returning();

  res.status(201).json(asset);
});

router.get("/assets/:id", async (req, res): Promise<void> => {
  const params = GetAssetParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, params.data.id));

  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  res.json(asset);
});

router.patch("/assets/:id", async (req, res): Promise<void> => {
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
    .where(eq(assetsTable.id, params.data.id))
    .returning();

  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  res.json(asset);
});

router.delete("/assets/:id", async (req, res): Promise<void> => {
  const params = DeleteAssetParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [asset] = await db
    .delete(assetsTable)
    .where(eq(assetsTable.id, params.data.id))
    .returning();

  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
