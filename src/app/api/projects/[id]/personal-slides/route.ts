import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireActiveUser } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

type Params = Promise<{ id: string }>

const MAX_PERSONAL_SLIDES_PER_PROJECT = 20

// ---------------------------------------------------------------------------
// Verify project access — returns 'owner' | 'view' | 'edit' | null
// ---------------------------------------------------------------------------

async function getProjectPermission(
  projectId: string,
  userId: string,
  tenantId: string
): Promise<'owner' | 'view' | 'edit' | null> {
  const supabase = createServiceClient()
  // SEC: Filter by tenant_id to prevent cross-tenant access
  const { data: project } = await supabase
    .from('projects')
    .select('id, owner_id')
    .eq('id', projectId)
    .eq('tenant_id', tenantId)
    .single()

  if (!project) return null
  if (project.owner_id === userId) return 'owner'

  const { data: share } = await supabase
    .from('project_shares')
    .select('permission')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!share) return null
  return share.permission as 'view' | 'edit'
}

// ---------------------------------------------------------------------------
// GET /api/projects/[id]/personal-slides — list personal slides for a project
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const auth = await requireActiveUser(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'personal-slides:list', 60, 60_000)
  if (limited) return limited

  const { id: projectId } = await params

  const permission = await getProjectPermission(projectId, auth.user.id, auth.profile.tenant_id)
  if (!permission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('project_personal_slides')
    .select(
      'id, project_id, user_id, title, filename, pptx_storage_path, file_size_bytes, uploaded_at'
    )
    .eq('project_id', projectId)
    .order('uploaded_at', { ascending: true })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ slides: data })
}

// ---------------------------------------------------------------------------
// POST /api/projects/[id]/personal-slides — register a personal slide
// Body: { title, filename, pptx_storage_path, file_size_bytes }
// ---------------------------------------------------------------------------

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  filename: z.string().min(1).max(255),
  pptx_storage_path: z.string().min(1),
  file_size_bytes: z
    .number()
    .int()
    .min(1)
    .max(50 * 1024 * 1024), // 50 MB
})

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const auth = await requireActiveUser(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'personal-slides:create', 20, 60_000)
  if (limited) return limited

  const { id: projectId } = await params

  const permission = await getProjectPermission(projectId, auth.user.id, auth.profile.tenant_id)
  if (!permission) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (permission === 'view') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = CreateSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    )
  }

  const { title, filename, pptx_storage_path, file_size_bytes } = parsed.data

  // Verify the storage path belongs to this project + user
  const expectedPrefix = `${projectId}/${auth.user.id}/`
  if (!pptx_storage_path.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: 'Invalid storage path' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Check quota
  const { count, error: countError } = await supabase
    .from('project_personal_slides')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })
  if ((count ?? 0) >= MAX_PERSONAL_SLIDES_PER_PROJECT) {
    return NextResponse.json(
      { error: `Maximum ${MAX_PERSONAL_SLIDES_PER_PROJECT} personal slides per project` },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('project_personal_slides')
    .insert({
      project_id: projectId,
      user_id: auth.user.id,
      title: title.trim(),
      filename,
      pptx_storage_path,
      file_size_bytes,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ slide: data }, { status: 201 })
}
