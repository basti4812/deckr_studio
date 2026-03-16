'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Check, Loader2, StickyNote } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { createBrowserSupabaseClient } from '@/lib/supabase'

interface NotePanelProps {
  open: boolean
  onClose: () => void
  projectId: string
  slideId: string
  slideTitle: string
  onNoteChange?: (slideId: string, hasNote: boolean) => void
}

async function getAccessToken(): Promise<string | null> {
  const supabase = createBrowserSupabaseClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

export function NotePanel({
  open,
  onClose,
  projectId,
  slideId,
  slideTitle,
  onNoteChange,
}: NotePanelProps) {
  const { t } = useTranslation()
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef('')

  // -------------------------------------------------------------------------
  // Fetch note when panel opens
  // -------------------------------------------------------------------------

  const fetchNote = useCallback(async () => {
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
  }, [projectId, slideId])

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
          body: JSON.stringify({
            slide_id: slideId,
            body: text,
          }),
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
    [projectId, slideId, onNoteChange]
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
    if (body !== lastSavedRef.current) {
      saveNote(body)
    }
    onClose()
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent side="right" className="flex flex-col sm:max-w-sm p-0">
        <SheetHeader className="px-4 pt-4 pb-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <StickyNote className="h-4 w-4" />
            {t('notes.title')}
          </SheetTitle>
          <SheetDescription className="truncate">{slideTitle}</SheetDescription>
        </SheetHeader>

        <Separator />

        {loading ? (
          <div className="flex items-center justify-center flex-1 py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col flex-1 p-4 gap-2">
            <Textarea
              value={body}
              onChange={(e) => handleChange(e.target.value)}
              onBlur={handleBlur}
              placeholder={t('notes.placeholder')}
              className="flex-1 min-h-[200px] resize-none text-sm"
              maxLength={2000}
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {t('notes.char_limit', { current: body.length, max: 2000 })}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
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
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
