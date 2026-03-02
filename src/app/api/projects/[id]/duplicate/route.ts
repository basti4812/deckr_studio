import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Params = Promise<{ id: string }>

// ---------------------------------------------------------------------------
// POST /api/projects/[id]/duplicate
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'project-duplicate', 10, 60_000)
  if (limited) return limited

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
  }

  const profile = await getUserProfile(user.id)
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const supabase = createServiceClient()

  // Fetch the original project
  const { data: original, error: fetchError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !original) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Tenant isolation: project must belong to the same tenant as the user
  if (original.tenant_id !== profile.tenant_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Check access: user must own OR have a share record
  if (original.owner_id !== user.id) {
    const { data: share } = await supabase
      .from('project_shares')
      .select('id')
      .eq('project_id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!share) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  // Build duplicate name — "Copy of [name]" truncated to 120 chars
  const prefix = 'Copy of '
  const maxNameLength = 120
  let duplicateName = prefix + original.name
  if (duplicateName.length > maxNameLength) {
    duplicateName = duplicateName.slice(0, maxNameLength)
  }

  // Insert the duplicate (single transaction)
  const { data: duplicate, error: insertError } = await supabase
    .from('projects')
    .insert({
      name: duplicateName,
      owner_id: user.id,
      tenant_id: profile.tenant_id,
      slide_order: original.slide_order ?? [],
      text_edits: original.text_edits ?? {},
      status: 'active',
    })
    .select()
    .single()

  if (insertError || !duplicate) {
    return NextResponse.json(
      { error: insertError?.message ?? 'Failed to duplicate project' },
      { status: 500 },
    )
  }

  return NextResponse.json({ project: duplicate }, { status: 201 })
}
