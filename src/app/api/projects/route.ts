import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// GET /api/projects — list active projects owned by the caller, most recent first
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserProfile(user.id)
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('owner_id', user.id)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ projects: data ?? [] })
}

// ---------------------------------------------------------------------------
// POST /api/projects — create a new project
// Body: { name }
// Auto-populates slide_order with mandatory slides for the tenant.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserProfile(user.id)
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  let body: { name?: string } = {}
  try { body = await request.json() } catch { /* ok */ }

  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (name.length > 120) return NextResponse.json({ error: 'name too long (max 120)' }, { status: 400 })

  const supabase = createServiceClient()

  // Fetch mandatory slides to pre-populate tray
  const { data: mandatorySlides } = await supabase
    .from('slides')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('status', 'mandatory')

  const slideOrder = (mandatorySlides ?? []).map((s) => ({
    id: crypto.randomUUID(),
    slide_id: s.id,
  }))

  const { data, error } = await supabase
    .from('projects')
    .insert({
      tenant_id: profile.tenant_id,
      owner_id: user.id,
      name,
      slide_order: slideOrder,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ project: data }, { status: 201 })
}
