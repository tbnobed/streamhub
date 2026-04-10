import { Router, type IRouter, type Request, type Response } from "express";
import {
  LocalStorageService,
  ObjectNotFoundError,
  getUploadsSubdir,
  ensureDir,
  generateUploadFilename,
} from "../lib/objectStorage";
import multer from "multer";
import { createReadStream } from "fs";

const router: IRouter = Router();
const storageService = new LocalStorageService();

const diskStorage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    const dir = getUploadsSubdir();
    await ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, generateUploadFilename(file.originalname));
  },
});

const upload = multer({
  storage: diskStorage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 },
});

router.post("/storage/upload", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const objectPath = `/objects/uploads/${req.file.filename}`;
    res.json({ objectPath });
  } catch (error) {
    req.log.error({ err: error }, "Error uploading file");
    res.status(500).json({ error: "Failed to upload file" });
  }
});

router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const { stream, size, contentType } = await storageService.getFileStream(objectPath);

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : size - 1;
      const chunkSize = end - start + 1;

      stream.destroy();
      const rangeStream = createReadStream(storageService.getAbsolutePath(objectPath), { start, end });

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType,
      });
      rangeStream.pipe(res);
      return;
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", size);
    res.setHeader("Accept-Ranges", "bytes");
    stream.pipe(res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
