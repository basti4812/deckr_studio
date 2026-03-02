'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, RefreshCw, Trash2, Upload, X } from 'lucide-react'
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
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<Slide['status']>('standard')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [fields, setFields] = useState<EditableField[]>([])
  const [replacementFile, setReplacementFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      setError('Only .pptx files are accepted')
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

  async function handleSave() {
    if (!slide) return
    if (!title.trim()) { setError('Title is required'); return }

    // Validate fields
    for (const f of fields) {
      if (!f.label.trim()) {
        setError('All editable fields must have a label')
        return
      }
    }

    setSaving(true)
    setError(null)

    try {
      const supabase = createBrowserSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      // If a replacement PPTX was selected, upload it first
      let newPptxUrl: string | undefined
      if (replacementFile) {
        const storagePath = `${slide.tenant_id}/${slide.id}/original.pptx`
        const { error: storageError } = await supabase.storage
          .from('slides')
          .upload(storagePath, replacementFile, {
            contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
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
          <DialogTitle>Edit Slide</DialogTitle>
          <DialogDescription>
            Update the title, status, and editable fields for this slide.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label htmlFor="edit-status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Slide['status'])}>
              <SelectTrigger id="edit-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="mandatory">Mandatory — always included, cannot be removed</SelectItem>
                <SelectItem value="deprecated">Deprecated — hidden from new projects</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5 min-h-[2rem] rounded-md border px-2 py-1.5 bg-background focus-within:ring-1 focus-within:ring-ring cursor-text" onClick={() => tagInputRef.current?.focus()}>
              {tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                  {tag}
                  <button type="button" onClick={(e) => { e.stopPropagation(); removeTag(tag) }} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                ref={tagInputRef}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitTagInput() }
                  if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
                    setTags((prev) => prev.slice(0, -1))
                  }
                }}
                onBlur={commitTagInput}
                placeholder={tags.length === 0 ? 'Type a tag and press Enter…' : ''}
                className="flex-1 min-w-[120px] bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                disabled={tags.length >= 20}
              />
            </div>
            <p className="text-xs text-muted-foreground">Press Enter or comma to add. Max 20 tags.</p>
          </div>

          <Separator />

          {/* Replace PPTX */}
          <div className="space-y-2">
            <Label>PowerPoint file</Label>
            {replacementFile ? (
              <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 px-3 py-2">
                <RefreshCw className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <span className="flex-1 truncate text-sm text-blue-700 dark:text-blue-300">{replacementFile.name}</span>
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
                Replace PPTX file…
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="hidden"
              onChange={handleFileChange}
            />
            <p className="text-xs text-muted-foreground">
              Uploading a new file will update all projects using this slide.
            </p>
          </div>

          <Separator />

          {/* Editable fields */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Editable text fields</Label>
              <Button type="button" variant="outline" size="sm" onClick={addField}>
                <Plus className="mr-1 h-3 w-3" />
                Add field
              </Button>
            </div>

            {fields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No editable fields. Employees will not be able to modify any text on this slide.
              </p>
            )}

            {fields.map((field, index) => (
              <div key={field.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Field {index + 1}
                  </span>
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
                    <Label className="text-xs">Label *</Label>
                    <Input
                      value={field.label}
                      onChange={(e) => updateField(field.id, { label: e.target.value })}
                      placeholder="e.g. Customer name"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Placeholder</Label>
                    <Input
                      value={field.placeholder}
                      onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                      placeholder="e.g. Enter customer name"
                      className="h-8 text-sm"
                    />
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
                  <Label htmlFor={`required-${field.id}`} className="text-sm font-normal cursor-pointer">
                    Required — warn before export if empty
                  </Label>
                </div>
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
