import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import { logActivity } from '@/lib/activity-log'

// ---------------------------------------------------------------------------
// DELETE /api/team/[id] — Remove a user (soft-delete + project transfer)
// ---------------------------------------------------------------------------

export async function DELETE(
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

  // Rate limit: 10 removals per 15 minutes
  const limited = await checkRateLimit(adminUser.id, 'team:remove', 10, 15 * 60 * 1000)
  if (limited) return limited

  // Cannot remove yourself
  if (targetUserId === adminUser.id) {
    return NextResponse.json({ error: 'You cannot remove yourself from the team' }, { status: 422 })
  }

  const supabase = createServiceClient()

  // Verify the target user exists and belongs to the same tenant
  const { data: targetUser, error: targetError } = await supabase
    .from('users')
    .select('id, tenant_id, role, display_name, is_active')
    .eq('id', targetUserId)
    .single()

  if (targetError || !targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (targetUser.tenant_id !== adminProfile.tenant_id) {
    return NextResponse.json({ error: 'Cannot modify users outside your tenant' }, { status: 403 })
  }

  if (!targetUser.is_active) {
    return NextResponse.json({ error: 'User is already removed' }, { status: 404 })
  }

  // Last admin guard: if the target is an admin, check there's at least one other
  if (targetUser.role === 'admin') {
    const { count } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', adminProfile.tenant_id)
      .eq('role', 'admin')
      .eq('is_active', true)

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'Cannot remove the last admin in the team' },
        { status: 422 }
      )
    }
  }

  // 1. Atomically deactivate user and transfer their projects
  const { error: removeError } = await supabase.rpc('remove_user_and_transfer_projects', {
    p_target_user_id: targetUserId,
    p_admin_user_id: adminUser.id,
    p_tenant_id: adminProfile.tenant_id,
  })

  if (removeError) {
    return NextResponse.json({ error: 'Failed to remove user' }, { status: 500 })
  }

  // 2. Ban the user in Supabase Auth to invalidate all sessions
  try {
    await supabase.auth.admin.updateUserById(targetUserId, {
      ban_duration: '876600h',
    })
  } catch (err) {
    console.error('Failed to ban user:', err)
    // Non-fatal: user record is already inactive, proxy will block them
  }

  logActivity({
    tenantId: adminProfile.tenant_id,
    actorId: adminUser.id,
    eventType: 'user.removed',
    resourceType: 'user',
    resourceId: targetUserId,
    resourceName: targetUser.display_name ?? targetUser.id,
  })

  return NextResponse.json({
    message: 'User removed successfully',
    userId: targetUserId,
  })
}
