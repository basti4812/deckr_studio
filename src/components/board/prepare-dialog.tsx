'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { createBrowserSupabaseClient } from '@/lib/supabase'

type PrepareFormat = 'presentation' | 'share' | 'pdf'

interface PrepareDialogProps {
  open: boolean
  projectId: string
  format: PrepareFormat
  onReady: (previews: Record<string, string>) => void
  onCancel: () => void
}

export function PrepareDialog({ open, projectId, format, onReady, onCancel }: PrepareDialogProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<'preparing' | 'done' | 'error'>('preparing')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  function handleCancel() {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    onCancel()
  }

  useEffect(() => {
    if (!open) {
      setStatus('preparing')
      setError(null)
      setElapsed(0)
      return
    }

    // Cancel any previous in-flight request (React Strict Mode fires effects twice)
    if (abortRef.current) {
      abortRef.current.abort()
    }

    const controller = new AbortController()
    abortRef.current = controller

    let cancelled = false

    async function run() {
      try {
        const supabase = createBrowserSupabaseClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (cancelled) return

        if (!session) {
          setError('Not authenticated')
          setStatus('error')
          return
        }

        const res = await fetch(`/api/projects/${projectId}/prepare`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ format }),
          signal: controller.signal,
        })

        if (cancelled) return

        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error((d as { error?: string }).error ?? `Error ${res.status}`)
        }

        const data = await res.json()

        if (cancelled) return

        setStatus('done')

        // Brief pause to show "done" state
        await new Promise((r) => setTimeout(r, 400))

        if (!cancelled) {
          onReady(data.previews ?? {})
        }
      } catch (err) {
        if (cancelled || (err as Error).name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Unknown error')
        setStatus('error')
      }
    }

    run()

    return () => {
      cancelled = true
      controller.abort()
      abortRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Elapsed timer
  useEffect(() => {
    if (!open || status !== 'preparing') return
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(interval)
  }, [open, status])

  const messageKey =
    format === 'presentation'
      ? 'prepare.message_presentation'
      : format === 'share'
        ? 'prepare.message_share'
        : 'prepare.message_pdf'

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleCancel()
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {status === 'error'
              ? t('prepare.error_title', 'Error')
              : status === 'done'
                ? t('prepare.done', 'Done!')
                : t('prepare.title', 'Preparing presentation')}
          </DialogTitle>
        </DialogHeader>

        {status === 'preparing' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground text-center">{t(messageKey)}</p>
            <Progress value={Math.min(elapsed * 8, 90)} className="h-1.5" />
            {elapsed >= 5 && (
              <p className="text-xs text-muted-foreground">
                {t('prepare.taking_moment', 'This may take a moment...')}
              </p>
            )}
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              {t('prepare.cancel', 'Cancel')}
            </Button>
          </div>
        )}

        {status === 'done' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Check className="h-5 w-5 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">{t('prepare.done', 'Done!')}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                {t('prepare.cancel', 'Cancel')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
