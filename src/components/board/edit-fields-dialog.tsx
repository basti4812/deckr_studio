'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Loader2, LayoutTemplate } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
  const [focusedFieldId, setFocusedFieldId] = useState<string | null>(null)
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState<string | undefined>(previewUrl)

  useEffect(() => {
    if (open) {
      setLocalValues({ ...values })
      setCurrentPreviewUrl(previewUrl)
      setShowSuccess(false)
      setFocusedFieldId(null)
    }
  }, [open, values, previewUrl])

  const imageUrl = currentPreviewUrl || slide.thumbnail_url
  const hasChanges = Object.keys(localValues).some(
    (key) => (localValues[key] ?? '') !== (values[key] ?? '')
  )

  // Find bounds for currently focused field
  const focusedField = focusedFieldId
    ? slide.editable_fields.find((f) => f.id === focusedFieldId)
    : null
  const focusedBounds = focusedField?.bounds

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

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent
        className="overflow-hidden flex flex-col p-0 sm:rounded-lg"
        style={{ width: '90vw', maxWidth: '90vw', height: '90vh', maxHeight: '90vh' }}
      >
        {/* Success overlay — needs relative parent (DialogContent via radix is already positioned) */}
        {showSuccess && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-[2px] rounded-lg">
            <div className="flex flex-col items-center gap-4 p-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="text-lg font-medium">{t('edit_fields.saved_successfully')}</p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={onClose}>
                  {t('edit_fields.close_dialog')}
                </Button>
                <Button onClick={() => setShowSuccess(false)}>
                  {t('edit_fields.continue_editing')}
                </Button>
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

        {/* Two-column layout */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          {/* Left: Slide preview with field highlighting */}
          <div className="md:w-1/2 lg:w-3/5 shrink-0 flex items-center justify-center bg-muted/30 p-6 overflow-hidden">
            <div className="relative rounded-lg overflow-hidden bg-muted max-w-full max-h-full">
              {imageUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt={slide.title}
                    className="block max-w-full max-h-[calc(90vh-10rem)] object-contain"
                  />
                  {/* Field highlight overlay — brand orange glow */}
                  {focusedBounds && (
                    <div
                      className="absolute pointer-events-none rounded-lg transition-all duration-300 ease-out"
                      style={{
                        left: `${focusedBounds.x}%`,
                        top: `${focusedBounds.y}%`,
                        width: `${focusedBounds.w}%`,
                        height: `${focusedBounds.h}%`,
                        background:
                          'linear-gradient(135deg, hsla(11, 54%, 49%, 0.15), hsla(11, 54%, 49%, 0.25))',
                        border: '2px solid hsla(11, 54%, 49%, 0.5)',
                        boxShadow:
                          '0 0 16px 4px hsla(11, 54%, 49%, 0.3), inset 0 0 12px hsla(11, 54%, 49%, 0.1)',
                        animation: 'field-glow 2s ease-in-out infinite',
                      }}
                    />
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center py-12 text-muted-foreground/40">
                  <LayoutTemplate className="h-16 w-16" />
                </div>
              )}
            </div>
          </div>

          {/* Right: Text fields + footer */}
          <div className="md:w-1/2 lg:w-2/5 flex flex-col overflow-hidden border-l min-h-0">
            <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">
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
                      onFocus={() => setFocusedFieldId(field.id)}
                      onBlur={() => setFocusedFieldId(null)}
                      rows={3}
                      className="resize-none"
                      aria-required={field.required}
                    />
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
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
