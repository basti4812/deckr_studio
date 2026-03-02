'use client'

import { useEffect, useState } from 'react'
import { GripVertical, LayoutTemplate, Plus, X } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import type { Slide } from '@/components/slides/slide-card'
import type { TemplateSet } from './template-set-card'

interface SlideInSet {
  id: string          // membership id
  slide_id: string
  position: number
  slide: Slide
}

interface Props {
  templateSet: TemplateSet | null
  allSlides: Slide[]
  onClose: () => void
  onSaved: (setId: string) => void
}

// ---------------------------------------------------------------------------
// Sortable row
// ---------------------------------------------------------------------------

function SortableSlideRow({ slide, onRemove }: { slide: Slide; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: slide.id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5"
    >
      <button {...attributes} {...listeners} className="cursor-grab touch-none text-muted-foreground hover:text-foreground">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex h-8 w-14 shrink-0 items-center justify-center rounded bg-muted">
        {slide.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slide.thumbnail_url} alt="" className="h-full w-full rounded object-cover" />
        ) : (
          <LayoutTemplate className="h-4 w-4 text-muted-foreground/50" />
        )}
      </div>
      <span className="flex-1 truncate text-sm">{slide.title}</span>
      {slide.status === 'deprecated' && (
        <Badge variant="secondary" className="shrink-0 text-[10px] text-orange-600 dark:text-orange-400">
          Deprecated
        </Badge>
      )}
      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" onClick={onRemove}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export function ManageTemplateSlidesDialog({ templateSet, allSlides, onClose, onSaved }: Props) {
  const [ordered, setOrdered] = useState<Slide[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Load current slides in set when dialog opens
  useEffect(() => {
    if (!templateSet) { setOrdered([]); return }

    async function loadSlides() {
      if (!templateSet) return
      setLoading(true)
      try {
        const supabase = createBrowserSupabaseClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const res = await fetch(`/api/template-sets/${templateSet.id}/slides`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        // data.slides = array of { id, slide_id, position, slide }
        const slidesInSet: Slide[] = (data.slides as SlideInSet[])
          .filter((m) => m.slide !== null)
          .map((m) => m.slide)
        setOrdered(slidesInSet)
      } finally {
        setLoading(false)
      }
    }

    loadSlides()
  }, [templateSet])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setOrdered((items) => {
        const oldIndex = items.findIndex((s) => s.id === active.id)
        const newIndex = items.findIndex((s) => s.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  function addSlide(slide: Slide) {
    if (ordered.some((s) => s.id === slide.id)) return
    setOrdered((prev) => [...prev, slide])
  }

  function removeSlide(slideId: string) {
    setOrdered((prev) => prev.filter((s) => s.id !== slideId))
  }

  async function handleSave() {
    if (!templateSet) return
    setSaving(true)
    try {
      const supabase = createBrowserSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const token = session.access_token

      // Fetch current membership state from server
      const currentRes = await fetch(`/api/template-sets/${templateSet.id}/slides`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const currentData = await currentRes.json()
      const currentSlideIds = new Set<string>(
        (currentData.slides as SlideInSet[]).map((m) => m.slide_id)
      )

      const newSlideIds = new Set(ordered.map((s) => s.id))

      const toAdd = ordered.filter((s) => !currentSlideIds.has(s.id))
      const toRemove = [...currentSlideIds].filter((id) => !newSlideIds.has(id))

      // Add new slides (sequentially to avoid position collisions)
      for (const slide of toAdd) {
        await fetch(`/api/template-sets/${templateSet.id}/slides`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ slideId: slide.id }),
        })
      }

      // Remove slides
      await Promise.all(
        toRemove.map((slideId) =>
          fetch(`/api/template-sets/${templateSet.id}/slides/${slideId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          })
        )
      )

      // Reorder remaining slides
      await fetch(`/api/template-sets/${templateSet.id}/slides/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          memberships: ordered.map((s, i) => ({ slideId: s.id, position: i })),
        }),
      })

      onSaved(templateSet.id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const orderedIds = new Set(ordered.map((s) => s.id))
  const available = allSlides.filter((s) => !orderedIds.has(s.id))

  return (
    <Dialog open={!!templateSet} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage slides — {templateSet?.name}</DialogTitle>
          <DialogDescription>
            Drag to reorder slides, or add slides from the library.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">
            Loading…
          </div>
        ) : (
          <div className="flex flex-1 gap-4 overflow-hidden min-h-0 py-2">
            {/* Left: slides in set */}
            <div className="flex flex-1 flex-col gap-2 overflow-hidden">
              <p className="text-xs font-medium text-muted-foreground">
                In this set ({ordered.length})
              </p>
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                {ordered.length === 0 && (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    No slides yet. Add some from the right.
                  </p>
                )}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={ordered.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                    {ordered.map((slide) => (
                      <SortableSlideRow key={slide.id} slide={slide} onRemove={() => removeSlide(slide.id)} />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            </div>

            {/* Divider */}
            <div className="w-px bg-border" />

            {/* Right: available slides from library */}
            <div className="flex flex-1 flex-col gap-2 overflow-hidden">
              <p className="text-xs font-medium text-muted-foreground">
                Library ({available.length})
              </p>
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                {available.length === 0 && (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    All library slides are already in this set.
                  </p>
                )}
                {available.map((slide) => (
                  <div key={slide.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 hover:bg-muted/50">
                    <div className="flex h-8 w-14 shrink-0 items-center justify-center rounded bg-muted">
                      {slide.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={slide.thumbnail_url} alt="" className="h-full w-full rounded object-cover" />
                      ) : (
                        <LayoutTemplate className="h-4 w-4 text-muted-foreground/50" />
                      )}
                    </div>
                    <span className="flex-1 truncate text-sm">{slide.title}</span>
                    {slide.status === 'deprecated' && (
                      <Badge variant="secondary" className="shrink-0 text-[10px] text-orange-600 dark:text-orange-400">
                        Deprecated
                      </Badge>
                    )}
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => addSlide(slide)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
