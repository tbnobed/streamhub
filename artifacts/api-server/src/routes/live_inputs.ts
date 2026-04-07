import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { liveInputsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateLiveInputBody,
  GetLiveInputParams,
  UpdateLiveInputParams,
  UpdateLiveInputBody,
  DeleteLiveInputParams,
  RegenerateLiveInputKeyParams,
  ListLiveInputsQueryParams,
} from "@workspace/api-zod";
import crypto from "node:crypto";

const router: IRouter = Router();

function generateStreamKey(): string {
  return crypto.randomBytes(16).toString("hex");
}

function buildIngestUrl(protocol: string, streamKey: string): string {
  const host = process.env.INGEST_HOST ?? "ingest.yourdomain.com";
  if (protocol === "srt") {
    return `srt://${host}:9000?streamid=${streamKey}`;
  }
  return `rtmp://${host}/live/${streamKey}`;
}

router.get("/live-inputs", async (req, res): Promise<void> => {
  const params = ListLiveInputsQueryParams.safeParse(req.query);
  let inputs = await db.select().from(liveInputsTable).orderBy(liveInputsTable.createdAt);

  if (params.success && params.data.channelId != null) {
    inputs = inputs.filter((i) => i.channelId === params.data.channelId);
  }

  res.json(inputs);
});

router.post("/live-inputs", async (req, res): Promise<void> => {
  const parsed = CreateLiveInputBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const streamKey = generateStreamKey();
  const ingestUrl = buildIngestUrl(parsed.data.protocol, streamKey);

  const [input] = await db
    .insert(liveInputsTable)
    .values({
      name: parsed.data.name,
      channelId: parsed.data.channelId ?? null,
      protocol: parsed.data.protocol,
      streamKey,
      ingestUrl,
      status: "idle",
      reconnectCount: 0,
    })
    .returning();

  res.status(201).json(input);
});

router.get("/live-inputs/:id", async (req, res): Promise<void> => {
  const params = GetLiveInputParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [input] = await db.select().from(liveInputsTable).where(eq(liveInputsTable.id, params.data.id));
  if (!input) {
    res.status(404).json({ error: "Live input not found" });
    return;
  }

  res.json(input);
});

router.patch("/live-inputs/:id", async (req, res): Promise<void> => {
  const params = UpdateLiveInputParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateLiveInputBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name != null) updates.name = parsed.data.name;
  if (parsed.data.channelId !== undefined) updates.channelId = parsed.data.channelId;

  const [input] = await db
    .update(liveInputsTable)
    .set(updates)
    .where(eq(liveInputsTable.id, params.data.id))
    .returning();

  if (!input) {
    res.status(404).json({ error: "Live input not found" });
    return;
  }

  res.json(input);
});

router.delete("/live-inputs/:id", async (req, res): Promise<void> => {
  const params = DeleteLiveInputParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [input] = await db
    .delete(liveInputsTable)
    .where(eq(liveInputsTable.id, params.data.id))
    .returning();

  if (!input) {
    res.status(404).json({ error: "Live input not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/live-inputs/:id/regenerate-key", async (req, res): Promise<void> => {
  const params = RegenerateLiveInputKeyParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(liveInputsTable).where(eq(liveInputsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Live input not found" });
    return;
  }

  const streamKey = generateStreamKey();
  const ingestUrl = buildIngestUrl(existing.protocol, streamKey);

  const [input] = await db
    .update(liveInputsTable)
    .set({ streamKey, ingestUrl })
    .where(eq(liveInputsTable.id, params.data.id))
    .returning();

  res.json(input);
});

export default router;
