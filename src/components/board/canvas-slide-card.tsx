import { memo } from 'react'
import { AlertTriangle, LayoutTemplate, Lock, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { Slide } from '@/components/slides/slide-card'

const CARD_WIDTH = 240
const THUMB_HEIGHT = Math.round(CARD_WIDTH * (9 / 16)) // 135px

interface CanvasSlideCardProps {
  slide: Slide
  onClick?: (slide: Slide) => void
  onAddToTray?: (slide: Slide) => void
}

function StatusBadge({ status }: { status: Slide['status'] }) {
  if (status === 'mandatory') {
    return (
      <Badge variant="default" className="gap-1 text-[10px] h-5 px-1.5">
        <Lock className="h-2.5 w-2.5" />
        Mandatory
      </Badge>
    )
  }
  if (status === 'deprecated') {
    return (
      <Badge variant="destructive" className="gap-1 text-[10px] h-5 px-1.5">
        <AlertTriangle className="h-2.5 w-2.5" />
        Deprecated
      </Badge>
    )
  }
  return null
}

export const CanvasSlideCard = memo(function CanvasSlideCard({
  slide,
  onClick,
  onAddToTray,
}: CanvasSlideCardProps) {
  function handleClick() {
    if (onAddToTray) {
      onAddToTray(slide)
    } else {
      onClick?.(slide)
    }
  }

  return (
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
      </div>
    </div>
  )
})

export { CARD_WIDTH, THUMB_HEIGHT }
