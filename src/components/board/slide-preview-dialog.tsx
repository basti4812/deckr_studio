'use client'

import { useTranslation } from 'react-i18next'
import { LayoutTemplate } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Slide } from '@/components/slides/slide-card'

interface SlidePreviewDialogProps {
  open: boolean
  onClose: () => void
  slide: Slide | null
  textEdits?: Record<string, string>
}

export function SlidePreviewDialog({
  open,
  onClose,
  slide,
  textEdits,
}: SlidePreviewDialogProps) {
  const { t } = useTranslation()

  if (!slide) return null

  const hasEdits = textEdits && Object.values(textEdits).some((v) => v.trim() !== '')

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{slide.title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Slide thumbnail — large preview */}
          <div className="relative flex-1 min-h-0 flex items-center justify-center bg-muted rounded-lg overflow-hidden">
            {slide.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={slide.thumbnail_url}
                alt={slide.title}
                className="max-w-full max-h-[50vh] object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground/40">
                <LayoutTemplate className="h-16 w-16" />
                <p className="text-sm">{slide.title}</p>
              </div>
            )}
          </div>

          {/* Metadata badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {slide.status === 'mandatory' && (
              <Badge variant="default" className="text-xs">{t('board.mandatory')}</Badge>
            )}
            {slide.status === 'deprecated' && (
              <Badge variant="destructive" className="text-xs">{t('board.deprecated')}</Badge>
            )}
            {slide.tags && slide.tags.length > 0 && slide.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
            ))}
          </div>

          {/* Text fields section */}
          {slide.editable_fields.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{t('slide_preview.text_fields')}</h4>
              <ScrollArea className="max-h-[200px]">
                <div className="space-y-2 pr-2">
                  {slide.editable_fields.map((field) => {
                    const value = textEdits?.[field.id]?.trim()
                    return (
                      <div key={field.id} className="flex items-start gap-3 rounded-md border p-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium">{field.label}</span>
                            {field.required && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-3.5">
                                {t('edit_fields.required')}
                              </Badge>
                            )}
                          </div>
                          <p className={`mt-0.5 text-sm ${value ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                            {value || t('slide_preview.field_empty')}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
              {!hasEdits && (
                <p className="text-xs text-muted-foreground">{t('slide_preview.no_text_edits')}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('slide_preview.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
