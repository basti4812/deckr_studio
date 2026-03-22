'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { SlideCard } from './slide-card'
import type { Slide } from './slide-card'

interface SlideGroupCardProps {
  filename: string
  slides: Slide[]
  onEdit: (slide: Slide) => void
  onDelete: (slide: Slide) => void
  onUnarchive?: (slide: Slide) => void
  selected: Set<string>
  onSelectChange: (id: string, checked: boolean) => void
}

export function SlideGroupCard({
  filename,
  slides,
  onEdit,
  onDelete,
  onUnarchive,
  selected,
  onSelectChange,
}: SlideGroupCardProps) {
  const [expanded, setExpanded] = useState(false)
  const coverSlide = slides.find((s) => s.page_index === 0) ?? slides[0]

  return (
    <div className="col-span-full">
      {/* Group header — clickable to expand/collapse */}
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3 text-left transition-colors hover:bg-muted"
        onClick={() => setExpanded((e) => !e)}
      >
        {/* Thumbnail preview */}
        <div className="h-12 w-[68px] flex-shrink-0 overflow-hidden rounded border bg-muted">
          {coverSlide?.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverSlide.thumbnail_url}
              alt={filename}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium">{filename}</p>
          <p className="text-xs text-muted-foreground">
            {slides.length} slide{slides.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Status summary */}
        <div className="flex items-center gap-2">
          {slides.some((s) => s.status === 'mandatory') && (
            <Badge variant="default" className="text-xs">
              Mandatory
            </Badge>
          )}
          {slides.some((s) => s.status === 'deprecated') && (
            <Badge variant="destructive" className="text-xs">
              Deprecated
            </Badge>
          )}
        </div>

        {/* Expand icon */}
        {expanded ? (
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* Expanded grid of slides */}
      {expanded && (
        <div className="mt-2 grid grid-cols-1 gap-3 pl-4 sm:grid-cols-2 lg:grid-cols-3">
          {slides
            .sort((a, b) => (a.page_index ?? 0) - (b.page_index ?? 0))
            .map((slide) => (
              <SlideCard
                key={slide.id}
                slide={slide}
                onEdit={onEdit}
                onDelete={onDelete}
                onUnarchive={onUnarchive}
                selected={selected.has(slide.id)}
                onSelectChange={(checked) => onSelectChange(slide.id, checked)}
              />
            ))}
        </div>
      )}
    </div>
  )
}
