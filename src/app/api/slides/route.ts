import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getUserProfile, requireAdmin } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// GET /api/slides — list all slides for the caller's tenant (all auth users)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserProfile(user.id)
  if (!profile) return NextResponse.json({ error: 'User profile not found' }, { status: 404 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('slides')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ slides: data })
}

// ---------------------------------------------------------------------------
// POST /api/slides — create a new slide record
// Body: { title, status?, pptx_url?, thumbnail_url?, editable_fields? }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let body: {
    title?: string
    status?: string
    pptx_url?: string
    thumbnail_url?: string
    editable_fields?: unknown[]
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { title, status = 'standard', pptx_url, thumbnail_url, editable_fields = [] } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const validStatuses = ['standard', 'mandatory', 'deprecated']
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('slides')
    .insert({
      tenant_id: auth.profile.tenant_id,
      title: title.trim(),
      status,
      pptx_url: pptx_url ?? null,
      thumbnail_url: thumbnail_url ?? null,
      editable_fields,
      created_by: auth.user.id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ slide: data }, { status: 201 })
}
