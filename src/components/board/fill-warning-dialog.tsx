'use client'

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
  // Group issues by instanceId so we can display them slide by slide
  const grouped = issues.reduce<Map<string, UnfilledField[]>>((acc, issue) => {
    const key = issue.instanceId
    if (!acc.has(key)) acc.set(key, [])
    acc.get(key)!.push(issue)
    return acc
  }, new Map())

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            Required fields are empty
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          The following required fields must be filled in before{' '}
          {proceedLabel.toLowerCase()}. You can fill them in now or proceed anyway.
        </p>

        <ScrollArea className="max-h-64">
          <div className="space-y-3 pr-2">
            {Array.from(grouped.entries()).map(([instanceId, fields]) => {
              const first = fields[0]
              return (
                <div key={instanceId} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-muted-foreground">
                        Slide {first.trayPosition}
                      </p>
                      <p className="truncate text-sm font-medium">{first.slideTitle}</p>
                      <ul className="mt-1 space-y-0.5">
                        {fields.map((f) => (
                          <li key={f.fieldId} className="text-xs text-muted-foreground">
                            • {f.fieldLabel} is required
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
                      Fill in
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onClose()
              onProceedAnyway()
            }}
          >
            {proceedLabel} anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
