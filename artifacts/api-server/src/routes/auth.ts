import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, sessionsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";
import crypto from "node:crypto";

const router: IRouter = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + process.env.SESSION_SECRET).digest("hex");
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function resolveToken(token: string): Promise<number | null> {
  const [session] = await db
    .select({ userId: sessionsTable.userId })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.token, token), gt(sessionsTable.expiresAt, new Date())));
  return session?.userId ?? null;
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));

  if (!user || !user.isActive) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const hash = hashPassword(password);
  if (hash !== user.passwordHash) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessionsTable).values({ token, userId: user.id, expiresAt });

  res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      timezone: user.timezone,
      createdAt: user.createdAt,
    },
    token,
  });
});

router.patch("/auth/me", async (req, res): Promise<void> => {
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

  const { timezone } = req.body;
  if (timezone && typeof timezone === "string") {
    await db.update(usersTable).set({ timezone }).where(eq(usersTable.id, userId));
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    timezone: user.timezone,
    createdAt: user.createdAt,
  });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
  }
  res.json({ ok: true });
});

router.get("/auth/me", async (req, res): Promise<void> => {
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

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    timezone: user.timezone,
    createdAt: user.createdAt,
  });
});

export { resolveToken, hashPassword };
export default router;
