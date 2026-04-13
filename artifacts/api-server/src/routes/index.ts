import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import assetsRouter from "./assets";
import channelsRouter from "./channels";
import playlistsRouter from "./playlists";
import liveInputsRouter from "./live_inputs";
import destinationsRouter from "./destinations";
import youtubeRouter from "./youtube";
import workersRouter from "./workers";
import monitoringRouter from "./monitoring";
import logsRouter from "./logs";
import srsRouter from "./srs";
import storageRouter from "./storage";
import notificationsRouter from "./notifications";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(assetsRouter);
router.use(channelsRouter);
router.use(playlistsRouter);
router.use(liveInputsRouter);
router.use(destinationsRouter);
router.use(youtubeRouter);
router.use(workersRouter);
router.use(monitoringRouter);
router.use(logsRouter);
router.use(srsRouter);
router.use(notificationsRouter);

export default router;
