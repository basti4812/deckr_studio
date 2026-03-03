'use client'

import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ArrowRightLeft, LayoutTemplate, Lock, MessageSquare, Plus, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import type { Slide } from '@/components/slides/slide-card'

const CARD_WIDTH = 240
const THUMB_HEIGHT = Math.round(CARD_WIDTH * (9 / 16)) // 135px

export interface MoveTarget {
  id: string
  name: string
}

interface CanvasSlideCardProps {
  slide: Slide
  onClick?: (slide: Slide) => void
  onAddToTray?: (slide: Slide) => void
  annotation?: string
  onAnnotationClick?: (slideId: string) => void
  moveTargets?: MoveTarget[]
  onMoveToGroup?: (slideId: string, groupId: string) => void
  onResetPosition?: (slideId: string) => void
  hasOverride?: boolean
  currentGroupId?: string
}

function StatusBadge({ status }: { status: Slide['status'] }) {
  const { t } = useTranslation()
  if (status === 'mandatory') {
    return (
      <Badge variant="default" className="gap-1 text-[10px] h-5 px-1.5">
        <Lock className="h-2.5 w-2.5" />
        {t('board.mandatory')}
      </Badge>
    )
  }
  if (status === 'deprecated') {
    return (
      <Badge variant="destructive" className="gap-1 text-[10px] h-5 px-1.5">
        <AlertTriangle className="h-2.5 w-2.5" />
        {t('board.deprecated')}
      </Badge>
    )
  }
  return null
}

export const CanvasSlideCard = memo(function CanvasSlideCard({
  slide,
  onClick,
  onAddToTray,
  annotation,
  onAnnotationClick,
  moveTargets,
  onMoveToGroup,
  onResetPosition,
  hasOverride,
  currentGroupId,
}: CanvasSlideCardProps) {
  const { t } = useTranslation()
  function handleClick() {
    if (onAddToTray) {
      onAddToTray(slide)
    } else {
      onClick?.(slide)
    }
  }

  const hasContextMenu = onAnnotationClick || (moveTargets && moveTargets.length > 0)

  const cardContent = (
    <div style={{ width: CARD_WIDTH }}>
      {/* Annotation label */}
      {annotation && (
        <div
          data-no-pan
          className="mb-1 truncate text-[10px] font-medium text-primary/80 bg-primary/5 border border-primary/20 rounded px-1.5 py-0.5 cursor-pointer hover:bg-primary/10 transition-colors"
          title={annotation}
          onClick={(e) => { e.stopPropagation(); onAnnotationClick?.(slide.id) }}
        >
          {annotation}
        </div>
      )}
      <div
        data-no-pan
        style={{ width: CARD_WIDTH }}
        className="select-none rounded-lg border bg-background shadow-sm overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/40 transition-shadow group/card"
        onClick={handleClick}
      >
        {/* Thumbnail */}
        <div
          style={{ height: THUMB_HEIGHT }}
          className="relative bg-muted flex items-center justify-center border-b"
        >
          {slide.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slide.thumbnail_url}
              alt={slide.title}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <LayoutTemplate className="h-8 w-8 text-muted-foreground/40" />
          )}
          {slide.status === 'deprecated' && (
            <div className="absolute inset-0 bg-destructive/10" />
          )}
          {onAddToTray && (
            <div className="absolute inset-0 flex items-center justify-center bg-primary/0 group-hover/card:bg-primary/10 transition-colors">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 group-hover/card:opacity-100 transition-opacity shadow-md">
                <Plus className="h-4 w-4" />
              </div>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-2 space-y-1">
          <p
            className="text-xs font-medium leading-tight truncate"
            title={slide.title}
          >
            {slide.title}
          </p>
          <StatusBadge status={slide.status} />
          {slide.tags && slide.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {slide.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="inline-block rounded-full bg-secondary px-1.5 py-0 text-[10px] font-medium text-secondary-foreground leading-5">
                  {tag}
                </span>
              ))}
              {slide.tags.length > 3 && (
                <span className="inline-block rounded-full bg-secondary px-1.5 py-0 text-[10px] font-medium text-secondary-foreground leading-5">
                  +{slide.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  if (!hasContextMenu) return cardContent

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {cardContent}
      </ContextMenuTrigger>
      <ContextMenuContent>
        {onAnnotationClick && (
          <ContextMenuItem onClick={() => onAnnotationClick(slide.id)}>
            <MessageSquare className="mr-2 h-3.5 w-3.5" />
            {annotation ? t('board.edit_annotation') : t('board.add_annotation')}
          </ContextMenuItem>
        )}
        {moveTargets && moveTargets.length > 0 && onMoveToGroup && (
          <>
            {onAnnotationClick && <ContextMenuSeparator />}
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <ArrowRightLeft className="mr-2 h-3.5 w-3.5" />
                {t('board.move_to_group')}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {moveTargets
                  .filter((t) => t.id !== currentGroupId)
                  .map((target) => (
                    <ContextMenuItem key={target.id} onClick={() => onMoveToGroup(slide.id, target.id)}>
                      {target.name}
                    </ContextMenuItem>
                  ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}
        {hasOverride && onResetPosition && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onResetPosition(slide.id)}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              {t('board.reset_to_default_position')}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
})

export { CARD_WIDTH, THUMB_HEIGHT }
