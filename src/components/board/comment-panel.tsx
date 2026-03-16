'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Loader2, MessageSquare, Send } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { CommentItem, type Comment } from './comment-item'
import { createBrowserSupabaseClient } from '@/lib/supabase'

interface CommentPanelProps {
  open: boolean
  onClose: () => void
  projectId: string
  slideId: string
  slideTitle: string
  instanceIndex: number
  currentUserId: string
  canModerate: boolean // project owner or admin
  isArchived: boolean
  onCommentCountChange?: (slideId: string, delta: number) => void
}

async function getAccessToken(): Promise<string | null> {
  const supabase = createBrowserSupabaseClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

export function CommentPanel({
  open,
  onClose,
  projectId,
  slideId,
  slideTitle,
  instanceIndex,
  currentUserId,
  canModerate,
  isArchived,
  onCommentCountChange,
}: CommentPanelProps) {
  const { t } = useTranslation()
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(false)
  const [body, setBody] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // -------------------------------------------------------------------------
  // Fetch comments when panel opens
  // -------------------------------------------------------------------------

  const fetchComments = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) return
      const res = await fetch(`/api/projects/${projectId}/comments?slide_id=${slideId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const d = await res.json()
        setComments(d.comments ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [projectId, slideId])

  useEffect(() => {
    if (open) {
      fetchComments()
      setBody('')
      setReplyingTo(null)
    }
  }, [open, fetchComments])

  // -------------------------------------------------------------------------
  // Supabase Realtime — new comments while panel is open
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!open) return

    const supabase = createBrowserSupabaseClient()
    const channel = supabase
      .channel(`comments-${projectId}-${slideId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comments',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const newComment = payload.new as Comment & { slide_id: string }
          if (newComment.slide_id !== slideId) return
          // Check if we already have it (prevent duplicates from our own POST)
          setComments((prev) => {
            if (prev.some((c) => c.id === newComment.id)) return prev
            // Realtime doesn't include author info — schedule a re-fetch outside the updater
            queueMicrotask(() => fetchComments())
            return prev
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [open, projectId, slideId, fetchComments])

  // -------------------------------------------------------------------------
  // Create comment
  // -------------------------------------------------------------------------

  async function handleSubmit() {
    if (!body.trim() || submitting) return
    setSubmitting(true)
    try {
      const token = await getAccessToken()
      if (!token) return
      const res = await fetch(`/api/projects/${projectId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          slide_id: slideId,
          slide_instance_index: instanceIndex,
          parent_comment_id: replyingTo ?? null,
          body: body.trim(),
        }),
      })

      if (res.ok) {
        setBody('')
        setReplyingTo(null)
        await fetchComments()
        onCommentCountChange?.(slideId, 1)
        // Scroll to bottom
        setTimeout(() => {
          listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
        }, 100)
      } else {
        const d = await res.json().catch(() => null)
        toast.error(d?.error ?? t('comments.failed_to_post'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  // -------------------------------------------------------------------------
  // Delete comment (soft-delete)
  // -------------------------------------------------------------------------

  async function handleDelete(commentId: string) {
    const token = await getAccessToken()
    if (!token) return
    const res = await fetch(`/api/projects/${projectId}/comments/${commentId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, deleted_at: new Date().toISOString() } : c))
      )
      onCommentCountChange?.(slideId, -1)
    } else {
      toast.error(t('comments.failed_to_delete'))
    }
  }

  // -------------------------------------------------------------------------
  // Build threaded structure
  // -------------------------------------------------------------------------

  const topLevel = comments.filter((c) => !c.parent_comment_id)
  const replyMap = new Map<string, Comment[]>()
  for (const c of comments) {
    if (c.parent_comment_id) {
      const arr = replyMap.get(c.parent_comment_id) ?? []
      arr.push(c)
      replyMap.set(c.parent_comment_id, arr)
    }
  }

  const replyingToComment = replyingTo ? comments.find((c) => c.id === replyingTo) : null

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex flex-col sm:max-w-md p-0">
        <SheetHeader className="px-4 pt-4 pb-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" />
            {t('comments.title')}
          </SheetTitle>
          <SheetDescription className="truncate">{slideTitle}</SheetDescription>
        </SheetHeader>

        <Separator />

        {/* Comment list */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : topLevel.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">{t('comments.no_comments')}</p>
              {!isArchived && (
                <p className="text-xs text-muted-foreground mt-1">{t('comments.be_first')}</p>
              )}
            </div>
          ) : (
            topLevel.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                replies={replyMap.get(comment.id) ?? []}
                currentUserId={currentUserId}
                canModerate={canModerate}
                onReply={(parentId) => setReplyingTo(parentId)}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>

        {/* Input area */}
        {!isArchived && (
          <>
            <Separator />
            <div className="p-3 space-y-2">
              {replyingToComment && (
                <div className="flex items-center justify-between rounded-md bg-muted px-2.5 py-1.5">
                  <span className="text-xs text-muted-foreground truncate">
                    {t('comments.replying_to', { name: replyingToComment.author_name })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-xs"
                    onClick={() => setReplyingTo(null)}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              )}
              <div className="flex gap-2">
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      handleSubmit()
                    }
                  }}
                  placeholder={t('comments.write_placeholder')}
                  className="min-h-[60px] max-h-[120px] resize-none text-sm"
                  maxLength={2000}
                />
                <Button
                  size="icon"
                  className="h-[60px] w-10 shrink-0"
                  disabled={!body.trim() || submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">{t('comments.submit_shortcut')}</p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
