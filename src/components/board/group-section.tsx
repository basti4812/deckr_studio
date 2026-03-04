'use client'

import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GripHorizontal, Pencil, Trash2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CanvasSlideCard, CARD_WIDTH, type MoveTarget } from './canvas-slide-card'
import type { Slide } from '@/components/slides/slide-card'

const COLS = 5
const GAP = 24
const SECTION_HEADER_HEIGHT = 36
const SECTION_HEADER_MARGIN_BOTTOM = 12

interface GroupSectionProps {
  id: string
  name: string
  slides: Slide[]
  x: number
  y: number
  onAddToTray?: (slide: Slide) => void
  isPersonal?: boolean
  onRename?: (name: string) => void
  onDelete?: () => void
  annotations?: Record<string, string>
  onAnnotationClick?: (slideId: string) => void
  moveTargets?: MoveTarget[]
  onMoveToGroup?: (slideId: string, groupId: string) => void
  onResetPosition?: (slideId: string) => void
  overriddenSlideIds?: Set<string>
  /** Drag offset applied while group is being dragged */
  dragOffset?: { dx: number; dy: number }
  /** Pointer-down handler for group drag (fired from header) */
  onGroupPointerDown?: (e: React.PointerEvent) => void
}

export const GroupSection = memo(function GroupSection({
  id,
  name,
  slides,
  x,
  y,
  onAddToTray,
  isPersonal,
  onRename,
  onDelete,
  annotations,
  onAnnotationClick,
  moveTargets,
  onMoveToGroup,
  onResetPosition,
  overriddenSlideIds,
  dragOffset,
  onGroupPointerDown,
}: GroupSectionProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(name)

  function handleRename() {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== name) onRename?.(trimmed)
    setEditing(false)
  }

  const isDragging = dragOffset && (Math.abs(dragOffset.dx) > 2 || Math.abs(dragOffset.dy) > 2)
  const groupWidth = COLS * CARD_WIDTH + (COLS - 1) * GAP

  return (
    <div
      data-group-id={id}
      style={{
        position: 'absolute',
        left: x + (dragOffset?.dx ?? 0),
        top: y + (dragOffset?.dy ?? 0),
        zIndex: isDragging ? 100 : undefined,
        opacity: isDragging ? 0.9 : undefined,
        transition: isDragging ? undefined : 'left 0.15s ease, top 0.15s ease',
      }}
    >
      {/* Visual container background */}
      <div
        style={{ width: groupWidth + 24, marginLeft: -12, marginTop: -8, paddingBottom: 12 }}
        className="absolute inset-0 rounded-xl border border-dashed border-border/50 bg-muted/20"
      />

      {/* Section header — drag handle */}
      <div
        data-no-pan
        style={{ marginBottom: SECTION_HEADER_MARGIN_BOTTOM, cursor: onGroupPointerDown ? 'grab' : undefined }}
        className="relative flex items-center gap-3"
        onPointerDown={(e) => {
          // Don't start drag if clicking on buttons/inputs
          if ((e.target as HTMLElement).closest('button, input')) return
          onGroupPointerDown?.(e)
        }}
      >
        {/* Drag grip indicator */}
        {onGroupPointerDown && (
          <GripHorizontal className="h-4 w-4 text-muted-foreground/40 shrink-0" />
        )}

        {editing ? (
          <div data-no-pan className="flex items-center gap-1">
            <Input
              className="h-7 w-48 text-sm"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditing(false) }}
              autoFocus
            />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRename}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <>
            <span className="text-sm font-semibold text-foreground/70 uppercase tracking-wider whitespace-nowrap">
              {name}
            </span>
            {isPersonal && (
              <div data-no-pan className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => { setEditName(name); setEditing(true) }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </>
        )}
        <div className="flex-1 h-px bg-border" style={{ minWidth: 40 }} />
        <span className="text-xs text-muted-foreground">{slides.length}</span>
      </div>

      {/* Slides grid */}
      <div className="relative">
        {slides.length === 0 ? (
          <div
            style={{ width: groupWidth }}
            className="flex items-center justify-center rounded-lg border border-dashed text-muted-foreground text-xs"
          >
            <span className="py-6">
              {isPersonal ? t('board.right_click_move_here') : t('board.no_slides_in_group')}
            </span>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${COLS}, ${CARD_WIDTH}px)`,
              gap: GAP,
            }}
          >
            {slides.map((slide) => (
              <CanvasSlideCard
                key={slide.id}
                slide={slide}
                onAddToTray={onAddToTray}
                annotation={annotations?.[slide.id]}
                onAnnotationClick={onAnnotationClick}
                moveTargets={moveTargets}
                onMoveToGroup={onMoveToGroup}
                onResetPosition={onResetPosition}
                hasOverride={overriddenSlideIds?.has(slide.id)}
                currentGroupId={id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
})

export { COLS, GAP, SECTION_HEADER_HEIGHT, SECTION_HEADER_MARGIN_BOTTOM }
