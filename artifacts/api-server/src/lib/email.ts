import sgMail from "@sendgrid/mail";
import { logger } from "./logger";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getConfig() {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    return null;
  }
  return { apiKey, fromEmail };
}

export function isEmailConfigured(): boolean {
  return getConfig() !== null;
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const config = getConfig();
  if (!config) {
    logger.warn("SendGrid not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL missing), skipping email");
    return false;
  }

  try {
    sgMail.setApiKey(config.apiKey);
    await sgMail.send({
      to,
      from: config.fromEmail,
      subject,
      html,
    });
    logger.info({ to, subject }, "Email sent");
    return true;
  } catch (err) {
    logger.error({ err, to, subject }, "Failed to send email");
    return false;
  }
}

const APP_NAME = "Media Playout Manager";

export async function sendInviteEmail(
  to: string,
  inviterName: string,
  role: string,
  setupUrl: string,
): Promise<boolean> {
  const subject = `You've been invited to ${APP_NAME}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="background: #1a1a2e; border-radius: 12px; padding: 32px; color: #e0e0e0;">
        <h1 style="color: #f97316; margin: 0 0 8px 0; font-size: 24px;">${APP_NAME}</h1>
        <p style="color: #888; margin: 0 0 24px 0; font-size: 14px;">Broadcast Operations Center</p>
        
        <p style="font-size: 16px; line-height: 1.6;">
          <strong>${escapeHtml(inviterName)}</strong> has invited you to join as <strong style="color: #f97316;">${escapeHtml(role)}</strong>.
        </p>
        
        <p style="font-size: 14px; line-height: 1.6; color: #aaa;">
          Click the button below to set up your password and activate your account.
        </p>
        
        <a href="${escapeHtml(setupUrl)}" style="display: inline-block; background: #f97316; color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px; margin: 16px 0;">
          Set Up Your Account
        </a>
        
        <p style="font-size: 12px; color: #666; margin: 24px 0 0 0;">
          This link expires in 7 days. If you didn't expect this invitation, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;
  return sendEmail(to, subject, html);
}

export async function sendStreamStartedEmail(
  to: string,
  channelName: string,
  destinationNames: string[],
): Promise<boolean> {
  const subject = `Stream Started: ${channelName}`;
  const destList = destinationNames.map((d) => `<li style="padding: 4px 0;">${escapeHtml(d)}</li>`).join("");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="background: #1a1a2e; border-radius: 12px; padding: 32px; color: #e0e0e0;">
        <h1 style="color: #f97316; margin: 0 0 8px 0; font-size: 24px;">${APP_NAME}</h1>
        <div style="display: inline-block; background: #166534; color: #4ade80; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; margin-bottom: 16px;">LIVE</div>
        
        <p style="font-size: 16px; line-height: 1.6;">
          Channel <strong style="color: #fff;">${escapeHtml(channelName)}</strong> is now streaming.
        </p>
        
        ${destList ? `<div style="background: #16162a; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0; font-size: 13px; color: #888;">Destinations:</p>
          <ul style="margin: 0; padding-left: 20px; color: #ccc; font-size: 14px;">${destList}</ul>
        </div>` : ""}
      </div>
    </div>
  `;
  return sendEmail(to, subject, html);
}

export async function sendStreamStoppedEmail(
  to: string,
  channelName: string,
): Promise<boolean> {
  const subject = `Stream Stopped: ${channelName}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="background: #1a1a2e; border-radius: 12px; padding: 32px; color: #e0e0e0;">
        <h1 style="color: #f97316; margin: 0 0 8px 0; font-size: 24px;">${APP_NAME}</h1>
        <div style="display: inline-block; background: #333; color: #999; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; margin-bottom: 16px;">OFFLINE</div>
        
        <p style="font-size: 16px; line-height: 1.6;">
          Channel <strong style="color: #fff;">${escapeHtml(channelName)}</strong> has stopped streaming.
        </p>
      </div>
    </div>
  `;
  return sendEmail(to, subject, html);
}

export async function sendStreamErrorEmail(
  to: string,
  channelName: string,
  errorMessage: string,
): Promise<boolean> {
  const subject = `Stream Error: ${channelName}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="background: #1a1a2e; border-radius: 12px; padding: 32px; color: #e0e0e0;">
        <h1 style="color: #f97316; margin: 0 0 8px 0; font-size: 24px;">${APP_NAME}</h1>
        <div style="display: inline-block; background: #7f1d1d; color: #f87171; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; margin-bottom: 16px;">ERROR</div>
        
        <p style="font-size: 16px; line-height: 1.6;">
          Channel <strong style="color: #fff;">${escapeHtml(channelName)}</strong> encountered an error.
        </p>
        
        <div style="background: #16162a; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0; font-size: 13px; color: #f87171;">${escapeHtml(errorMessage)}</p>
        </div>
        
        <p style="font-size: 13px; color: #888;">
          Auto-recovery will attempt to restart the stream if enabled.
        </p>
      </div>
    </div>
  `;
  return sendEmail(to, subject, html);
}
