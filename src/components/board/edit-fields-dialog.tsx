'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, LayoutTemplate } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Slide } from '@/components/slides/slide-card'

interface EditFieldsDialogProps {
  open: boolean
  onClose: () => void
  slide: Slide
  instanceId: string
  values: Record<string, string>
  previewUrl?: string
  onSave: (fieldValues: Record<string, string>) => Promise<string | undefined>
}

export function EditFieldsDialog({
  open,
  onClose,
  slide,
  values,
  previewUrl,
  onSave,
}: EditFieldsDialogProps) {
  const { t } = useTranslation()
  const [localValues, setLocalValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState<string | undefined>(previewUrl)

  // Reset local state when dialog opens or values change externally
  useEffect(() => {
    if (open) {
      setLocalValues({ ...values })
      setCurrentPreviewUrl(previewUrl)
    }
  }, [open, values, previewUrl])

  const imageUrl = currentPreviewUrl || slide.thumbnail_url
  const hasChanges = Object.keys(localValues).some(
    (key) => (localValues[key] ?? '') !== (values[key] ?? '')
  )

  async function handleSave() {
    setSaving(true)
    try {
      const newPreviewUrl = await onSave(localValues)
      if (newPreviewUrl) {
        setCurrentPreviewUrl(newPreviewUrl)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{slide.title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 -mx-6 px-6">
          {/* Sticky preview image */}
          <div className="sticky top-0 z-10 bg-background pb-3">
            <div className="relative rounded-lg overflow-hidden bg-muted">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt={slide.title}
                  className="w-full object-contain max-h-[35vh]"
                />
              ) : (
                <div className="flex items-center justify-center py-12 text-muted-foreground/40">
                  <LayoutTemplate className="h-12 w-12" />
                </div>
              )}
            </div>
          </div>

          {/* Text fields */}
          {slide.editable_fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('edit_fields.no_editable_fields')}</p>
          ) : (
            <div className="space-y-4 pb-2">
              {slide.editable_fields.map((field) => (
                <div key={field.id} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`field-${field.id}`} className="text-sm font-medium">
                      {field.label}
                      {field.required && <span className="ml-0.5 text-destructive">*</span>}
                    </Label>
                    {field.required && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground"
                      >
                        {t('edit_fields.required')}
                      </Badge>
                    )}
                  </div>
                  <Textarea
                    id={`field-${field.id}`}
                    placeholder={field.placeholder}
                    value={localValues[field.id] ?? ''}
                    onChange={(e) =>
                      setLocalValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                    }
                    rows={3}
                    className="resize-none"
                    aria-required={field.required}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t('edit_fields.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('edit_fields.rendering')}
              </>
            ) : (
              t('edit_fields.save_and_render')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
