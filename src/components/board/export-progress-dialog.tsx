'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, FileText, FileSpreadsheet, Clock, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface ExportProgressDialogProps {
  open: boolean
  onClose: () => void
  onRetry: () => void
  onStartExport: () => void
  error: string | null
  step: number
  format: 'pptx' | 'pdf'
  slideCount?: number
}

const STEPS = [
  { key: 'preparing', progress: 15 },
  { key: 'converting', progress: 55 },
  { key: 'finalizing', progress: 90 },
] as const

export function ExportProgressDialog({
  open,
  onClose,
  onRetry,
  onStartExport,
  error,
  step,
  format,
  slideCount,
}: ExportProgressDialogProps) {
  const { t } = useTranslation()
  const [elapsed, setElapsed] = useState(0)

  // Track elapsed time (only during actual export, not preview)
  useEffect(() => {
    if (!open || error !== null || step === 0) {
      setElapsed(0)
      return
    }
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(interval)
  }, [open, error, step])

  const currentStep = Math.min(step, STEPS.length) - 1
  const progress = STEPS[currentStep]?.progress ?? 0

  const formatLabel = format === 'pdf' ? 'PDF' : 'PowerPoint'
  const FormatIcon = format === 'pdf' ? FileText : FileSpreadsheet

  const estimatedSeconds = slideCount ? Math.max(Math.ceil(slideCount * 1.2), 3) : null

  const stepLabels = [
    t('export_dialog.step_preparing', 'Preparing slides...'),
    t('export_dialog.step_converting', {
      defaultValue: 'Converting to {{format}}...',
      format: formatLabel,
    }),
    t('export_dialog.step_finalizing', 'Finalizing download...'),
  ]

  const isPreview = step === 0
  const isExporting = step > 0 && error === null

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && (error !== null || isPreview)) onClose()
      }}
    >
      <DialogContent
        className="max-w-sm"
        onPointerDownOutside={(e) => {
          if (isExporting) e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {error !== null
              ? t('export_dialog.export_failed')
              : isPreview
                ? t('export_dialog.preview_title', 'Export Preview')
                : t('export_dialog.exporting')}
          </DialogTitle>
        </DialogHeader>

        {isPreview ? (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-3 rounded-md border bg-muted/50 p-4">
              <div className="flex items-center gap-3">
                <FormatIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">{formatLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    {format === 'pdf' ? '.pdf' : '.pptx'}
                  </p>
                </div>
              </div>
              {slideCount != null && slideCount > 0 && (
                <div className="flex items-center gap-3">
                  <Layers className="h-5 w-5 text-muted-foreground shrink-0" />
                  <p className="text-sm">
                    {t('export_dialog.slide_count', {
                      count: slideCount,
                    })}
                  </p>
                </div>
              )}
              {estimatedSeconds != null && (
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
                  <p className="text-sm">
                    ~{estimatedSeconds} {t('export_dialog.seconds', 'seconds')}
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                {t('export_dialog.close', 'Cancel')}
              </Button>
              <Button size="sm" onClick={onStartExport}>
                {t('export_dialog.start_export', 'Start Export')}
              </Button>
            </div>
          </div>
        ) : error === null ? (
          <div className="flex flex-col gap-4 py-2">
            <Progress value={progress} className="h-2" />
            <div className="flex flex-col gap-1.5">
              {stepLabels.map((label, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {i < step - 1 ? (
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                  ) : i === step - 1 ? (
                    <div className="h-3.5 w-3.5 shrink-0 flex items-center justify-center">
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    </div>
                  ) : (
                    <div className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className={i <= step - 1 ? 'text-foreground' : 'text-muted-foreground'}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
            {elapsed >= 5 && (
              <p className="text-xs text-muted-foreground text-center">
                {t('export_dialog.taking_moment', 'This may take a moment...')}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                {t('export_dialog.close')}
              </Button>
              <Button size="sm" onClick={onRetry}>
                {t('export_dialog.try_again')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
