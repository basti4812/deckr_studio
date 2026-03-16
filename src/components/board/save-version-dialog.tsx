'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Save } from 'lucide-react'
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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SaveVersionDialogProps {
  open: boolean
  onClose: () => void
  projectId: string
  onSaved: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SaveVersionDialog({ open, onClose, projectId, onSaved }: SaveVersionDialogProps) {
  const { t } = useTranslation()
  const [label, setLabel] = useState('')
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
      if (!session) {
        setError(t('save_version_dialog.not_authenticated'))
        return
      }

      const res = await fetch(`/api/projects/${projectId}/versions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ label: label.trim() || null }),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError((d as { error?: string }).error ?? t('save_version_dialog.failed_to_save'))
        return
      }

      // Success
      setLabel('')
      onSaved()
      onClose()
    } catch {
      setError(t('save_version_dialog.failed_to_save'))
    } finally {
      setSaving(false)
    }
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setLabel('')
      setError(null)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-4 w-4" />
            {t('save_version_dialog.title')}
          </DialogTitle>
          <DialogDescription>{t('save_version_dialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="version-label">{t('save_version_dialog.name_label')}</Label>
            <Input
              id="version-label"
              placeholder={t('save_version_dialog.name_placeholder')}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !saving) handleSave()
              }}
              maxLength={200}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {t('save_version_dialog.if_left_empty')}
            </p>
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                {t('save_version_dialog.saving')}
              </>
            ) : (
              t('save_version_dialog.save_button')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
