import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { ALL_EVENT_TYPES } from '@/lib/activity-log'

const PAGE_SIZE = 20

// ---------------------------------------------------------------------------
// GET /api/activity-logs
// Query params:
//   page        - 1-based page number (default: 1)
//   event_types - comma-separated list of event types to filter (optional)
//   actor_id    - UUID of a single user to filter (optional)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { profile } = auth
  const supabase = createServiceClient()
  const { searchParams } = request.nextUrl

  // Parse query params
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const rawEventTypes = searchParams.get('event_types')
  const actorId = searchParams.get('actor_id')

  const eventTypes = rawEventTypes
    ? rawEventTypes
        .split(',')
        .map((t) => t.trim())
        .filter((t) => ALL_EVENT_TYPES.includes(t as never))
    : null

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  // Build query
  let query = supabase
    .from('activity_logs')
    .select(
      `
      id,
      event_type,
      resource_type,
      resource_id,
      resource_name,
      metadata,
      created_at,
      actor:users!actor_id (
        id,
        display_name,
        avatar_url,
        email
      )
    `,
      { count: 'exact' }
    )
    .eq('tenant_id', profile.tenant_id)
    .gte('created_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .range(from, to)

  if (eventTypes && eventTypes.length > 0) {
    query = query.in('event_type', eventTypes)
  }

  if (actorId) {
    query = query.eq('actor_id', actorId)
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch activity logs' },
      { status: 500 }
    )
  }

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE)

  return NextResponse.json({
    logs: data ?? [],
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      total: count ?? 0,
      totalPages,
    },
  })
}
