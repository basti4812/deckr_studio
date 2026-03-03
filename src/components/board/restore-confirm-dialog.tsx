'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Loader2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { ProjectVersion } from '@/components/board/version-history-panel'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RestoreConfirmDialogProps {
  open: boolean
  version: ProjectVersion | null
  onClose: () => void
  onConfirm: (versionId: string) => Promise<void>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RestoreConfirmDialog({
  open,
  version,
  onClose,
  onConfirm,
}: RestoreConfirmDialogProps) {
  const { t } = useTranslation()
  const [restoring, setRestoring] = useState(false)

  async function handleConfirm() {
    if (!version) return
    setRestoring(true)
    try {
      await onConfirm(version.id)
    } finally {
      setRestoring(false)
      onClose()
    }
  }

  function formatDate(iso: string) {
    const date = new Date(iso)
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && !restoring && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            {t('restore_dialog.title')}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              {t('restore_dialog.description', { name: version ? version.label || formatDate(version.created_at) : '' })}
            </span>
            <span className="block">
              {t('restore_dialog.personal_slides_preserved')}
            </span>
            <span className="block font-medium text-foreground">
              {t('restore_dialog.cannot_be_undone')}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={restoring}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              handleConfirm()
            }}
            disabled={restoring}
            className="bg-amber-600 hover:bg-amber-700 focus:ring-amber-600"
          >
            {restoring ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                {t('restore_dialog.restoring')}
              </>
            ) : (
              t('restore_dialog.restore_button')
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
