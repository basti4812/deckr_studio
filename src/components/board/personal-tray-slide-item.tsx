'use client'

import { useTranslation } from 'react-i18next'
import { FileText, GripVertical, X } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { PersonalSlideRecord } from '@/components/board/upload-personal-slide-dialog'

interface PersonalTraySlideItemProps {
  instanceId: string
  personalSlide: PersonalSlideRecord
  onRemove?: (instanceId: string) => void
}

export function PersonalTraySlideItem({
  instanceId,
  personalSlide,
  onRemove,
}: PersonalTraySlideItemProps) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: instanceId,
  })

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
      {/* Drag handle */}
      {onRemove ? (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
          aria-label={t('board.drag_to_reorder')}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      ) : (
        <div className="h-3.5 w-3.5 shrink-0" />
      )}

      {/* Placeholder thumbnail */}
      <div className="flex h-8 w-14 shrink-0 items-center justify-center rounded bg-muted">
        <FileText className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>

      {/* Title + badge */}
      <div className="flex flex-1 min-w-0 flex-col gap-0.5">
        <span className="truncate text-xs leading-tight" title={personalSlide.title}>
          {personalSlide.title}
        </span>
        <Badge variant="secondary" className="w-fit text-[9px] px-1.5 py-0 leading-4 font-semibold">
          {t('board.personal')}
        </Badge>
      </div>

      {/* Remove button */}
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
          onClick={() => onRemove(instanceId)}
          title={t('board.remove_from_project')}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}
