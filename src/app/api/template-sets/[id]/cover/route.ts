import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// POST /api/template-sets/[id]/cover — upload cover image
// ---------------------------------------------------------------------------

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'template-sets:cover', 10, 60 * 1000)
  if (limited) return limited

  const { id } = await params
  const supabase = createServiceClient()

  // Verify ownership
  const { data: existing } = await supabase
    .from('template_sets')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Template set not found' }, { status: 404 })

  const formData = await request.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })

  const file = formData.get('cover') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, and WebP images are accepted' }, { status: 400 })
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'Image must be under 5 MB' }, { status: 400 })
  }

  // Magic bytes validation — guard against MIME type spoofing
  const headerBytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const isJpeg = headerBytes[0] === 0xff && headerBytes[1] === 0xd8 && headerBytes[2] === 0xff
  const isPng =
    headerBytes[0] === 0x89 &&
    headerBytes[1] === 0x50 &&
    headerBytes[2] === 0x4e &&
    headerBytes[3] === 0x47 &&
    headerBytes[4] === 0x0d &&
    headerBytes[5] === 0x0a &&
    headerBytes[6] === 0x1a &&
    headerBytes[7] === 0x0a
  const isWebp =
    headerBytes[0] === 0x52 &&
    headerBytes[1] === 0x49 &&
    headerBytes[2] === 0x46 &&
    headerBytes[3] === 0x46 &&
    headerBytes[8] === 0x57 &&
    headerBytes[9] === 0x45 &&
    headerBytes[10] === 0x42 &&
    headerBytes[11] === 0x50

  const validSignature =
    (file.type === 'image/jpeg' && isJpeg) ||
    (file.type === 'image/png' && isPng) ||
    (file.type === 'image/webp' && isWebp)

  if (!validSignature) {
    return NextResponse.json({ error: 'File content does not match the declared image type' }, { status: 400 })
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const storagePath = `${auth.profile.tenant_id}/${id}/cover.${ext}`

  const { error: storageError } = await supabase.storage
    .from('template-sets')
    .upload(storagePath, file, { contentType: file.type, upsert: true })

  if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 })

  const { data: urlData } = await supabase.storage
    .from('template-sets')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365)

  const cover_image_url = urlData?.signedUrl ?? null

  const { data, error } = await supabase
    .from('template_sets')
    .update({ cover_image_url })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templateSet: data })
}
