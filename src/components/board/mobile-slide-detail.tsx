'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Check, Loader2, StickyNote } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { createBrowserSupabaseClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MobileSlideDetailProps {
  open: boolean
  onClose: () => void
  projectId: string
  slideId: string
  slideTitle: string
  thumbnailUrl?: string | null
  status?: 'standard' | 'mandatory' | 'deprecated'
  isPersonal?: boolean
  onNoteChange?: (slideId: string, hasNote: boolean) => void
}

async function getAccessToken(): Promise<string | null> {
  const supabase = createBrowserSupabaseClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

// ---------------------------------------------------------------------------
// MobileSlideDetail — bottom Sheet with thumbnail + inline note editing
// ---------------------------------------------------------------------------

export function MobileSlideDetail({
  open,
  onClose,
  projectId,
  slideId,
  slideTitle,
  thumbnailUrl,
  status,
  isPersonal,
  onNoteChange,
}: MobileSlideDetailProps) {
  const { t } = useTranslation()
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef('')

  // -------------------------------------------------------------------------
  // Fetch note when sheet opens
  // -------------------------------------------------------------------------

  const fetchNote = useCallback(async () => {
    if (isPersonal) return // personal slides don't have notes
    setLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) return
      const res = await fetch(`/api/projects/${projectId}/notes?slide_id=${slideId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const d = await res.json()
        const noteBody = d.note?.body ?? ''
        setBody(noteBody)
        lastSavedRef.current = noteBody
      }
    } finally {
      setLoading(false)
      setSaveStatus('idle')
    }
  }, [projectId, slideId, isPersonal])

  useEffect(() => {
    if (open) {
      fetchNote()
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [open, fetchNote])

  // -------------------------------------------------------------------------
  // Auto-save with debounce
  // -------------------------------------------------------------------------

  const saveNote = useCallback(
    async (text: string) => {
      if (isPersonal) return
      if (text === lastSavedRef.current) return
      setSaveStatus('saving')
      try {
        const token = await getAccessToken()
        if (!token) return
        const res = await fetch(`/api/projects/${projectId}/notes`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ slide_id: slideId, body: text }),
        })
        if (res.ok) {
          lastSavedRef.current = text
          setSaveStatus('saved')
          onNoteChange?.(slideId, text.trim().length > 0)
        } else {
          const d = await res.json().catch(() => null)
          toast.error(d?.error ?? t('notes.failed_to_save'))
          setSaveStatus('idle')
        }
      } catch {
        toast.error(t('notes.failed_to_save'))
        setSaveStatus('idle')
      }
    },
    [projectId, slideId, isPersonal, onNoteChange, t]
  )

  function handleChange(text: string) {
    setBody(text)
    setSaveStatus('idle')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      saveNote(text)
    }, 1000)
  }

  function handleBlur() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    saveNote(body)
  }

  function handleClose() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!isPersonal && body !== lastSavedRef.current) {
      saveNote(body)
    }
    onClose()
  }

  // -------------------------------------------------------------------------
  // Status badge
  // -------------------------------------------------------------------------

  function StatusBadge() {
    if (!status) return null
    const config: Record<
      string,
      { variant: 'default' | 'secondary' | 'destructive'; key: string }
    > = {
      mandatory: { variant: 'default', key: 'board.mandatory' },
      deprecated: { variant: 'destructive', key: 'board.deprecated' },
      standard: { variant: 'secondary', key: 'board.standard' },
    }
    const { variant, key } = config[status] ?? {
      variant: 'secondary' as const,
      key: 'board.standard',
    }
    return (
      <Badge variant={variant} className="text-[10px]">
        {t(key)}
      </Badge>
    )
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent side="bottom" className="flex flex-col p-0 max-h-[85vh] rounded-t-2xl">
        {/* Handle */}
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-muted-foreground/20" />

        <SheetHeader className="px-4 pt-2 pb-0">
          <SheetTitle className="text-base truncate">{slideTitle}</SheetTitle>
          {status && !isPersonal && (
            <SheetDescription asChild>
              <div className="flex items-center gap-2 mt-0.5">
                <StatusBadge />
              </div>
            </SheetDescription>
          )}
        </SheetHeader>

        {/* Thumbnail */}
        {thumbnailUrl ? (
          <div className="mx-4 mt-3 overflow-hidden rounded-lg border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbnailUrl} alt={slideTitle} className="w-full object-contain max-h-48" />
          </div>
        ) : (
          <div className="mx-4 mt-3 flex items-center justify-center h-32 rounded-lg border bg-muted">
            <span className="text-xs text-muted-foreground">{t('board.no_thumbnail')}</span>
          </div>
        )}

        {/* Notes section — library slides only */}
        {!isPersonal && (
          <>
            <Separator className="mt-4" />
            <div className="flex items-center gap-2 px-4 pt-3 pb-1">
              <StickyNote className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t('notes.title')}</span>
              <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                {saveStatus === 'saving' && (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t('notes.saving')}
                  </>
                )}
                {saveStatus === 'saved' && (
                  <>
                    <Check className="h-3 w-3 text-green-500" />
                    {t('notes.saved')}
                  </>
                )}
              </span>
            </div>

            <div className="flex flex-col flex-1 px-4 pb-4 gap-1 min-h-0 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <Textarea
                    value={body}
                    onChange={(e) => handleChange(e.target.value)}
                    onBlur={handleBlur}
                    placeholder={t('notes.placeholder')}
                    className="flex-1 min-h-[120px] resize-none text-sm"
                    maxLength={2000}
                  />
                  <span className="text-[10px] text-muted-foreground text-right">
                    {t('notes.char_limit', { current: body.length, max: 2000 })}
                  </span>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
