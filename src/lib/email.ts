import nodemailer from 'nodemailer'

// ---------------------------------------------------------------------------
// Email helper — sends transactional emails via Gmail SMTP
// ---------------------------------------------------------------------------

// Lazy transporter — only created when SMTP credentials are present
function getTransporter(): nodemailer.Transporter | null {
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) return null
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  })
}

const FROM_EMAIL = process.env.SMTP_USER ?? 'onslide.studio@gmail.com'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export type NotificationEmailType =
  | 'project_shared'
  | 'team_member_joined'
  | 'payment_failed'
  | 'slide_deprecated'
  | 'slide_updated'
  | 'trial_ending_7d'
  | 'trial_ending_1d'
  | 'comment_added'

// Mandatory types that cannot be unsubscribed from
export const MANDATORY_EMAIL_TYPES: NotificationEmailType[] = [
  'payment_failed',
  'trial_ending_7d',
  'trial_ending_1d',
]

interface SendEmailParams {
  to: string
  tenantName: string
  type: NotificationEmailType
  message: string
  resourceType?: string | null
  resourceId?: string | null
  unsubscribeToken?: string
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildResourceUrl(resourceType?: string | null, resourceId?: string | null): string | null {
  if (!resourceType) return null
  if (resourceType === 'billing') return `${APP_URL}/admin/billing`
  if (resourceType === 'project' && resourceId) return `${APP_URL}/board?project=${resourceId}`
  if (resourceType === 'slide') return `${APP_URL}/board`
  return null
}

function buildEmailHtml(params: SendEmailParams): string {
  const { resourceType, resourceId, unsubscribeToken, type } = params
  const tenantName = escapeHtml(params.tenantName)
  const message = escapeHtml(params.message)
  const resourceUrl = buildResourceUrl(resourceType, resourceId)
  const isMandatory = MANDATORY_EMAIL_TYPES.includes(type)
  const unsubscribeUrl =
    !isMandatory && unsubscribeToken
      ? `${APP_URL}/api/notifications/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
      : null

  const ctaButton = resourceUrl
    ? `<a href="${resourceUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;margin-top:16px">View in onslide Studio →</a>`
    : ''

  const unsubscribeSection = unsubscribeUrl
    ? `<p style="font-size:12px;color:#71717a;margin-top:32px;padding-top:16px;border-top:1px solid #e4e4e7">
        Don't want these emails? <a href="${unsubscribeUrl}" style="color:#71717a">Unsubscribe from this notification type</a>.
      </p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;padding:40px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e4e4e7;padding:32px">
        <tr><td>
          <p style="font-size:13px;font-weight:600;color:#71717a;letter-spacing:0.05em;text-transform:uppercase;margin:0 0 24px">${tenantName}</p>
          <p style="font-size:16px;color:#18181b;line-height:1.6;margin:0">${message}</p>
          ${ctaButton}
          ${unsubscribeSection}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Main send function — fire-and-forget safe (does not throw)
// ---------------------------------------------------------------------------

export async function sendNotificationEmail(params: SendEmailParams): Promise<void> {
  const transporter = getTransporter()
  if (!transporter) return // Not configured — skip silently

  const html = buildEmailHtml(params)
  // SEC-17: Strip newlines/control chars to prevent email header injection, truncate to 200 chars
  const sanitize = (s: string) => s.replace(/[\r\n\t]/g, ' ').trim()
  const subject = `${sanitize(params.tenantName)}: ${sanitize(params.message)}`.slice(0, 200)
  const fromName = params.tenantName.replace(/[<>"\r\n]/g, '') // sanitize for email header

  try {
    await transporter.sendMail({
      from: `${fromName} via onslide Studio <${FROM_EMAIL}>`,
      to: params.to,
      subject,
      html,
    })
  } catch (err) {
    console.error('[email] Failed to send notification email:', err)
  }
}

// ---------------------------------------------------------------------------
// HMAC token helpers for unsubscribe links
// ---------------------------------------------------------------------------

import { createHmac, timingSafeEqual } from 'crypto'

function getHmacSecret(): string {
  const secret = process.env.WEBHOOK_SECRET
  if (!secret) throw new Error('[email] WEBHOOK_SECRET is required for unsubscribe tokens')
  return secret
}

export function generateUnsubscribeToken(userId: string, type: string): string {
  const payload = `${userId}:${type}`
  const sig = createHmac('sha256', getHmacSecret()).update(payload).digest('hex')
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

export function verifyUnsubscribeToken(token: string): { userId: string; type: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const lastColon = decoded.lastIndexOf(':')
    const payload = decoded.slice(0, lastColon)
    const sig = decoded.slice(lastColon + 1)

    const expectedSig = createHmac('sha256', getHmacSecret()).update(payload).digest('hex')
    const sigBuf = Buffer.from(sig, 'hex')
    const expectedBuf = Buffer.from(expectedSig, 'hex')

    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null
    }

    const [userId, type] = payload.split(':')
    if (!userId || !type) return null
    return { userId, type }
  } catch {
    return null
  }
}
