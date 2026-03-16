'use client'

import { useTranslation } from 'react-i18next'
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
  onChange: (fieldId: string, value: string) => void
}

export function EditFieldsDialog({
  open,
  onClose,
  slide,
  values,
  onChange,
}: EditFieldsDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{slide.title}</DialogTitle>
        </DialogHeader>

        {slide.editable_fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('edit_fields.no_editable_fields')}</p>
        ) : (
          <div className="space-y-4">
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
                  value={values[field.id] ?? ''}
                  onChange={(e) => onChange(field.id, e.target.value)}
                  onBlur={(e) => onChange(field.id, e.target.value)}
                  rows={3}
                  className="resize-none"
                  aria-required={field.required}
                />
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <p className="text-xs text-muted-foreground">{t('edit_fields.auto_saved')}</p>
          <Button onClick={onClose}>{t('edit_fields.done')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
