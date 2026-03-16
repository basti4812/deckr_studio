'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createBrowserSupabaseClient } from '@/lib/supabase'

interface CrmDetailsDialogProps {
  open: boolean
  onClose: () => void
  projectId: string
  initialCustomerName: string
  initialCompanyName: string
  initialDealId: string
  onSaved: (fields: {
    crm_customer_name: string
    crm_company_name: string
    crm_deal_id: string
  }) => void
}

export function CrmDetailsDialog({
  open,
  onClose,
  projectId,
  initialCustomerName,
  initialCompanyName,
  initialDealId,
  onSaved,
}: CrmDetailsDialogProps) {
  const { t } = useTranslation()

  const [customerName, setCustomerName] = useState(initialCustomerName)
  const [companyName, setCompanyName] = useState(initialCompanyName)
  const [dealId, setDealId] = useState(initialDealId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)

    try {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          crm_customer_name: customerName.trim(),
          crm_company_name: companyName.trim(),
          crm_deal_id: dealId.trim(),
        }),
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Failed to save')
      }

      onSaved({
        crm_customer_name: customerName.trim(),
        crm_company_name: companyName.trim(),
        crm_deal_id: dealId.trim(),
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('crm.dialog_title')}</DialogTitle>
          <DialogDescription>{t('crm.dialog_description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="crm-customer">{t('crm.customer_name')}</Label>
            <Input
              id="crm-customer"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              maxLength={200}
              placeholder={t('crm.customer_name_placeholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="crm-company">{t('crm.company_name')}</Label>
            <Input
              id="crm-company"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              maxLength={200}
              placeholder={t('crm.company_name_placeholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="crm-deal">{t('crm.deal_id')}</Label>
            <Input
              id="crm-deal"
              value={dealId}
              onChange={(e) => setDealId(e.target.value)}
              maxLength={100}
              placeholder={t('crm.deal_id_placeholder')}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t('create_project.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('crm.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
