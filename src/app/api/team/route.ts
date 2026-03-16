import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import { logActivity } from '@/lib/activity-log'
import { createNotifications } from '@/lib/notifications'

// ---------------------------------------------------------------------------
// GET /api/team — Fetch all team members (active + pending) for the admin's tenant
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { profile } = auth
  const supabase = createServiceClient()

  // Fetch team members with pending status in a single query (no N+1)
  const { data: members, error } = await supabase.rpc('get_team_members', {
    p_tenant_id: profile.tenant_id,
  })

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 })
  }

  // Fetch subscription for seat info
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('licensed_seats')
    .eq('tenant_id', profile.tenant_id)
    .single()

  // Count active confirmed users for seat count (excludes pending)
  const activeConfirmedCount = (members ?? []).filter(
    (m: { is_pending: boolean }) => !m.is_pending
  ).length

  return NextResponse.json({
    members: members ?? [],
    seats: {
      used: activeConfirmedCount,
      total: subscription?.licensed_seats ?? null,
    },
  })
}

// ---------------------------------------------------------------------------
// POST /api/team/invite — Send an email invitation via Supabase Auth
// ---------------------------------------------------------------------------

const InviteSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
})

// POST /api/team — multiplexed: invite or create based on `action` field
// Actually, per tech design, invite and create are separate.
// We use the query param ?action=invite or ?action=create

const CreateUserSchema = z.object({
  display_name: z.string().min(1, 'Name is required').max(80),
  email: z.string().email('Please provide a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['admin', 'employee']).default('employee'),
})

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { user, profile } = auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = (body as Record<string, unknown>)?.action

  if (action === 'invite') {
    return handleInvite(user.id, profile.tenant_id, body)
  } else if (action === 'create') {
    return handleCreateUser(user.id, profile.tenant_id, body)
  } else {
    return NextResponse.json(
      { error: 'Missing or invalid action. Use "invite" or "create".' },
      { status: 400 }
    )
  }
}

// ---------------------------------------------------------------------------
// Invite handler
// ---------------------------------------------------------------------------

async function handleInvite(adminUserId: string, tenantId: string, body: unknown) {
  // Rate limit: 10 invites per 15 minutes
  const limited = await checkRateLimit(adminUserId, 'team:invite', 10, 15 * 60 * 1000)
  if (limited) return limited

  const parsed = InviteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    )
  }

  const { email } = parsed.data
  const supabase = createServiceClient()

  // Check seat limit
  const seatCheck = await checkSeatLimit(supabase, tenantId)
  if (seatCheck) return seatCheck

  // Check if email already exists in this tenant
  const { data: existingUser } = await supabase
    .from('users')
    .select('id, is_active')
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .maybeSingle()

  if (existingUser) {
    if (existingUser.is_active) {
      // Check if this is a pending user (not yet confirmed)
      const { data: authUser } = await supabase.auth.admin.getUserById(existingUser.id)
      if (authUser?.user && !authUser.user.email_confirmed_at) {
        return NextResponse.json(
          { error: 'An invitation has already been sent to this email' },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: 'This email is already a team member' }, { status: 409 })
    }
    // Inactive user with same email — could be a removed user
    return NextResponse.json({ error: 'This email is already a team member' }, { status: 409 })
  }

  // Generate invite link via Supabase Auth (returns the link for copy/share)
  const { data: inviteData, error: inviteError } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      data: {
        tenant_id: tenantId,
        role: 'employee',
      },
    },
  })

  if (inviteError) {
    // Check for "already registered" error from Supabase
    if (inviteError.message?.includes('already been registered')) {
      return NextResponse.json(
        { error: 'This email is already registered in the system' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: inviteError.message ?? 'Failed to send invitation' },
      { status: 500 }
    )
  }

  const invitedUserId = inviteData?.user?.id
  const inviteLink = inviteData?.properties?.action_link ?? null
  if (!invitedUserId) {
    return NextResponse.json({ error: 'Failed to create invited user' }, { status: 500 })
  }

  // Create user record in our users table
  const { error: insertError } = await supabase.from('users').insert({
    id: invitedUserId,
    tenant_id: tenantId,
    email,
    role: 'employee',
    display_name: null,
    is_active: true,
  })

  if (insertError) {
    console.error('Failed to insert invited user record:', insertError.message)
    // Clean up the auth user if insert fails
    await supabase.auth.admin.deleteUser(invitedUserId)
    return NextResponse.json({ error: 'Failed to create user record' }, { status: 500 })
  }

  // Set app_metadata for tenant_id and role
  await supabase.auth.admin.updateUserById(invitedUserId, {
    app_metadata: { tenant_id: tenantId, role: 'employee' },
  })

  logActivity({
    tenantId,
    actorId: adminUserId,
    eventType: 'user.invited',
    resourceType: 'user',
    resourceId: invitedUserId,
    resourceName: email,
  })

  return NextResponse.json(
    {
      message: 'Invitation created successfully',
      invite_link: inviteLink,
      member: {
        id: invitedUserId,
        email,
        display_name: null,
        role: 'employee',
        is_active: true,
        avatar_url: null,
        last_active_at: null,
        created_at: new Date().toISOString(),
        is_pending: true,
      },
    },
    { status: 201 }
  )
}

