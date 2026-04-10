import { randomUUID } from "crypto";
import path from "path";
import fs from "fs/promises";
import { createReadStream, existsSync } from "fs";
import type { ReadStream } from "fs";

const UPLOAD_DIR = process.env.UPLOAD_DIR || (process.env.NODE_ENV === "production" ? "/data/uploads" : "./uploads");

export function getUploadDir(): string {
  return UPLOAD_DIR;
}

export function getUploadsSubdir(): string {
  return path.join(UPLOAD_DIR, "uploads");
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export function generateUploadFilename(originalName: string): string {
  const id = randomUUID();
  const ext = path.extname(originalName) || "";
  return `${id}${ext}`;
}

export class LocalStorageService {
  getAbsolutePath(objectPath: string): string {
    const relative = objectPath.replace(/^\/objects\//, "");
    return path.resolve(UPLOAD_DIR, relative);
  }

  async getFileStream(objectPath: string): Promise<{ stream: ReadStream; size: number; contentType: string }> {
    const absPath = this.getAbsolutePath(objectPath);
    if (!existsSync(absPath)) {
      throw new ObjectNotFoundError();
    }
    const stat = await fs.stat(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const contentType = MIME_MAP[ext] || "application/octet-stream";
    return {
      stream: createReadStream(absPath),
      size: stat.size,
      contentType,
    };
  }

  async deleteFile(objectPath: string): Promise<void> {
    const absPath = this.getAbsolutePath(objectPath);
    if (existsSync(absPath)) {
      await fs.unlink(absPath);
    }
  }
}

const MIME_MAP: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".webm": "video/webm",
  ".ts": "video/mp2t",
  ".mts": "video/mp2t",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
};
