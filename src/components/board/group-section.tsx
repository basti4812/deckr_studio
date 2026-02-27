import { memo } from 'react'
import { CanvasSlideCard, CARD_WIDTH } from './canvas-slide-card'
import type { Slide } from '@/components/slides/slide-card'

const COLS = 5
const GAP = 24
const SECTION_HEADER_HEIGHT = 36
const SECTION_HEADER_MARGIN_BOTTOM = 12

interface GroupSectionProps {
  name: string
  slides: Slide[]
  x: number
  y: number
  onAddToTray?: (slide: Slide) => void
}

export const GroupSection = memo(function GroupSection({
  name,
  slides,
  x,
  y,
  onAddToTray,
}: GroupSectionProps) {
  return (
    <div style={{ position: 'absolute', left: x, top: y }}>
      {/* Section label */}
      <div
        style={{ marginBottom: SECTION_HEADER_MARGIN_BOTTOM }}
        className="flex items-center gap-3"
      >
        <span className="text-sm font-semibold text-foreground/70 uppercase tracking-wider whitespace-nowrap">
          {name}
        </span>
        <div className="flex-1 h-px bg-border" style={{ minWidth: 40 }} />
        <span className="text-xs text-muted-foreground">{slides.length}</span>
      </div>

      {/* Slides grid */}
      {slides.length === 0 ? (
        <div
          style={{ width: COLS * CARD_WIDTH + (COLS - 1) * GAP }}
          className="flex items-center justify-center rounded-lg border border-dashed text-muted-foreground text-xs"
          // min height to keep the empty section visible
          // eslint-disable-next-line react/forbid-component-props
          // use inline style for height
        >
          <span className="py-6">No slides in this group</span>
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
            <CanvasSlideCard key={slide.id} slide={slide} onAddToTray={onAddToTray} />
          ))}
        </div>
      )}
    </div>
  )
})

export { COLS, GAP, SECTION_HEADER_HEIGHT, SECTION_HEADER_MARGIN_BOTTOM }
