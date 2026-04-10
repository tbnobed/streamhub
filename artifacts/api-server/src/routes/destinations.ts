import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { destinationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateDestinationBody,
  GetDestinationParams,
  UpdateDestinationParams,
  UpdateDestinationBody,
  DeleteDestinationParams,
  ToggleDestinationParams,
  ListDestinationsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/destinations", async (req, res): Promise<void> => {
  const params = ListDestinationsQueryParams.safeParse(req.query);
  let destinations = await db.select().from(destinationsTable).orderBy(destinationsTable.createdAt);

  if (params.success && params.data.channelId != null) {
    destinations = destinations.filter((d) => d.channelId === params.data.channelId);
  }

  res.json(destinations);
});

router.post("/destinations", async (req, res): Promise<void> => {
  const parsed = CreateDestinationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const values = {
    ...parsed.data,
    isActive: true,
    status: "idle",
    streamKey: parsed.data.streamKey || "",
  };

  const [dest] = await db
    .insert(destinationsTable)
    .values(values)
    .returning();

  res.status(201).json(dest);
});

router.get("/destinations/:id", async (req, res): Promise<void> => {
  const params = GetDestinationParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [dest] = await db.select().from(destinationsTable).where(eq(destinationsTable.id, params.data.id));
  if (!dest) {
    res.status(404).json({ error: "Destination not found" });
    return;
  }

  res.json(dest);
});

router.patch("/destinations/:id", async (req, res): Promise<void> => {
  const params = UpdateDestinationParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateDestinationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name != null) updates.name = parsed.data.name;
  if (parsed.data.streamUrl != null) updates.streamUrl = parsed.data.streamUrl;
  if (parsed.data.streamKey != null) updates.streamKey = parsed.data.streamKey;
  if (parsed.data.isActive != null) updates.isActive = parsed.data.isActive;
  if (req.body.platform != null) updates.platform = req.body.platform;
  if ("channelId" in req.body) updates.channelId = req.body.channelId;

  const [dest] = await db
    .update(destinationsTable)
    .set(updates)
    .where(eq(destinationsTable.id, params.data.id))
    .returning();

  if (!dest) {
    res.status(404).json({ error: "Destination not found" });
    return;
  }

  res.json(dest);
});

router.delete("/destinations/:id", async (req, res): Promise<void> => {
  const params = DeleteDestinationParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [dest] = await db
    .delete(destinationsTable)
    .where(eq(destinationsTable.id, params.data.id))
    .returning();

  if (!dest) {
    res.status(404).json({ error: "Destination not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/destinations/:id/toggle", async (req, res): Promise<void> => {
  const params = ToggleDestinationParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(destinationsTable).where(eq(destinationsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Destination not found" });
    return;
  }

  const [dest] = await db
    .update(destinationsTable)
    .set({ isActive: !existing.isActive })
    .where(eq(destinationsTable.id, params.data.id))
    .returning();

  res.json(dest);
});

export default router;
