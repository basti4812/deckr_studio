'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LayoutTemplate, Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { TemplateSetCard, type TemplateSet } from '@/components/admin/template-set-card'
import { ManageTemplateSlidesDialog } from '@/components/admin/manage-template-slides-dialog'
import type { Slide } from '@/components/slides/slide-card'

// ---------------------------------------------------------------------------
// Create / Edit dialog
// ---------------------------------------------------------------------------

interface SetFormState {
  name: string
  description: string
  category: string
  coverFile: File | null
}

interface SetDialogProps {
  open: boolean
  editTarget: TemplateSet | null
  onClose: () => void
  onSaved: (set: TemplateSet) => void
}

function TemplateSetDialog({ open, editTarget, onClose, onSaved }: SetDialogProps) {
  const [form, setForm] = useState<SetFormState>({
    name: '',
    description: '',
    category: '',
    coverFile: null,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setForm({
        name: editTarget?.name ?? '',
        description: editTarget?.description ?? '',
        category: editTarget?.category ?? '',
        coverFile: null,
      })
      setError(null)
    }
  }, [open, editTarget])

  async function handleSubmit() {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError(null)
    try {
      const supabase = createBrowserSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('Not authenticated'); return }
      const token = session.access_token

      let result: TemplateSet
      if (editTarget) {
        const res = await fetch(`/api/template-sets/${editTarget.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            name: form.name.trim(),
            description: form.description.trim() || null,
            category: form.category.trim() || null,
          }),
        })
        if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to update'); return }
        const d = await res.json()
        result = d.templateSet
      } else {
        const res = await fetch('/api/template-sets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            name: form.name.trim(),
            description: form.description.trim() || null,
            category: form.category.trim() || null,
          }),
        })
        if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to create'); return }
        const d = await res.json()
        result = { ...d.templateSet, slide_count: 0, first_slide_thumbnail: null }
      }

      // Upload cover image if provided
      if (form.coverFile) {
        const fd = new FormData()
        fd.append('cover', form.coverFile)
        const coverRes = await fetch(`/api/template-sets/${result.id}/cover`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        })
        if (coverRes.ok) {
          const coverData = await coverRes.json()
          result = { ...result, cover_image_url: coverData.templateSet.cover_image_url }
        }
      }

      onSaved(result)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editTarget ? 'Edit template set' : 'New template set'}</DialogTitle>
          <DialogDescription>
            {editTarget
              ? 'Update the name, description, category, or cover image.'
              : 'Create a named collection of slides for a specific presentation type.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ts-name">Name *</Label>
            <Input
              id="ts-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Sales Pitch, Onboarding, QBR"
              maxLength={100}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ts-category">Category</Label>
            <Input
              id="ts-category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="e.g. Sales, HR, Marketing"
              maxLength={50}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ts-description">Description</Label>
            <Textarea
              id="ts-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Briefly describe when to use this template set…"
              maxLength={500}
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Cover image (optional)</Label>
            <div
              className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-4 py-4 text-center hover:border-muted-foreground/50"
              onClick={() => fileInputRef.current?.click()}
            >
              {form.coverFile ? (
                <p className="text-sm text-foreground">{form.coverFile.name}</p>
              ) : (
                <>
                  <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                  <p className="text-xs text-muted-foreground">
                    Click to upload — JPEG, PNG or WebP, max 5 MB
                  </p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setForm((prev) => ({ ...prev, coverFile: f }))
              }}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : editTarget ? 'Save changes' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TemplateSetsPage() {
  const [templateSets, setTemplateSets] = useState<TemplateSet[]>([])
  const [allSlides, setAllSlides] = useState<Slide[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<TemplateSet | null>(null)
  const [managingSet, setManagingSet] = useState<TemplateSet | null>(null)

  const fetchData = useCallback(async () => {
    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    setLoading(true)
    try {
      const [setsRes, slidesRes] = await Promise.all([
        fetch('/api/template-sets', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch('/api/slides', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
      ])
      if (setsRes.ok) {
        const d = await setsRes.json()
        setTemplateSets(d.templateSets ?? [])
      }
      if (slidesRes.ok) {
        const d = await slidesRes.json()
        setAllSlides(d.slides ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleDelete(setId: string) {
    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const res = await fetch(`/api/template-sets/${setId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      setTemplateSets((prev) => prev.filter((s) => s.id !== setId))
    }
  }

  function handleSaved(saved: TemplateSet) {
    setTemplateSets((prev) => {
      const idx = prev.findIndex((s) => s.id === saved.id)
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = {
          ...saved,
          slide_count: prev[idx].slide_count,
          first_slide_thumbnail: prev[idx].first_slide_thumbnail,
        }
        return updated
      }
      return [...prev, saved]
    })
  }

  async function handleSlidesSaved(setId: string) {
    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const res = await fetch('/api/template-sets', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const d = await res.json()
      const refreshed = (d.templateSets ?? []).find((s: TemplateSet) => s.id === setId)
      if (refreshed) {
        setTemplateSets((prev) => prev.map((s) => s.id === setId ? refreshed : s))
      }
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Template Sets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create curated slide collections for specific presentation types.
          </p>
        </div>
        <Button onClick={() => { setEditTarget(null); setDialogOpen(true) }}>
          <Plus className="mr-2 h-4 w-4" />
          New template set
        </Button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-lg border">
              <Skeleton className="aspect-video w-full" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-8 w-full mt-2" />
              </div>
            </div>
          ))}
        </div>
      ) : templateSets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <LayoutTemplate className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No template sets yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create your first template set to give employees a head start.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => { setEditTarget(null); setDialogOpen(true) }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New template set
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templateSets.map((set) => (
            <TemplateSetCard
              key={set.id}
              templateSet={set}
              onManageSlides={setManagingSet}
              onEdit={(s) => { setEditTarget(s); setDialogOpen(true) }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <TemplateSetDialog
        open={dialogOpen}
        editTarget={editTarget}
        onClose={() => setDialogOpen(false)}
        onSaved={handleSaved}
      />

      {/* Manage slides dialog */}
      <ManageTemplateSlidesDialog
        templateSet={managingSet}
        allSlides={allSlides}
        onClose={() => setManagingSet(null)}
        onSaved={handleSlidesSaved}
      />
    </>
  )
}
