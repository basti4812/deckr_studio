'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Plug } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useTenantContext } from '@/providers/tenant-provider'
import { createBrowserSupabaseClient } from '@/lib/supabase'

const CRM_PROVIDERS = [
  { value: 'hubspot', label: 'HubSpot' },
  { value: 'salesforce', label: 'Salesforce' },
  { value: 'pipedrive', label: 'Pipedrive' },
] as const

export default function IntegrationsPage() {
  const { t } = useTranslation()
  const { tenantId } = useCurrentUser()
  const tenantContext = useTenantContext()

  const [provider, setProvider] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize provider from tenant context when data loads
  if (!initialized && !tenantContext.loading && tenantId) {
    setProvider(tenantContext.crmProvider)
    setInitialized(true)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      const supabase = createBrowserSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const res = await fetch('/api/tenant', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          crm_provider: provider || null,
        }),
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Failed to save')
      }

      setSaved(true)
      tenantContext.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('admin.integrations')}</h1>
        <p className="text-sm text-muted-foreground">{t('admin.integrations_description')}</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Plug className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <CardTitle className="text-base">{t('admin.crm_integration')}</CardTitle>
              <CardDescription>{t('admin.crm_integration_description')}</CardDescription>
            </div>
            <Badge variant="secondary">{t('admin.coming_soon')}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('admin.crm_provider')}</Label>
            <Select
              value={provider ?? 'none'}
              onValueChange={(v) => { setProvider(v === 'none' ? null : v); setSaved(false) }}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder={t('admin.crm_select_provider')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('admin.crm_none')}</SelectItem>
                {CRM_PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('admin.crm_provider_hint')}</p>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          {saved && (
            <p className="text-sm text-green-600">{t('admin.crm_saved')}</p>
          )}

          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('admin.crm_save_provider')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
