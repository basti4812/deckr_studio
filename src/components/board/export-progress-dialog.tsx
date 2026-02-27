'use client'

import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ExportProgressDialogProps {
  open: boolean
  onClose: () => void
  onRetry: () => void
  error: string | null
}

export function ExportProgressDialog({
  open,
  onClose,
  onRetry,
  error,
}: ExportProgressDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Only allow closing when there's an error (not while processing)
        if (!o && error !== null) onClose()
      }}
    >
      <DialogContent className="max-w-sm" onPointerDownOutside={(e) => {
        if (error === null) e.preventDefault()
      }}>
        <DialogHeader>
          <DialogTitle>
            {error !== null ? 'Export failed' : 'Exporting…'}
          </DialogTitle>
        </DialogHeader>

        {error === null ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground text-center">
              Generating your presentation. This may take a moment…
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
              <Button size="sm" onClick={onRetry}>
                Try again
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
