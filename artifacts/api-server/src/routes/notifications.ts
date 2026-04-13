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

function getSetupUrl(token: string): string {
  const appUrl = process.env.APP_URL || `https://${process.env.REPLIT_DEV_DOMAIN || "localhost"}`;
  return `${appUrl}/setup-account?token=${token}`;
}

router.post("/invites", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { email, role } = req.body;
  const inviter = (req as any).user;

  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existingUser) {
    res.status(409).json({ error: "A user with this email already exists" });
    return;
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [invite] = await db.insert(invitesTable)
    .values({
      email,
      role: role || "operator",
      token,
      invitedBy: inviter.id,
      expiresAt,
    })
    .returning();

  const setupUrl = getSetupUrl(token);
  const emailSent = await sendInviteEmail(
    email,
    inviter.username,
    role || "operator",
    setupUrl,
  );

  await db.insert(auditLogsTable).values({
    action: "user_invited",
    resourceType: "invite",
    resourceId: invite.id,
    userId: inviter.id,
    details: { email, role: role || "operator", emailSent },
  });

  res.status(201).json({ invite, emailSent });
});

router.post("/invites/:id/resend", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid invite ID" });
    return;
  }

  const [invite] = await db.select().from(invitesTable).where(eq(invitesTable.id, id));
  if (!invite) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }

  if (invite.accepted) {
    res.status(400).json({ error: "This invite has already been accepted" });
    return;
  }

  const newToken = randomBytes(32).toString("hex");
  const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.update(invitesTable)
    .set({ token: newToken, expiresAt: newExpiry })
    .where(eq(invitesTable.id, id));

  const inviter = (req as any).user;
  const setupUrl = getSetupUrl(newToken);
  const emailSent = await sendInviteEmail(
    invite.email,
    inviter.username,
    invite.role,
    setupUrl,
  );

  res.json({ ok: true, emailSent });
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

router.get("/invites/verify/:token", async (req, res): Promise<void> => {
  const { token } = req.params;

  const [invite] = await db.select().from(invitesTable).where(eq(invitesTable.token, token));
  if (!invite) {
    res.status(404).json({ error: "Invalid or expired invitation link" });
    return;
  }

  if (invite.accepted) {
    res.status(400).json({ error: "This invitation has already been used" });
    return;
  }

  if (new Date(invite.expiresAt) < new Date()) {
    res.status(410).json({ error: "This invitation has expired. Please ask your administrator to resend it." });
    return;
  }

  res.json({ email: invite.email, role: invite.role });
});

router.post("/invites/setup-account", async (req, res): Promise<void> => {
  const { token, password, username } = req.body;

  if (!token || !password || !username) {
    res.status(400).json({ error: "Token, username, and password are required" });
    return;
  }

  if (username.length < 3) {
    res.status(400).json({ error: "Username must be at least 3 characters" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const [existingUsername] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (existingUsername) {
    res.status(409).json({ error: "This username is already taken" });
    return;
  }

  const [invite] = await db.select().from(invitesTable).where(eq(invitesTable.token, token));
  if (!invite) {
    res.status(404).json({ error: "Invalid or expired invitation link" });
    return;
  }

  if (invite.accepted) {
    res.status(400).json({ error: "This invitation has already been used" });
    return;
  }

  if (new Date(invite.expiresAt) < new Date()) {
    res.status(410).json({ error: "This invitation has expired. Please ask your administrator to resend it." });
    return;
  }

  const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, invite.email));
  if (existingUser) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const [user] = await db.insert(usersTable)
    .values({
      username,
      email: invite.email,
      passwordHash: hashPassword(password),
      role: invite.role || "operator",
    })
    .returning({
      id: usersTable.id,
      username: usersTable.username,
      email: usersTable.email,
      role: usersTable.role,
    });

  await db.update(invitesTable)
    .set({ accepted: true })
    .where(eq(invitesTable.id, invite.id));

  await db.insert(auditLogsTable).values({
    action: "invite_accepted",
    resourceType: "user",
    resourceId: user.id,
    details: { email: invite.email, role: invite.role },
  });

  res.json({ ok: true, user });
});

export default router;
