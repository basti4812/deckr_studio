'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Loader2, LayoutTemplate } from 'lucide-react'
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
  const [showSuccess, setShowSuccess] = useState(false)
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState<string | undefined>(previewUrl)

  // Reset local state when dialog opens or values change externally
  useEffect(() => {
    if (open) {
      setLocalValues({ ...values })
      setCurrentPreviewUrl(previewUrl)
      setShowSuccess(false)
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
      setShowSuccess(true)
    } finally {
      setSaving(false)
    }
  }

  function handleContinueEditing() {
    setShowSuccess(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="w-[90vw] max-w-[90vw] h-[90vh] max-h-[90vh] overflow-hidden flex flex-col relative p-0">
        {/* Success overlay */}
        {showSuccess && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-[2px] rounded-lg">
            <div className="flex flex-col items-center gap-4 p-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="text-lg font-medium">{t('edit_fields.saved_successfully')}</p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={onClose}>
                  {t('edit_fields.close_dialog')}
                </Button>
                <Button onClick={handleContinueEditing}>{t('edit_fields.continue_editing')}</Button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{slide.title}</DialogTitle>
          </DialogHeader>
        </div>

        {/* Two-column layout: preview left, fields right */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left: Slide preview */}
          <div className="md:w-1/2 lg:w-3/5 shrink-0 flex items-center justify-center bg-muted/30 p-6 overflow-hidden">
            <div className="relative rounded-lg overflow-hidden bg-muted w-full h-full flex items-center justify-center">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt={slide.title}
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <div className="flex items-center justify-center py-12 text-muted-foreground/40">
                  <LayoutTemplate className="h-16 w-16" />
                </div>
              )}
            </div>
          </div>

          {/* Right: Text fields */}
          <div className="md:w-1/2 lg:w-2/5 flex flex-col overflow-hidden border-l">
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {slide.editable_fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('edit_fields.no_editable_fields')}
                </p>
              ) : (
                slide.editable_fields.map((field) => (
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
                ))
              )}
            </div>

            {/* Footer inside right column */}
            <div className="shrink-0 border-t p-4 flex items-center justify-between gap-2">
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
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
