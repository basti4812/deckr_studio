'use client'

import { useTranslation } from 'react-i18next'
import { Minus, Plus, Shrink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

interface ZoomControlsProps {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
}

export function ZoomControls({ zoom, onZoomIn, onZoomOut, onFit }: ZoomControlsProps) {
  const { t } = useTranslation()
  return (
    <div
      data-no-pan
      className="flex items-center gap-1 rounded-lg border bg-background/95 shadow-md px-2 py-1 backdrop-blur"
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onZoomOut}
        title={t('board.zoom_out')}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>

      <span className="w-12 text-center text-xs font-medium tabular-nums">
        {Math.round(zoom * 100)}%
      </span>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onZoomIn}
        title={t('board.zoom_in')}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>

      <Separator orientation="vertical" className="h-4 mx-1" />

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onFit}
        title={t('board.fit_to_screen')}
      >
        <Shrink className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
