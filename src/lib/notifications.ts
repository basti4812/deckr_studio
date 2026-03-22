import { createServiceClient } from '@/lib/supabase'
import { sendNotificationEmail, generateUnsubscribeToken, MANDATORY_EMAIL_TYPES } from '@/lib/email'
import { checkRateLimit } from '@/lib/rate-limit'

// ---------------------------------------------------------------------------
// Notification types
// ---------------------------------------------------------------------------

export type NotificationType =
  | 'project_shared'
  | 'team_member_joined'
  | 'payment_failed'
  | 'slide_deprecated'
  | 'slide_updated'
  | 'slide_archived'
  | 'slide_deleted'
  | 'trial_ending_7d'
  | 'trial_ending_1d'
  | 'comment_added'

export type ResourceType = 'project' | 'slide' | 'billing'

interface CreateNotificationParams {
  tenantId: string
  userId: string
  type: NotificationType
  message: string
  resourceType?: ResourceType
  resourceId?: string
}

// ---------------------------------------------------------------------------
// Check if user has opted in to email for this notification type
// null preferences = all opted in (default)
// ---------------------------------------------------------------------------

function isEmailOptedIn(
  prefs: Record<string, boolean> | null | undefined,
  type: NotificationType
): boolean {
  if (!prefs) return true // default: all on
  if (MANDATORY_EMAIL_TYPES.includes(type as never)) return true // cannot opt out
  return prefs[type] !== false // undefined = opted in
}

// ---------------------------------------------------------------------------
// Co-send email for a notification (fire-and-forget)
// ---------------------------------------------------------------------------

async function maybeSendEmail(params: CreateNotificationParams): Promise<void> {
  if (!process.env.RESEND_API_KEY) return

  // Email rate limit: max 1 email per type per user per hour
  const rateLimited = await checkRateLimit(params.userId, `email:${params.type}`, 1, 60 * 60 * 1000)
  if (rateLimited) return // silently skip — in-app notification still created

  const supabase = createServiceClient()

  // Fetch user email from Auth + notification preferences from users table
  const [{ data: authUser }, { data: userRow }] = await Promise.all([
    supabase.auth.admin.getUserById(params.userId),
    supabase.from('users').select('notification_preferences').eq('id', params.userId).single(),
  ])

  const email = authUser?.user?.email
  if (!email) return

  const prefs = userRow?.notification_preferences as Record<string, boolean> | null
  if (!isEmailOptedIn(prefs, params.type)) return

  // Fetch tenant name for email sender/subject
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', params.tenantId)
    .single()

  const tenantName = tenant?.name ?? 'onslide Studio'
  const isMandatory = MANDATORY_EMAIL_TYPES.includes(params.type as never)
  const unsubscribeToken = !isMandatory
    ? generateUnsubscribeToken(params.userId, params.type)
    : undefined

  await sendNotificationEmail({
    to: email,
    tenantName,
    type: params.type,
    message: params.message,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    unsubscribeToken,
  })
}

// ---------------------------------------------------------------------------
// Insert a single notification (fire-and-forget, non-blocking)
// ---------------------------------------------------------------------------

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  const supabase = createServiceClient()
  await supabase.from('notifications').insert({
    tenant_id: params.tenantId,
    user_id: params.userId,
    type: params.type,
    message: params.message,
    resource_type: params.resourceType ?? null,
    resource_id: params.resourceId ?? null,
  })

  // Co-send email (fire-and-forget — failure must not propagate)
  maybeSendEmail(params).catch((err) => console.error('[notifications] Email send error:', err))
}

// ---------------------------------------------------------------------------
// Insert notifications for multiple users at once
// ---------------------------------------------------------------------------

export async function createNotifications(
  notifications: CreateNotificationParams[]
): Promise<void> {
  if (notifications.length === 0) return
  const supabase = createServiceClient()
  await supabase.from('notifications').insert(
    notifications.map((n) => ({
      tenant_id: n.tenantId,
      user_id: n.userId,
      type: n.type,
      message: n.message,
      resource_type: n.resourceType ?? null,
      resource_id: n.resourceId ?? null,
    }))
  )

  // Co-send emails (fire-and-forget for each)
  for (const n of notifications) {
    maybeSendEmail(n).catch((err) => console.error('[notifications] Email send error:', err))
  }
}