// ---------------------------------------------------------------------------
// Create user handler
// ---------------------------------------------------------------------------

async function handleCreateUser(adminUserId: string, tenantId: string, body: unknown) {
  // Rate limit: 10 creates per 15 minutes
  const limited = await checkRateLimit(adminUserId, 'team:create', 10, 15 * 60 * 1000)
  if (limited) return limited

  const parsed = CreateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    )
  }

  const { display_name, email, password, role } = parsed.data
  const supabase = createServiceClient()

  // Check seat limit
  const seatCheck = await checkSeatLimit(supabase, tenantId)
  if (seatCheck) return seatCheck

  // Check if email already exists in this tenant
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .maybeSingle()

  if (existingUser) {
    return NextResponse.json({ error: 'This email is already a team member' }, { status: 409 })
  }

  // Create user in Supabase Auth
  const { data: createData, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    app_metadata: { tenant_id: tenantId, role },
    user_metadata: { display_name },
  })

  if (createError) {
    if (createError.message?.includes('already been registered')) {
      return NextResponse.json(
        { error: 'This email is already registered in the system' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: createError.message ?? 'Failed to create user' },
      { status: 500 }
    )
  }

  const newUserId = createData?.user?.id
  if (!newUserId) {
    return NextResponse.json({ error: 'Failed to create user account' }, { status: 500 })
  }

  // Create user record in our users table
  const { error: insertError } = await supabase.from('users').insert({
    id: newUserId,
    tenant_id: tenantId,
    email,
    role,
    display_name,
    is_active: true,
  })

  if (insertError) {
    console.error('Failed to insert created user record:', insertError.message)
    await supabase.auth.admin.deleteUser(newUserId)
    return NextResponse.json({ error: 'Failed to create user record' }, { status: 500 })
  }

  // Notify all admins that a new member joined (fire-and-forget)
  const { data: admins } = await supabase
    .from('users')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('role', 'admin')
    .eq('is_active', true)
    .neq('id', newUserId)
    .limit(50)
  if (admins && admins.length > 0) {
    createNotifications(
      admins.map((a) => ({
        tenantId,
        userId: a.id,
        type: 'team_member_joined' as const,
        message: `${display_name} joined your team`,
      }))
    ).catch(() => {})
  }

  logActivity({
    tenantId,
    actorId: adminUserId,
    eventType: 'user.invited',
    resourceType: 'user',
    resourceId: newUserId,
    resourceName: display_name,
    metadata: { email, role },
  })

  return NextResponse.json(
    {
      message: 'User created successfully',
      member: {
        id: newUserId,
        email,
        display_name,
        role,
        is_active: true,
        avatar_url: null,
        last_active_at: null,
        created_at: new Date().toISOString(),
        is_pending: false,
      },
    },
    { status: 201 }
  )
}

// ---------------------------------------------------------------------------
// Seat limit helper
// ---------------------------------------------------------------------------

async function checkSeatLimit(
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: string
): Promise<NextResponse | null> {
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('licensed_seats')
    .eq('tenant_id', tenantId)
    .single()

  if (!subscription || subscription.licensed_seats === null) {
    return null // No seat cap
  }

  // Count confirmed active users (excludes pending invites)
  const { data: count } = await supabase.rpc('count_confirmed_active_users', {
    p_tenant_id: tenantId,
  })

  if ((count ?? 0) >= subscription.licensed_seats) {
    return NextResponse.json(
      {
        error: 'Seat limit reached. Please upgrade your plan to add more team members.',
        code: 'SEAT_LIMIT_REACHED',
      },
      { status: 403 }
    )
  }

  return null
}
