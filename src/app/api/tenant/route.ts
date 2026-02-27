import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase'
import { getAuthenticatedUser } from '@/lib/auth-helpers'

// ---------------------------------------------------------------------------
// GET /api/tenant
// Returns the current user's tenant + user profile data.
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseAdmin = createServiceClient()

  // Fetch user row with tenant join (single query, no N+1)
  const { data, error } = await supabaseAdmin
    .from('users')
    .select(
      `
      id,
      role,
      display_name,
      avatar_url,
      preferred_language,
      is_active,
      tenant:tenants (
        id,
        name,
        logo_url,
        primary_color,
        default_language,
        sso_provider,
        crm_provider,
        setup_complete,
        created_at
      )
    `
    )
    .eq('id', user.id)
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: 'User profile not found' },
      { status: 404 }
    )
  }

  // Validate tenant exists
  if (!data.tenant) {
    return NextResponse.json(
      { error: 'Tenant not found for this user' },
      { status: 403 }
    )
  }

  return NextResponse.json({ user: data }, { status: 200 })
}

// ---------------------------------------------------------------------------
// PATCH /api/tenant
// Updates tenant branding fields. Admin only.
// ---------------------------------------------------------------------------

const HexColorRegex = /^#[0-9a-fA-F]{6}$/

const UpdateTenantSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  logo_url: z.url().optional(),
  primary_color: z
    .string()
    .regex(HexColorRegex, 'primary_color must be a valid hex color (e.g. #2B4EFF)')
    .optional(),
  default_language: z.enum(['de', 'en']).optional(),
  setup_complete: z.boolean().optional(),
})

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse and validate body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = UpdateTenantSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const updates = parsed.data
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'No fields to update' },
      { status: 400 }
    )
  }

  const supabaseAdmin = createServiceClient()

  // Check the user is an admin and get their tenant_id
  const { data: userRow, error: userError } = await supabaseAdmin
    .from('users')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (userError || !userRow) {
    return NextResponse.json(
      { error: 'User profile not found' },
      { status: 404 }
    )
  }

  if (userRow.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only admins can update tenant settings' },
      { status: 403 }
    )
  }

  // Update tenant
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .update(updates)
    .eq('id', userRow.tenant_id)
    .select()
    .single()

  if (tenantError) {
    return NextResponse.json(
      { error: 'Failed to update tenant' },
      { status: 500 }
    )
  }

  return NextResponse.json({ tenant }, { status: 200 })
}
