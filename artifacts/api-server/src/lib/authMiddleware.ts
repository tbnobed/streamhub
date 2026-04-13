import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveToken } from "../routes/auth";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        role: string;
        tenantId: number | null;
      };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const token = auth.slice(7);
  const userId = await resolveToken(token);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db.select({
    id: usersTable.id,
    username: usersTable.username,
    role: usersTable.role,
    isActive: usersTable.isActive,
    tenantId: usersTable.tenantId,
  }).from(usersTable).where(eq(usersTable.id, userId));

  if (!user || !user.isActive) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  req.user = { id: user.id, username: user.username, role: user.role, tenantId: user.tenantId };
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

export function getTenantId(req: Request): number {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    const err: any = new Error("No tenant context");
    err.statusCode = 403;
    throw err;
  }
  return tenantId;
}
