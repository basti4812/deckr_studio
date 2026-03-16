'use client'

import { CheckCircle2, FileDown } from 'lucide-react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface SimulatedExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  format: 'pptx' | 'pdf'
}

export function SimulatedExportDialog({ open, onOpenChange, format }: SimulatedExportDialogProps) {
  const { t } = useTranslation()
  const label = format === 'pptx' ? 'PowerPoint (.pptx)' : 'PDF'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <DialogTitle className="text-center">{t('demo.export_ready')}</DialogTitle>
          <DialogDescription className="text-center">
            {t('demo.export_generated', { format: label })}
          </DialogDescription>
        </DialogHeader>

        <div className="mx-auto flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
          <FileDown className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="text-sm">
            <p className="font-medium">Acme-Presentation.{format === 'pptx' ? 'pptx' : 'pdf'}</p>
            <p className="text-xs text-muted-foreground">
              3 slides -- {format === 'pptx' ? '2.4 MB' : '1.1 MB'}
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">{t('demo.demo_export_notice')}</p>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button asChild className="w-full">
            <Link href="/register">{t('demo.sign_up_export')}</Link>
          </Button>
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
