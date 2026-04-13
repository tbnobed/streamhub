import { db } from "@workspace/db";
import { usersTable, notificationPrefsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendStreamStartedEmail, sendStreamStoppedEmail, sendStreamErrorEmail, isEmailConfigured } from "./email";
import { logger } from "./logger";

type NotificationType = "stream_start" | "stream_stop" | "stream_error";

async function getSubscribedEmails(type: NotificationType): Promise<string[]> {
  if (!isEmailConfigured()) return [];

  const users = await db.select({
    email: usersTable.email,
    userId: usersTable.id,
    isActive: usersTable.isActive,
  }).from(usersTable).where(eq(usersTable.isActive, true));

  const prefs = await db.select().from(notificationPrefsTable);
  const prefsMap = new Map(prefs.map((p) => [p.userId, p]));

  const emails: string[] = [];
  for (const user of users) {
    const pref = prefsMap.get(user.userId);
    const defaultOn = type === "stream_start" || type === "stream_error";

    let shouldNotify = defaultOn;
    if (pref) {
      if (type === "stream_start") shouldNotify = pref.onStreamStart;
      else if (type === "stream_stop") shouldNotify = pref.onStreamStop;
      else if (type === "stream_error") shouldNotify = pref.onStreamError;
    }

    if (shouldNotify) {
      emails.push(user.email);
    }
  }

  return emails;
}

export async function notifyStreamStarted(channelName: string, destinationNames: string[]): Promise<void> {
  try {
    const emails = await getSubscribedEmails("stream_start");
    for (const email of emails) {
      await sendStreamStartedEmail(email, channelName, destinationNames);
    }
    if (emails.length > 0) {
      logger.info({ channelName, recipientCount: emails.length }, "Stream start notifications sent");
    }
  } catch (err) {
    logger.error({ err, channelName }, "Failed to send stream start notifications");
  }
}

export async function notifyStreamStopped(channelName: string): Promise<void> {
  try {
    const emails = await getSubscribedEmails("stream_stop");
    for (const email of emails) {
      await sendStreamStoppedEmail(email, channelName);
    }
    if (emails.length > 0) {
      logger.info({ channelName, recipientCount: emails.length }, "Stream stop notifications sent");
    }
  } catch (err) {
    logger.error({ err, channelName }, "Failed to send stream stop notifications");
  }
}

export async function notifyStreamError(channelName: string, errorMessage: string): Promise<void> {
  try {
    const emails = await getSubscribedEmails("stream_error");
    for (const email of emails) {
      await sendStreamErrorEmail(email, channelName, errorMessage);
    }
    if (emails.length > 0) {
      logger.info({ channelName, recipientCount: emails.length }, "Stream error notifications sent");
    }
  } catch (err) {
    logger.error({ err, channelName }, "Failed to send stream error notifications");
  }
}
