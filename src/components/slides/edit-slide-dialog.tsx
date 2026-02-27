'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
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
  const [fields, setFields] = useState<EditableField[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (slide) {
      setTitle(slide.title)
      setStatus(slide.status)
      setFields(slide.editable_fields ?? [])
      setError(null)
    }
  }, [slide])

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

      const res = await fetch(`/api/slides/${slide.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          status,
          editable_fields: fields,
        }),
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
