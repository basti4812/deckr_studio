import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

// ---------------------------------------------------------------------------
// POST /api/profile/avatar — upload a new profile picture
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 5 uploads per 15 minutes
  const limited = await checkRateLimit(user.id, 'profile:avatar', 5, 15 * 60 * 1000)
  if (limited) return limited

  const profile = await getUserProfile(user.id)
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  let formData: FormData
  try { formData = await request.formData() } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('avatar')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No avatar file provided' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, and WebP images are allowed' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Image must be smaller than 5 MB' }, { status: 400 })
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
  const storagePath = `${profile.tenant_id}/${user.id}/avatar.${ext}`

  const supabase = createServiceClient()

  // Remove any existing avatar with a different extension first
  const { data: existing } = await supabase.storage
    .from('avatars')
    .list(`${profile.tenant_id}/${user.id}`)
  if (existing) {
    const toDelete = existing
      .filter((f) => f.name.startsWith('avatar.') && f.name !== `avatar.${ext}`)
      .map((f) => `${profile.tenant_id}/${user.id}/${f.name}`)
    if (toDelete.length > 0) {
      await supabase.storage.from('avatars').remove(toDelete)
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(storagePath, buffer, { contentType: file.type, upsert: true })

  if (uploadError) {
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(storagePath)

  const { error: dbError } = await supabase
    .from('users')
    .update({ avatar_url: publicUrl })
    .eq('id', user.id)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json({ avatar_url: publicUrl })
}

// ---------------------------------------------------------------------------
// DELETE /api/profile/avatar — remove profile picture
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserProfile(user.id)
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const supabase = createServiceClient()

  const { data: existing } = await supabase.storage
    .from('avatars')
    .list(`${profile.tenant_id}/${user.id}`)

  if (existing && existing.length > 0) {
    const paths = existing.map((f) => `${profile.tenant_id}/${user.id}/${f.name}`)
    await supabase.storage.from('avatars').remove(paths)
  }

  const { error } = await supabase
    .from('users')
    .update({ avatar_url: null })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
