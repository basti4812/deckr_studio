'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, RefreshCw, Scan, Trash2, Upload, X } from 'lucide-react'
import { parsePptxFields } from '@/lib/pptx-parser'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import type { EditableField, Slide } from './slide-card'

interface EditSlideDialogProps {
  slide: Slide | null
  onClose: () => void
  onSaved: (slide: Slide) => void
}

export function EditSlideDialog({ slide, onClose, onSaved }: EditSlideDialogProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<Slide['status']>('standard')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [fields, setFields] = useState<EditableField[]>([])
  const [replacementFile, setReplacementFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scanInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (slide) {
      setTitle(slide.title)
      setStatus(slide.status)
      setTags(slide.tags ?? [])
      setTagInput('')
      setFields(slide.editable_fields ?? [])
      setReplacementFile(null)
      setError(null)
    }
  }, [slide])

  function commitTagInput() {
    const trimmed = tagInput.trim().toLowerCase()
    if (!trimmed || trimmed.length > 50 || tags.includes(trimmed) || tags.length >= 20) {
      setTagInput('')
      return
    }
    setTags((prev) => [...prev, trimmed])
    setTagInput('')
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag))
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    if (!selected) return
    if (!selected.name.endsWith('.pptx')) {
      setError(t('slides.only_pptx_accepted'))
      return
    }
    setError(null)
    setReplacementFile(selected)
  }

  function addField() {
    setFields((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label: '', placeholder: '', required: false },
    ])
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id))
  }

  function updateField(id: string, changes: Partial<EditableField>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...changes } : f)))
  }

  async function handleRescan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !slide) return
    setScanning(true)
    try {
      const detected = await parsePptxFields(file, slide.page_index ?? 0)
      const newFields = detected.map((f) => ({
        id: f.id,
        label: f.label.slice(0, 100),
        placeholder: f.placeholder.length <= 500 ? f.placeholder : '',
        required: f.required,
      }))
      setFields(newFields)
    } catch {
      setError(t('slides.scan_error'))
    } finally {
      setScanning(false)
      if (scanInputRef.current) scanInputRef.current.value = ''
    }
  }

  async function handleSave() {
    if (!slide) return
    if (!title.trim()) {
      setError(t('slides.title_required'))
      return
    }

    // Validate fields
    for (const f of fields) {
      if (!f.label.trim()) {
        setError(t('slides.all_fields_need_label'))
        return
      }
    }

    setSaving(true)
    setError(null)

    try {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      // If a replacement PPTX was selected, upload it first
      let newPptxUrl: string | undefined
      if (replacementFile) {
        const storagePath = `${slide.tenant_id}/${slide.id}/original.pptx`
        const { error: storageError } = await supabase.storage
          .from('slides')
          .upload(storagePath, replacementFile, {
            contentType:
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            upsert: true,
          })
        if (storageError) throw new Error(storageError.message)

        const { data: urlData } = await supabase.storage
          .from('slides')
          .createSignedUrl(storagePath, 60 * 60 * 24 * 365)

        newPptxUrl = urlData?.signedUrl ?? undefined
      }

      const patchBody: Record<string, unknown> = {
        title: title.trim(),
        status,
        tags,
        editable_fields: fields,
      }
      if (newPptxUrl) patchBody.pptx_url = newPptxUrl

      const res = await fetch(`/api/slides/${slide.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(patchBody),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to save')
      }

      const data = await res.json()
      onSaved(data.slide as Slide)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!slide} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('slides.edit_slide')}</DialogTitle>
          <DialogDescription>{t('slides.edit_slide_description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="edit-title">{t('slides.title')}</Label>
            <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label htmlFor="edit-status">{t('slides.status')}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Slide['status'])}>
              <SelectTrigger id="edit-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">{t('slides.standard')}</SelectItem>
                <SelectItem value="mandatory">{t('slides.mandatory_description')}</SelectItem>
                <SelectItem value="deprecated">{t('slides.deprecated_description')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>{t('slides.tags')}</Label>
            <div
              className="flex flex-wrap gap-1.5 min-h-[2rem] rounded-md border px-2 py-1.5 bg-background focus-within:ring-1 focus-within:ring-ring cursor-text"
              onClick={() => tagInputRef.current?.focus()}
            >
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeTag(tag)
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                ref={tagInputRef}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    commitTagInput()
                  }
                  if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
                    setTags((prev) => prev.slice(0, -1))
                  }
                }}
                onBlur={commitTagInput}
                placeholder={tags.length === 0 ? t('slides.type_tag_placeholder') : ''}
                className="flex-1 min-w-[120px] bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                disabled={tags.length >= 20}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t('slides.tags_hint')}</p>
          </div>

          <Separator />

          {/* Replace PPTX */}
          <div className="space-y-2">
            <Label>{t('slides.powerpoint_file')}</Label>
            {replacementFile ? (
              <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 px-3 py-2">
                <RefreshCw className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <span className="flex-1 truncate text-sm text-blue-700 dark:text-blue-300">
                  {replacementFile.name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0"
                  onClick={() => setReplacementFile(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div
                className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 shrink-0" />
                {t('slides.replace_pptx')}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="hidden"
              onChange={handleFileChange}
            />
            <p className="text-xs text-muted-foreground">{t('slides.replace_warning')}</p>
          </div>

          <Separator />

          {/* Editable fields */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t('slides.editable_text_fields')}</Label>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => scanInputRef.current?.click()}
                  disabled={scanning}
                >
                  <Scan className="mr-1 h-3 w-3" />
                  {scanning ? t('slides.scanning') : t('slides.rescan_pptx')}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={addField}>
                  <Plus className="mr-1 h-3 w-3" />
                  {t('slides.add_field')}
                </Button>
              </div>
            </div>
            <input
              ref={scanInputRef}
              type="file"
              accept=".pptx"
              className="hidden"
              onChange={handleRescan}
            />

            {fields.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('slides.no_editable_fields')}</p>
            )}

            {fields.map((field, index) => (
              <div key={field.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t('slides.field_number', { number: index + 1 })}
                    </span>
                    {field.placeholder && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {t('slides.auto_detected')}
                      </Badge>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={() => removeField(field.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{t('slides.label')} *</Label>
                    <Input
                      value={field.label}
                      onChange={(e) => updateField(field.id, { label: e.target.value })}
                      placeholder={t('slides.label_placeholder')}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('slides.placeholder')}</Label>
                    <Input
                      value={field.placeholder}
                      onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                      placeholder={t('slides.placeholder_placeholder')}
                      maxLength={500}
                      className="h-8 text-sm"
                    />
                    {field.placeholder.length > 450 && (
                      <p className="text-[10px] text-warning">
                        {field.placeholder.length}/500 {t('slides.placeholder_max_hint')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`required-${field.id}`}
                    checked={field.required}
                    onCheckedChange={(checked) =>
                      updateField(field.id, { required: checked === true })
                    }
                  />
                  <Label
                    htmlFor={`required-${field.id}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {t('slides.required_description')}
                  </Label>
                </div>
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t('slides.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('slides.saving') : t('slides.save_changes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
