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

const router: IRouter = Router();

router.use(healthRouter);
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

export default router;
