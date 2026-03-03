'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CornerDownRight, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

export interface Comment {
  id: string
  project_id: string
  slide_id: string
  slide_instance_index: number
  parent_comment_id: string | null
  author_id: string
  body: string
  created_at: string
  deleted_at: string | null
  author_name: string
  author_avatar: string | null
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

interface CommentItemProps {
  comment: Comment
  replies: Comment[]
  currentUserId: string
  canModerate: boolean
  onReply: (parentId: string) => void
  onDelete: (commentId: string) => void
}

export function CommentItem({
  comment,
  replies,
  currentUserId,
  canModerate,
  onReply,
  onDelete,
}: CommentItemProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(true)
  const isDeleted = !!comment.deleted_at
  const canDelete = !isDeleted && (comment.author_id === currentUserId || canModerate)

  return (
    <div className="space-y-2">
      <CommentBubble
        comment={comment}
        canDelete={canDelete}
        onReply={() => onReply(comment.id)}
        onDelete={() => onDelete(comment.id)}
        isDeleted={isDeleted}
      />

      {/* Replies */}
      {replies.length > 0 && (
        <div className="ml-6 space-y-2 border-l-2 border-muted pl-3">
          {!expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t('comments.show_replies', { count: replies.length })}
            </button>
          )}
          {expanded &&
            replies.map((reply) => {
              const replyDeleted = !!reply.deleted_at
              const replyCanDelete = !replyDeleted && (reply.author_id === currentUserId || canModerate)
              return (
                <CommentBubble
                  key={reply.id}
                  comment={reply}
                  canDelete={replyCanDelete}
                  onDelete={() => onDelete(reply.id)}
                  isDeleted={replyDeleted}
                  isReply
                />
              )
            })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single comment bubble
// ---------------------------------------------------------------------------

function CommentBubble({
  comment,
  canDelete,
  onReply,
  onDelete,
  isDeleted,
  isReply,
}: {
  comment: Comment
  canDelete: boolean
  onReply?: () => void
  onDelete: () => void
  isDeleted: boolean
  isReply?: boolean
}) {
  const { t } = useTranslation()
  const [showFull, setShowFull] = useState(false)
  const truncated = !isDeleted && comment.body.length > 300 && !showFull

  if (isDeleted) {
    return (
      <div className="py-1.5">
        <p className="text-xs italic text-muted-foreground">{t('comments.deleted')}</p>
      </div>
    )
  }

  return (
    <div className="group space-y-1">
      {/* Author row */}
      <div className="flex items-center gap-2">
        <Avatar className="h-5 w-5">
          {comment.author_avatar && <AvatarImage src={comment.author_avatar} />}
          <AvatarFallback className="text-[9px]">{initials(comment.author_name)}</AvatarFallback>
        </Avatar>
        <span className="text-xs font-medium">{comment.author_name}</span>
        <span className="text-[10px] text-muted-foreground">{timeAgo(comment.created_at)}</span>
      </div>

      {/* Body */}
      <div className="pl-7">
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {truncated ? comment.body.slice(0, 300) + '…' : comment.body}
        </p>
        {truncated && (
          <button
            onClick={() => setShowFull(true)}
            className="text-xs text-muted-foreground hover:text-foreground mt-0.5"
          >
            {t('comments.show_more')}
          </button>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isReply && onReply && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={onReply}>
              <CornerDownRight className="h-3 w-3" />
              {t('comments.reply')}
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-destructive hover:text-destructive gap-1"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
              {t('comments.delete')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
