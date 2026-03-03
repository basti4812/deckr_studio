import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// CRM Integration Hook Functions
//
// These hooks are called at key business events. They are no-ops when
// crm_provider is null on the tenant. When a real CRM integration is
// connected, fill in the API call bodies below.
//
// Search for "CRM_INTEGRATION" to find all hook points.
// ---------------------------------------------------------------------------

interface CrmProject {
  id: string
  name: string
  tenant_id: string
  crm_customer_name: string | null
  crm_company_name: string | null
  crm_deal_id: string | null
}

interface CrmShareLink {
  id: string
  token: string
  project_id: string
  expires_at: string | null
}

async function getCrmProvider(tenantId: string): Promise<string | null> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('tenants')
      .select('crm_provider')
      .eq('id', tenantId)
      .single()
    return data?.crm_provider ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// onProjectCreated — called after a new project is inserted
// CRM_INTEGRATION: Create a deal/opportunity in the CRM when a project is created
// ---------------------------------------------------------------------------

export async function onProjectCreated(project: CrmProject): Promise<void> {
  const provider = await getCrmProvider(project.tenant_id)
  if (!provider) return

  // CRM_INTEGRATION: call {{provider}} API here
  // Example: POST to HubSpot/Salesforce/Pipedrive to create or link a deal
  console.warn(
    `[crm-hooks] onProjectCreated: provider "${provider}" configured but no API credentials — skipping`,
  )
}

// ---------------------------------------------------------------------------
// onProjectExported — called after a successful PPTX/PDF export
// CRM_INTEGRATION: Log an activity on the CRM deal when a presentation is exported
// ---------------------------------------------------------------------------

export async function onProjectExported(project: CrmProject): Promise<void> {
  const provider = await getCrmProvider(project.tenant_id)
  if (!provider) return

  // CRM_INTEGRATION: call {{provider}} API here
  // Example: POST activity/note to the CRM deal timeline
  console.warn(
    `[crm-hooks] onProjectExported: provider "${provider}" configured but no API credentials — skipping`,
  )
}

// ---------------------------------------------------------------------------
// onShareLinkGenerated — called after a share link is created for a project
// CRM_INTEGRATION: Log a share event on the CRM deal when a link is generated
// ---------------------------------------------------------------------------

export async function onShareLinkGenerated(
  project: CrmProject,
  link: CrmShareLink,
): Promise<void> {
  const provider = await getCrmProvider(project.tenant_id)
  if (!provider) return

  // CRM_INTEGRATION: call {{provider}} API here
  // Example: POST activity to CRM deal — "Presentation shared via link"
  console.warn(
    `[crm-hooks] onShareLinkGenerated: provider "${provider}" configured but no API credentials — skipping (link=${link.id})`,
  )
}
