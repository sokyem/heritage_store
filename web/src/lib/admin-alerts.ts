import prisma from '@/lib/prisma';
import { sendSMS } from '@/lib/sms';
import { sendAdminEmail } from '@/lib/email';

const ADMIN_ALERT_PHONE = process.env.ADMIN_ALERT_PHONE || '';
const APP_URL = process.env.NEXTAUTH_URL || 'https://www.awulak.com';

export interface AdminAlertInput {
  type: string;        // in-app notification type, e.g. 'new_consultation'
  title: string;       // in-app title + email subject
  message: string;     // in-app message + SMS + email body
  relatedId?: string;  // entity id; also used to de-dupe the in-app fan-out
  path?: string;       // admin deep link (relative), appended to SMS/email
}

/**
 * Alert the team about new activity across ALL channels at once:
 *   1. in-app notification for every admin (founder/staff), deduped by
 *      type+relatedId so retries don't pile up
 *   2. SMS to ADMIN_ALERT_PHONE (no-op if unset or Twilio unconfigured)
 *   3. email to the configured admin address
 *
 * Every channel is independent and best-effort — a failure in one never throws
 * or blocks the others (or the caller's request).
 */
export async function alertAdmins({ type, title, message, relatedId, path }: AdminAlertInput): Promise<void> {
  const url = path ? `${APP_URL}${path}` : '';

  // 1. In-app for all admins.
  try {
    const admins = await prisma.user.findMany({
      where: { role: { in: ['founder', 'staff'] } },
      select: { id: true },
    });
    if (admins.length) {
      const already = relatedId
        ? await prisma.notification.findFirst({ where: { type, relatedId } })
        : null;
      if (!already) {
        await prisma.notification.createMany({
          data: admins.map((a) => ({ userId: a.id, type, title, message, relatedId: relatedId || null })),
        });
      }
    }
  } catch (err) {
    console.error('[admin-alerts] in-app failed:', err);
  }

  // 2. SMS.
  if (ADMIN_ALERT_PHONE) {
    try {
      await sendSMS(ADMIN_ALERT_PHONE, `${message}${url ? ` ${url}` : ''}`);
    } catch (err) {
      console.error('[admin-alerts] sms failed:', err);
    }
  }

  // 3. Email.
  try {
    await sendAdminEmail(title, `<p>${message}</p>${url ? `<p><a href="${url}">${url}</a></p>` : ''}`);
  } catch (err) {
    console.error('[admin-alerts] email failed:', err);
  }
}
