import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { playlistsTable, playlistItemsTable, assetsTable } from "@workspace/db";
import { eq, asc, sql } from "drizzle-orm";
import {
  CreatePlaylistBody,
  GetPlaylistParams,
  UpdatePlaylistParams,
  UpdatePlaylistBody,
  DeletePlaylistParams,
  ListPlaylistsQueryParams,
  ListPlaylistItemsParams,
  AddPlaylistItemParams,
  AddPlaylistItemBody,
  RemovePlaylistItemParams,
  ReorderPlaylistItemsParams,
  ReorderPlaylistItemsBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getPlaylistWithCount(id: number) {
  const [playlist] = await db.select().from(playlistsTable).where(eq(playlistsTable.id, id));
  if (!playlist) return null;

  const items = await db
    .select()
    .from(playlistItemsTable)
    .where(eq(playlistItemsTable.playlistId, id))
    .orderBy(asc(playlistItemsTable.position));

  const totalDuration = items.reduce((acc, _item) => acc, 0);

  return {
    ...playlist,
    itemCount: items.length,
    totalDuration: totalDuration || null,
  };
}

router.get("/playlists", async (req, res): Promise<void> => {
  const params = ListPlaylistsQueryParams.safeParse(req.query);
  let playlists = await db.select().from(playlistsTable).orderBy(playlistsTable.createdAt);

  if (params.success && params.data.channelId != null) {
    playlists = playlists.filter((p) => p.channelId === params.data.channelId);
  }

  const withCounts = await Promise.all(
    playlists.map(async (p) => {
      const items = await db
        .select()
        .from(playlistItemsTable)
        .where(eq(playlistItemsTable.playlistId, p.id));
      return { ...p, itemCount: items.length, totalDuration: null };
    })
  );

  res.json(withCounts);
});

router.post("/playlists", async (req, res): Promise<void> => {
  const parsed = CreatePlaylistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [playlist] = await db
    .insert(playlistsTable)
    .values(parsed.data)
    .returning();

  res.status(201).json({ ...playlist, itemCount: 0, totalDuration: null });
});

router.get("/playlists/:id", async (req, res): Promise<void> => {
  const params = GetPlaylistParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const playlist = await getPlaylistWithCount(params.data.id);
  if (!playlist) {
    res.status(404).json({ error: "Playlist not found" });
    return;
  }

  const items = await db
    .select({
      id: playlistItemsTable.id,
      playlistId: playlistItemsTable.playlistId,
      assetId: playlistItemsTable.assetId,
      position: playlistItemsTable.position,
      createdAt: playlistItemsTable.createdAt,
      assetName: assetsTable.name,
      assetDuration: assetsTable.duration,
      assetFilePath: assetsTable.filePath,
    })
    .from(playlistItemsTable)
    .leftJoin(assetsTable, eq(playlistItemsTable.assetId, assetsTable.id))
    .where(eq(playlistItemsTable.playlistId, params.data.id))
    .orderBy(asc(playlistItemsTable.position));

  res.json({ ...playlist, items });
});

router.patch("/playlists/:id", async (req, res): Promise<void> => {
  const params = UpdatePlaylistParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePlaylistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name != null) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.loop != null) updates.loop = parsed.data.loop;

  const [playlist] = await db
    .update(playlistsTable)
    .set(updates)
    .where(eq(playlistsTable.id, params.data.id))
    .returning();

  if (!playlist) {
    res.status(404).json({ error: "Playlist not found" });
    return;
  }

  const withCount = await getPlaylistWithCount(playlist.id);
  res.json(withCount);
});

router.delete("/playlists/:id", async (req, res): Promise<void> => {
  const params = DeletePlaylistParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [playlist] = await db
    .delete(playlistsTable)
    .where(eq(playlistsTable.id, params.data.id))
    .returning();

  if (!playlist) {
    res.status(404).json({ error: "Playlist not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/playlists/:id/items", async (req, res): Promise<void> => {
  const params = ListPlaylistItemsParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const items = await db
    .select({
      id: playlistItemsTable.id,
      playlistId: playlistItemsTable.playlistId,
      assetId: playlistItemsTable.assetId,
      position: playlistItemsTable.position,
      createdAt: playlistItemsTable.createdAt,
      assetName: assetsTable.name,
      assetDuration: assetsTable.duration,
      assetFilePath: assetsTable.filePath,
    })
    .from(playlistItemsTable)
    .leftJoin(assetsTable, eq(playlistItemsTable.assetId, assetsTable.id))
    .where(eq(playlistItemsTable.playlistId, params.data.id))
    .orderBy(asc(playlistItemsTable.position));

  res.json(items);
});

router.post("/playlists/:id/items", async (req, res): Promise<void> => {
  const params = AddPlaylistItemParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AddPlaylistItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(playlistItemsTable)
    .where(eq(playlistItemsTable.playlistId, params.data.id));

  const position = parsed.data.position ?? existing.length;

  const [item] = await db
    .insert(playlistItemsTable)
    .values({
      playlistId: params.data.id,
      assetId: parsed.data.assetId,
      position,
    })
    .returning();

  res.status(201).json(item);
});

router.delete("/playlists/:id/items/:itemId", async (req, res): Promise<void> => {
  const params = RemovePlaylistItemParams.safeParse({
    id: Number(req.params.id),
    itemId: Number(req.params.itemId),
  });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [item] = await db
    .delete(playlistItemsTable)
    .where(eq(playlistItemsTable.id, params.data.itemId))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/playlists/:id/reorder", async (req, res): Promise<void> => {
  const params = ReorderPlaylistItemsParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = ReorderPlaylistItemsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  for (let i = 0; i < parsed.data.itemIds.length; i++) {
    await db
      .update(playlistItemsTable)
      .set({ position: i })
      .where(eq(playlistItemsTable.id, parsed.data.itemIds[i]!));
  }

  const items = await db
    .select()
    .from(playlistItemsTable)
    .where(eq(playlistItemsTable.playlistId, params.data.id))
    .orderBy(asc(playlistItemsTable.position));

  res.json(items);
});

export default router;
