import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase'
import { checkIpRateLimit } from '@/lib/rate-limit'
import { sendConfirmationEmail } from '@/lib/email'

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------
const RegisterSchema = z.object({
  email: z.email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  tenantName: z.string().min(1, 'Tenant name is required').max(255),
  displayName: z.string().min(1, 'Display name is required').max(255),
  preferredLanguage: z.enum(['de', 'en']).optional().default('de'),
})

// ---------------------------------------------------------------------------
// POST /api/register
// Creates a new auth user, tenant, and user row. Sets app_metadata.
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  // 5 registrations per hour per IP (persists across cold starts)
  const limited = await checkIpRateLimit(request, 'register', 5, 60 * 60 * 1000)
  if (limited) return limited

  // Parse and validate body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = RegisterSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const { email, password, tenantName, displayName, preferredLanguage } = parsed.data

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  let supabaseAdmin: ReturnType<typeof createServiceClient>
  try {
    supabaseAdmin = createServiceClient()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server configuration error'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const skipEmailConfirmation = process.env.SKIP_EMAIL_CONFIRMATION === 'true'

  // 1. Create auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: skipEmailConfirmation,
  })

  if (authError || !authData.user) {
    const message = authError?.message ?? 'Failed to create user'
    const status = message.toLowerCase().includes('already') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }

  const userId = authData.user.id

  // 2. Create tenant
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .insert({
      name: tenantName,
      default_language: preferredLanguage,
    })
    .select('id')
    .single()

  if (tenantError || !tenant) {
    // Rollback: delete the auth user we just created
    await supabaseAdmin.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: 'Failed to create tenant' }, { status: 500 })
  }

  // 3. Create user row in public.users
  const { error: userError } = await supabaseAdmin.from('users').insert({
    id: userId,
    tenant_id: tenant.id,
    email,
    role: 'admin',
    display_name: displayName,
    preferred_language: preferredLanguage,
  })

  if (userError) {
    // Rollback: delete tenant and auth user
    await supabaseAdmin.from('tenants').delete().eq('id', tenant.id)
    await supabaseAdmin.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 })
  }

  // 4. Create subscription with 14-day trial
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  const { error: subError } = await supabaseAdmin.from('subscriptions').insert({
    tenant_id: tenant.id,
    status: 'trialing',
    trial_ends_at: trialEndsAt,
  })

  if (subError) {
    // Rollback: delete user, tenant, and auth user
    await supabaseAdmin.from('users').delete().eq('id', userId)
    await supabaseAdmin.from('tenants').delete().eq('id', tenant.id)
    await supabaseAdmin.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 })
  }

  // 6. Set app_metadata on auth user (tenant_id + role in JWT)
  const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: {
      tenant_id: tenant.id,
      role: 'admin',
    },
  })

  if (metaError) {
    // Non-fatal: the user exists, metadata can be set later
    console.error('Failed to set app_metadata:', metaError.message)
  }

  // 7. Send email confirmation link (only when not skipping confirmation)
  let emailStatus: { sent: boolean; error?: string } = { sent: false, error: 'skipped' }

  if (!skipEmailConfirmation) {
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: {
        redirectTo: `${siteUrl}/auth/callback`,
      },
    })

    if (linkError) {
      console.error('Failed to generate confirmation link:', linkError.message)
      emailStatus = { sent: false, error: `generateLink: ${linkError.message}` }
    } else if (linkData?.properties?.action_link) {
      // generateLink returns the link but does NOT send email — send it ourselves
      emailStatus = await sendConfirmationEmail(email, linkData.properties.action_link, displayName)
    } else {
      emailStatus = { sent: false, error: 'generateLink returned no action_link' }
    }
  }

  return NextResponse.json(
    {
      message: skipEmailConfirmation
        ? 'Registration successful. You can now sign in.'
        : emailStatus.sent
          ? 'Registration successful. Please check your email to confirm your account.'
          : 'Registration successful but confirmation email could not be sent.',
      userId,
      tenantId: tenant.id,
      emailConfirmed: skipEmailConfirmation,
      emailStatus,
    },
    { status: 201 }
  )
}
