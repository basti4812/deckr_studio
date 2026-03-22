import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type ActivityEventType =
  | 'slide.uploaded'
  | 'slide.deprecated'
  | 'slide.archived'
  | 'slide.deleted'
  | 'template_set.created'
  | 'template_set.updated'
  | 'project.exported'
  | 'user.invited'
  | 'user.removed'
  | 'user.role_changed'
  | 'subscription.changed'
  | 'share_link.created'

export const ALL_EVENT_TYPES: ActivityEventType[] = [
  'slide.uploaded',
  'slide.deprecated',
  'slide.archived',
  'slide.deleted',
  'template_set.created',
  'template_set.updated',
  'project.exported',
  'user.invited',
  'user.removed',
  'user.role_changed',
  'subscription.changed',
  'share_link.created',
]

// ---------------------------------------------------------------------------
// logActivity — fire-and-forget, never throws
// ---------------------------------------------------------------------------

export interface LogActivityParams {
  tenantId: string
  actorId: string
  eventType: ActivityEventType
  resourceType?: string
  resourceId?: string
  resourceName?: string
  metadata?: Record<string, unknown>
}

export function logActivity(params: LogActivityParams): void {
  try {
    const supabase = createServiceClient()
    supabase
      .from('activity_logs')
      .insert({
        tenant_id: params.tenantId,
        actor_id: params.actorId,
        event_type: params.eventType,
        resource_type: params.resourceType ?? null,
        resource_id: params.resourceId ?? null,
        resource_name: params.resourceName ?? null,
        metadata: params.metadata ?? {},
      })
      .then(({ error }) => {
        if (error) console.error('[activity-log] insert failed:', error.message)
      })
  } catch (err) {
    console.error('[activity-log] setup failed:', err)
  }
}
