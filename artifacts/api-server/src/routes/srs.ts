import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { liveInputsTable } from "@workspace/db";
import {
  checkSrsHealth,
  getSrsStreams,
  getSrsClients,
  matchStreamToKey,
} from "../lib/srs-client";

const router: IRouter = Router();

router.get("/srs/health", async (_req, res): Promise<void> => {
  const health = await checkSrsHealth();
  res.json(health);
});

router.get("/srs/streams", async (_req, res): Promise<void> => {
  try {
    const streams = await getSrsStreams();
    res.json(streams);
  } catch (err: unknown) {
    res.status(502).json({
      error: "Cannot reach SRS server",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

router.get("/srs/clients", async (_req, res): Promise<void> => {
  try {
    const clients = await getSrsClients();
    res.json(clients);
  } catch (err: unknown) {
    res.status(502).json({
      error: "Cannot reach SRS server",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

router.get("/srs/input-status", async (_req, res): Promise<void> => {
  try {
    const [streams, inputs] = await Promise.all([
      getSrsStreams(),
      db.select().from(liveInputsTable),
    ]);

    const statuses = inputs.map((input) => {
      const match = matchStreamToKey(streams, input.streamKey);
      return {
        inputId: input.id,
        inputName: input.name,
        streamKey: input.streamKey,
        protocol: input.protocol,
        srs: match
          ? {
              isLive: match.isLive,
              bitrate_kbps: match.bitrate_kbps,
              clients: match.clients,
              video: match.video,
              audio: match.audio,
            }
          : null,
      };
    });

    res.json(statuses);
  } catch (err: unknown) {
    res.status(502).json({
      error: "Cannot reach SRS server",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
