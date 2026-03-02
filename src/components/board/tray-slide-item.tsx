'use client'

import { GripVertical, LayoutTemplate, Lock, Pencil, X } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import type { Slide } from '@/components/slides/slide-card'

interface TraySlideItemProps {
  instanceId: string
  slide: Slide
  isMandatory: boolean
  instanceEdits: Record<string, string>
  projectUpdatedAt?: string | null
  onRemove?: (instanceId: string) => void
  onEditFields?: () => void
}

function FillDot({ slide, instanceEdits }: { slide: Slide; instanceEdits: Record<string, string> }) {
  const required = slide.editable_fields.filter((f) => f.required)
  if (required.length === 0) return null

  const filled = required.filter((f) => (instanceEdits[f.id] ?? '').trim() !== '').length
  const allFilled = filled === required.length

  return (
    <span
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
        allFilled ? 'bg-green-500' : 'bg-amber-400'
      }`}
      title={
        allFilled
          ? 'All required fields filled'
          : `${required.length - filled} required field${required.length - filled !== 1 ? 's' : ''} empty`
      }
      aria-hidden
    />
  )
}

export function TraySlideItem({
  instanceId,
  slide,
  isMandatory,
  instanceEdits,
  projectUpdatedAt,
  onRemove,
  onEditFields,
}: TraySlideItemProps) {
  const isUpdated =
    !!slide.pptx_updated_at &&
    !!projectUpdatedAt &&
    new Date(slide.pptx_updated_at) > new Date(projectUpdatedAt)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: instanceId })

  const hasEditableFields = slide.editable_fields.length > 0

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 group"
    >
      {/* Drag handle — hidden for mandatory and view-only */}
      {!onRemove ? (
        <div className="h-3.5 w-3.5 shrink-0" />
      ) : isMandatory ? (
        <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
      ) : (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Thumbnail */}
      <div className="flex h-8 w-14 shrink-0 items-center justify-center rounded bg-muted overflow-hidden">
        {slide.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slide.thumbnail_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <LayoutTemplate className="h-3.5 w-3.5 text-muted-foreground/50" />
        )}
      </div>

      {/* Title + fill indicator */}
      <div className="flex flex-1 min-w-0 flex-col gap-0.5">
        <span className="truncate text-xs leading-tight" title={slide.title}>
          {slide.title}
        </span>
        <div className="flex items-center gap-1">
          {isUpdated && (
            <span className="inline-block rounded-full bg-blue-100 px-1.5 text-[9px] font-semibold text-blue-700 leading-4 dark:bg-blue-900/40 dark:text-blue-300">
              Updated
            </span>
          )}
          {hasEditableFields && (
            <FillDot slide={slide} instanceEdits={instanceEdits} />
          )}
        </div>
      </div>

      {/* Edit fields button */}
      {hasEditableFields && onEditFields && (
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-opacity"
          onClick={onEditFields}
          title="Edit text fields"
        >
          <Pencil className="h-3 w-3" />
        </Button>
      )}

      {/* Remove button — hidden for mandatory and view-only */}
      {!isMandatory && onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
          onClick={() => onRemove(instanceId)}
          title="Remove from project"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
      {isMandatory && !hasEditableFields && <div className="h-5 w-5 shrink-0" />}
    </div>
  )
}
