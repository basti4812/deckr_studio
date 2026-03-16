'use client'

import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { UnfilledField } from '@/lib/fill-check'

interface FillWarningDialogProps {
  open: boolean
  onClose: () => void
  issues: UnfilledField[]
  proceedLabel: string
  onProceedAnyway: () => void
  onGoToField: (instanceId: string) => void
}

export function FillWarningDialog({
  open,
  onClose,
  issues,
  proceedLabel,
  onProceedAnyway,
  onGoToField,
}: FillWarningDialogProps) {
  const { t } = useTranslation()
  // Group issues by instanceId so we can display them slide by slide
  const grouped = issues.reduce<Map<string, UnfilledField[]>>((acc, issue) => {
    const key = issue.instanceId
    if (!acc.has(key)) acc.set(key, [])
    acc.get(key)!.push(issue)
    return acc
  }, new Map())

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            {t('fill_warning.title')}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {t('fill_warning.description', { action: proceedLabel.toLowerCase() })}
        </p>

        <ScrollArea className="max-h-[50vh]">
          <div className="space-y-3 pr-2">
            {Array.from(grouped.entries()).map(([instanceId, fields]) => {
              const first = fields[0]
              return (
                <div key={instanceId} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-muted-foreground">
                        {t('fill_warning.slide_position', { position: first.trayPosition })}
                      </p>
                      <p className="truncate text-sm font-medium">{first.slideTitle}</p>
                      <ul className="mt-1 space-y-0.5">
                        {fields.map((f) => (
                          <li key={f.fieldId} className="text-xs text-muted-foreground">
                            {t('fill_warning.field_required', { label: f.fieldLabel })}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 text-xs"
                      onClick={() => {
                        onClose()
                        onGoToField(instanceId)
                      }}
                    >
                      {t('fill_warning.fill_in')}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              onClose()
              onProceedAnyway()
            }}
          >
            {t('fill_warning.proceed_anyway', { action: proceedLabel })}
          </Button>
          <Button size="sm" onClick={onClose}>
            {t('fill_warning.go_back_and_fix')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
