import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const UpdateRoleSchema = z.object({
  role: z.enum(['admin', 'employee']),
})

// ---------------------------------------------------------------------------
// PATCH /api/users/[id]/role
// Changes the role of a user within the same tenant.
// Admin only. Cannot demote the last admin in the tenant.
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Require admin caller
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const { profile: callerProfile } = auth

  // 2. Validate route param
  const { id: targetUserId } = await params
  if (!targetUserId) {
    return NextResponse.json({ error: 'Missing user id' }, { status: 400 })
  }

  // 3. Parse and validate body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = UpdateRoleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const { role: newRole } = parsed.data
  const supabaseAdmin = createServiceClient()

  // 4. Verify the target user exists and belongs to the same tenant
  const { data: targetUser, error: targetError } = await supabaseAdmin
    .from('users')
    .select('id, tenant_id, role, display_name, email')
    .eq('id', targetUserId)
    .single()

  if (targetError || !targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (targetUser.tenant_id !== callerProfile.tenant_id) {
    return NextResponse.json(
      { error: 'Cannot modify users outside your tenant' },
      { status: 403 }
    )
  }

  // 5. No-op if role is already correct
  if (targetUser.role === newRole) {
    return NextResponse.json(
      { message: 'Role is already set to the requested value' },
      { status: 200 }
    )
  }

  // 6. Last-admin guard: block demoting the last admin in the tenant
  if (newRole === 'employee') {
    const { count, error: countError } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', callerProfile.tenant_id)
      .eq('role', 'admin')
      .eq('is_active', true)

    if (countError) {
      return NextResponse.json(
        { error: 'Failed to verify admin count' },
        { status: 500 }
      )
    }

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'At least one admin must remain in the team' },
        { status: 422 }
      )
    }
  }

  // 7. Update role in public.users
  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({ role: newRole })
    .eq('id', targetUserId)

  if (updateError) {
    return NextResponse.json(
      { error: 'Failed to update role' },
      { status: 500 }
    )
  }

  // 8. Sync role to Supabase Auth app_metadata so JWT reflects the new role
  const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(
    targetUserId,
    {
      app_metadata: {
        tenant_id: targetUser.tenant_id,
        role: newRole,
      },
    }
  )

  if (metaError) {
    // Non-fatal: DB is source of truth; JWT will sync on next token refresh
    console.error(
      `Failed to sync app_metadata for user ${targetUserId}:`,
      metaError.message
    )
  }

  logActivity({
    tenantId: callerProfile.tenant_id,
    actorId: auth.user.id,
    eventType: 'user.role_changed',
    resourceType: 'user',
    resourceId: targetUserId,
    resourceName: targetUser.display_name ?? targetUser.email ?? targetUserId,
    metadata: { old_role: targetUser.role, new_role: newRole },
  })

  return NextResponse.json(
    {
      message: 'Role updated successfully',
      userId: targetUserId,
      role: newRole,
    },
    { status: 200 }
  )
}
