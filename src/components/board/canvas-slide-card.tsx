'use client'

import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  Eye,
  LayoutTemplate,
  Lock,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
} from 'lucide-react'
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
  zoom?: number
  onClick?: (slide: Slide) => void
  onAddToTray?: (slide: Slide) => void
  onPreview?: (slide: Slide) => void
  onEditFields?: (slide: Slide) => void
  onDoubleClick?: (slide: Slide) => void
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

/** Clamp a counter-scale factor so icons never get absurdly large or small */
export function clampScale(zoom: number): number {
  const raw = 1 / zoom
  return Math.min(2, Math.max(0.6, raw))
}

export const CanvasSlideCard = memo(function CanvasSlideCard({
  slide,
  zoom = 1,
  onClick,
  onAddToTray,
  onPreview,
  onEditFields,
  onDoubleClick,
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

  const isArchived = !!slide.archived_at
  const hasContextMenu = onAnnotationClick || (moveTargets && moveTargets.length > 0)
  const hasEditableFields = slide.editable_fields && slide.editable_fields.length > 0

  // Counter-scale factor so labels/icons stay constant size on screen
  const labelScale = 1 / zoom
  const iconScale = clampScale(zoom)

  const cardContent = (
    <div style={{ width: CARD_WIDTH }}>
      <div
        data-no-pan
        style={{ width: CARD_WIDTH }}
        className="select-none rounded-lg border bg-background shadow-sm overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/40 transition-shadow group/card"
        onClick={handleClick}
        onDoubleClick={
          onDoubleClick
            ? (e) => {
                e.stopPropagation()
                onDoubleClick(slide)
              }
            : undefined
        }
      >
        {/* Thumbnail */}
        <div
          style={{ height: THUMB_HEIGHT }}
          className="relative bg-muted flex items-center justify-center"
        >
          {slide.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slide.thumbnail_url}
              alt={slide.title}
              className={`h-full w-full object-cover ${isArchived ? 'grayscale opacity-60' : ''}`}
              loading="lazy"
            />
          ) : (
            <LayoutTemplate className="h-8 w-8 text-muted-foreground/40" />
          )}
          {slide.status === 'deprecated' && !isArchived && (
            <div className="absolute inset-0 bg-destructive/10" />
          )}
          {/* Archived overlay — grayed out with red exclamation */}
          {isArchived && (
            <>
              <div className="absolute inset-0 bg-muted/20" />
              <div
                className="absolute bottom-1.5 right-1.5 flex items-center justify-center rounded-full bg-destructive text-white shadow-sm"
                style={{
                  width: 22,
                  height: 22,
                  transform: `scale(${iconScale})`,
                  transformOrigin: 'bottom right',
                }}
                title={t('board.slide_archived_tooltip')}
              >
                <AlertCircle className="h-3.5 w-3.5" />
              </div>
            </>
          )}
          {onAddToTray && (
            <div className="absolute inset-0 flex items-center justify-center bg-primary/0 group-hover/card:bg-primary/10 transition-colors">
              <div
                className="flex items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 group-hover/card:opacity-100 transition-opacity shadow-md"
                style={{
                  width: 32,
                  height: 32,
                  transform: `scale(${iconScale})`,
                }}
              >
                <Plus className="h-4 w-4" />
              </div>
            </div>
          )}
          {/* Eye icon — hover only, counter-scaled */}
          {onPreview && (
            <button
              data-no-pan
              className="absolute top-1.5 right-1.5 flex items-center justify-center rounded-md bg-black/50 text-white opacity-0 group-hover/card:opacity-100 transition-opacity hover:bg-black/70"
              style={{
                width: 24,
                height: 24,
                transform: `scale(${iconScale})`,
                transformOrigin: 'top right',
              }}
              onClick={(e) => {
                e.stopPropagation()
                onPreview(slide)
              }}
              title={t('slide_preview.title')}
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          )}
          {/* Pencil icon — hover only, counter-scaled, clickable */}
          {hasEditableFields && (
            <button
              data-no-pan
              className="absolute bottom-1.5 left-1.5 flex items-center justify-center rounded bg-amber-500/90 text-white shadow-sm opacity-0 group-hover/card:opacity-100 transition-opacity hover:bg-amber-600"
              style={{
                width: 20,
                height: 20,
                transform: `scale(${iconScale})`,
                transformOrigin: 'bottom left',
              }}
              onClick={(e) => {
                e.stopPropagation()
                onEditFields?.(slide)
              }}
              title={t('edit_fields.title')}
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          {/* Status badge overlay — always visible */}
          {slide.status !== 'standard' && (
            <div
              className="absolute top-1.5 left-1.5"
              style={{
                transform: `scale(${iconScale})`,
                transformOrigin: 'top left',
              }}
            >
              <StatusBadge status={slide.status} />
            </div>
          )}
        </div>
      </div>

      {/* Freestanding label below card — counter-scaled to stay constant size */}
      <div
        style={{
          transformOrigin: '0 0',
          transform: `scale(${labelScale})`,
          width: CARD_WIDTH * zoom,
        }}
        className="mt-1 pointer-events-none"
      >
        {/* Annotation */}
        {annotation && (
          <div
            data-no-pan
            className="mb-0.5 truncate text-[10px] font-medium text-primary/80 cursor-pointer hover:text-primary pointer-events-auto"
            title={annotation}
            onClick={(e) => {
              e.stopPropagation()
              onAnnotationClick?.(slide.id)
            }}
          >
            {annotation}
          </div>
        )}
        <p
          className="text-[11px] font-medium leading-tight text-muted-foreground truncate"
          title={slide.title}
        >
          {slide.title}
        </p>
      </div>
    </div>
  )

  if (!hasContextMenu) return cardContent

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{cardContent}</ContextMenuTrigger>
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
                    <ContextMenuItem
                      key={target.id}
                      onClick={() => onMoveToGroup(slide.id, target.id)}
                    >
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
