import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { notificationPrefsTable, invitesTable, usersTable, auditLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/authMiddleware";
import { hashPassword } from "./auth";
import { sendInviteEmail, isEmailConfigured } from "../lib/email";
import { randomBytes } from "crypto";

const router: IRouter = Router();

router.get("/email/status", requireAuth, async (_req, res): Promise<void> => {
  res.json({ configured: isEmailConfigured() });
});

router.get("/notifications/preferences", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).user.id;

  const [prefs] = await db.select().from(notificationPrefsTable).where(eq(notificationPrefsTable.userId, userId));

  if (!prefs) {
    res.json({
      userId,
      onStreamStart: true,
      onStreamStop: false,
      onStreamError: true,
    });
    return;
  }

  res.json(prefs);
});

router.put("/notifications/preferences", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).user.id;
  const { onStreamStart, onStreamStop, onStreamError } = req.body;

  const [existing] = await db.select().from(notificationPrefsTable).where(eq(notificationPrefsTable.userId, userId));

  if (existing) {
    const [updated] = await db.update(notificationPrefsTable)
      .set({
        onStreamStart: onStreamStart ?? existing.onStreamStart,
        onStreamStop: onStreamStop ?? existing.onStreamStop,
        onStreamError: onStreamError ?? existing.onStreamError,
      })
      .where(eq(notificationPrefsTable.userId, userId))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db.insert(notificationPrefsTable)
      .values({
        userId,
        onStreamStart: onStreamStart ?? true,
        onStreamStop: onStreamStop ?? false,
        onStreamError: onStreamError ?? true,
      })
      .returning();
    res.json(created);
  }
});

router.get("/invites", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const invites = await db
    .select({
      id: invitesTable.id,
      email: invitesTable.email,
      role: invitesTable.role,
      accepted: invitesTable.accepted,
      expiresAt: invitesTable.expiresAt,
      createdAt: invitesTable.createdAt,
      invitedBy: invitesTable.invitedBy,
    })
    .from(invitesTable)
    .orderBy(invitesTable.createdAt);

  res.json(invites);
});

router.post("/invites", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { email, role, username } = req.body;
  const inviter = (req as any).user;

  if (!email || !username) {
    res.status(400).json({ error: "Email and username are required" });
    return;
  }

  const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existingUser) {
    res.status(409).json({ error: "A user with this email already exists" });
    return;
  }

  const [existingUsername] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (existingUsername) {
    res.status(409).json({ error: "A user with this username already exists" });
    return;
  }

  const tempPassword = randomBytes(6).toString("hex");
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [user] = await db.insert(usersTable)
    .values({
      username,
      email,
      passwordHash: hashPassword(tempPassword),
      role: role || "operator",
    })
    .returning({
      id: usersTable.id,
      username: usersTable.username,
      email: usersTable.email,
      role: usersTable.role,
    });

  const [invite] = await db.insert(invitesTable)
    .values({
      email,
      role: role || "operator",
      token,
      invitedBy: inviter.id,
      expiresAt,
    })
    .returning();

  const appUrl = process.env.APP_URL || `https://${process.env.REPLIT_DEV_DOMAIN || "localhost"}`;
  const loginUrl = `${appUrl}/login`;

  const emailSent = await sendInviteEmail(
    email,
    inviter.username,
    role || "operator",
    loginUrl,
    tempPassword,
  );

  await db.insert(auditLogsTable).values({
    action: "user_invited",
    resourceType: "user",
    resourceId: user.id,
    userId: inviter.id,
    details: { email, role: role || "operator", emailSent },
  });

  res.status(201).json({
    invite,
    user,
    emailSent,
    tempPassword: emailSent ? undefined : tempPassword,
  });
});

router.delete("/invites/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid invite ID" });
    return;
  }

  const [deleted] = await db.delete(invitesTable).where(eq(invitesTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
