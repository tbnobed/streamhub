import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { youtubeAccountsTable, youtubeBroadcastsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  DeleteYoutubeAccountParams,
  ListYoutubeBroadcastsQueryParams,
  CreateYoutubeBroadcastBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/youtube/accounts", async (_req, res): Promise<void> => {
  const accounts = await db
    .select({
      id: youtubeAccountsTable.id,
      channelTitle: youtubeAccountsTable.channelTitle,
      channelId: youtubeAccountsTable.channelId,
      email: youtubeAccountsTable.email,
      userId: youtubeAccountsTable.userId,
      connectedAt: youtubeAccountsTable.connectedAt,
    })
    .from(youtubeAccountsTable)
    .orderBy(youtubeAccountsTable.connectedAt);

  res.json(accounts);
});

router.delete("/youtube/accounts/:id", async (req, res): Promise<void> => {
  const params = DeleteYoutubeAccountParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [account] = await db
    .delete(youtubeAccountsTable)
    .where(eq(youtubeAccountsTable.id, params.data.id))
    .returning();

  if (!account) {
    res.status(404).json({ error: "YouTube account not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/youtube/auth-url", async (_req, res): Promise<void> => {
  const clientId = process.env.YOUTUBE_CLIENT_ID ?? "YOUR_CLIENT_ID";
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI ?? "http://localhost/api/youtube/callback";
  const scope = encodeURIComponent("https://www.googleapis.com/auth/youtube");

  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;

  res.json({ url });
});

router.get("/youtube/broadcasts", async (req, res): Promise<void> => {
  const params = ListYoutubeBroadcastsQueryParams.safeParse(req.query);
  let broadcasts = await db.select().from(youtubeBroadcastsTable).orderBy(youtubeBroadcastsTable.createdAt);

  if (params.success && params.data.channelId != null) {
    broadcasts = broadcasts.filter((b) => b.channelId === params.data.channelId);
  }

  res.json(broadcasts);
});

router.post("/youtube/broadcasts", async (req, res): Promise<void> => {
  const parsed = CreateYoutubeBroadcastBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const ytBroadcastId = `broadcast_${Date.now()}`;
  const ytStreamId = `stream_${Date.now()}`;

  const [broadcast] = await db
    .insert(youtubeBroadcastsTable)
    .values({
      ytBroadcastId,
      ytStreamId,
      title: parsed.data.title,
      channelId: parsed.data.channelId ?? null,
      youtubeAccountId: parsed.data.youtubeAccountId,
      scheduledStart: parsed.data.scheduledStart ? new Date(parsed.data.scheduledStart) : null,
      status: "created",
    })
    .returning();

  res.status(201).json(broadcast);
});

export default router;
