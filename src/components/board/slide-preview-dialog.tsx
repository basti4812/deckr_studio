'use client'

import { useTranslation } from 'react-i18next'
import { LayoutTemplate, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Slide } from '@/components/slides/slide-card'

interface SlidePreviewDialogProps {
  open: boolean
  onClose: () => void
  slide: Slide | null
  previewUrl?: string
  onEditFields?: () => void
}

export function SlidePreviewDialog({
  open,
  onClose,
  slide,
  previewUrl,
  onEditFields,
}: SlidePreviewDialogProps) {
  const { t } = useTranslation()

  if (!open || !slide) return null

  const imageUrl = previewUrl || slide.thumbnail_url
  const hasEditableFields = slide.editable_fields && slide.editable_fields.length > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      style={{ padding: 50 }}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        onClick={onClose}
        aria-label={t('slide_preview.close')}
      >
        <X className="h-5 w-5" />
      </button>

      {/* Slide image */}
      <div
        className="relative flex items-center justify-center w-full h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={slide.title}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          />
        ) : (
          <div className="flex flex-col items-center gap-4 text-white/40">
            <LayoutTemplate className="h-24 w-24" />
            <p className="text-lg">{slide.title}</p>
          </div>
        )}
      </div>

      {/* Edit fields button — bottom center */}
      {hasEditableFields && onEditFields && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="secondary"
            size="sm"
            className="gap-2 shadow-lg"
            onClick={() => {
              onClose()
              onEditFields()
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            {t('edit_fields.title')}
          </Button>
        </div>
      )}
    </div>
  )
}
