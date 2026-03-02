import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

// ---------------------------------------------------------------------------
// POST /api/team/[id]/invite/resend — Resend a pending invitation email
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { user: adminUser, profile: adminProfile } = auth
  const { id: targetUserId } = await params

  if (!targetUserId) {
    return NextResponse.json({ error: 'Missing user id' }, { status: 400 })
  }

  // Rate limit: 5 resends per 15 minutes
  const limited = await checkRateLimit(
    adminUser.id,
    'team:invite-resend',
    5,
    15 * 60 * 1000
  )
  if (limited) return limited

  const supabase = createServiceClient()

  // Verify the target user exists and belongs to the same tenant
  const { data: targetUser, error: targetError } = await supabase
    .from('users')
    .select('id, tenant_id, email, is_active')
    .eq('id', targetUserId)
    .single()

  if (targetError || !targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (targetUser.tenant_id !== adminProfile.tenant_id) {
    return NextResponse.json(
      { error: 'Cannot modify users outside your tenant' },
      { status: 403 }
    )
  }

  // Verify user is pending (email not confirmed)
  const { data: authUser } = await supabase.auth.admin.getUserById(targetUserId)
  if (!authUser?.user || authUser.user.email_confirmed_at) {
    return NextResponse.json(
      { error: 'This user has already accepted the invitation' },
      { status: 422 }
    )
  }

  // Re-invite to reset the 7-day expiry.
  // Strategy: delete old first (required — Supabase blocks duplicate emails),
  // then create new invite. If re-invite fails, restore the old record.
  const email = targetUser.email

  // Delete old auth user + DB row
  await supabase.auth.admin.deleteUser(targetUserId)
  await supabase.from('users').delete().eq('id', targetUserId)

  // Re-invite with a fresh token
  const { data: inviteData, error: inviteError } =
    await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        tenant_id: adminProfile.tenant_id,
        role: 'employee',
      },
    })

  if (inviteError || !inviteData?.user?.id) {
    // Restore: recreate the old auth user + DB row so the invitation isn't lost
    const { data: restored } = await supabase.auth.admin.createUser({
      email,
      email_confirm: false,
      app_metadata: { tenant_id: adminProfile.tenant_id, role: 'employee' },
    })
    if (restored?.user) {
      await supabase.from('users').insert({
        id: restored.user.id,
        tenant_id: adminProfile.tenant_id,
        email,
        role: 'employee',
        display_name: null,
        is_active: true,
      })
    }
    return NextResponse.json(
      { error: 'Failed to resend invitation. The original invitation has been preserved.' },
      { status: 500 }
    )
  }

  const newUserId = inviteData.user.id

  // Create new user record
  await supabase.from('users').insert({
    id: newUserId,
    tenant_id: adminProfile.tenant_id,
    email,
    role: 'employee',
    display_name: null,
    is_active: true,
  })

  // Set app_metadata
  await supabase.auth.admin.updateUserById(newUserId, {
    app_metadata: { tenant_id: adminProfile.tenant_id, role: 'employee' },
  })

  return NextResponse.json({
    message: 'Invitation resent successfully',
    member: {
      id: newUserId,
      email,
      display_name: null,
      role: 'employee',
      is_active: true,
      avatar_url: null,
      last_active_at: null,
      created_at: new Date().toISOString(),
      is_pending: true,
    },
  })
}

// ---------------------------------------------------------------------------
// DELETE /api/team/[id]/invite — Cancel a pending invitation
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { profile: adminProfile } = auth
  const { id: targetUserId } = await params

  if (!targetUserId) {
    return NextResponse.json({ error: 'Missing user id' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Verify the target user exists and belongs to the same tenant
  const { data: targetUser, error: targetError } = await supabase
    .from('users')
    .select('id, tenant_id, is_active')
    .eq('id', targetUserId)
    .single()

  if (targetError || !targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (targetUser.tenant_id !== adminProfile.tenant_id) {
    return NextResponse.json(
      { error: 'Cannot modify users outside your tenant' },
      { status: 403 }
    )
  }

  // Verify user is pending (email not confirmed)
  const { data: authUser } = await supabase.auth.admin.getUserById(targetUserId)
  if (!authUser?.user || authUser.user.email_confirmed_at) {
    return NextResponse.json(
      { error: 'This user has already accepted the invitation and cannot be cancelled' },
      { status: 422 }
    )
  }

  // Delete the user record from our table
  const { error: deleteUserError } = await supabase
    .from('users')
    .delete()
    .eq('id', targetUserId)

  if (deleteUserError) {
    return NextResponse.json(
      { error: 'Failed to cancel invitation' },
      { status: 500 }
    )
  }

  // Delete the Supabase Auth user (invalidates the invite link)
  const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(
    targetUserId
  )

  if (deleteAuthError) {
    console.error('Failed to delete auth user:', deleteAuthError.message)
    // Non-fatal: the users row is already deleted
  }

  return NextResponse.json({
    message: 'Invitation cancelled successfully',
    userId: targetUserId,
  })
}
