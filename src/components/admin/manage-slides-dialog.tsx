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

export interface SlideGroup {
  id: string
  tenant_id: string
  name: string
  position: number
}

interface Props {
  group: SlideGroup | null
  groupSlides: Slide[]
  ungroupedSlides: Slide[]
  onClose: () => void
  onSaved: (groupId: string, newOrder: string[], added: string[], removed: string[]) => void
}

// ---------------------------------------------------------------------------
// Sortable row for slides in the group
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
      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" onClick={onRemove}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export function ManageSlidesDialog({ group, groupSlides, ungroupedSlides, onClose, onSaved }: Props) {
  const [ordered, setOrdered] = useState<Slide[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (group) setOrdered(groupSlides)
  }, [group, groupSlides])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

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
    if (!group) return
    setSaving(true)
    try {
      const supabase = createBrowserSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const token = session.access_token

      const originalIds = new Set(groupSlides.map((s) => s.id))
      const newIds = new Set(ordered.map((s) => s.id))

      const added = ordered.filter((s) => !originalIds.has(s.id)).map((s) => s.id)
      const removed = groupSlides.filter((s) => !newIds.has(s.id)).map((s) => s.id)

      // Add new slides
      await Promise.all(
        added.map((slideId) =>
          fetch(`/api/groups/${group.id}/memberships`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ slideId }),
          })
        )
      )

      // Remove slides
      await Promise.all(
        removed.map((slideId) =>
          fetch(`/api/groups/${group.id}/memberships/${slideId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          })
        )
      )

      // Reorder
      await fetch(`/api/groups/${group.id}/memberships/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          memberships: ordered.map((s, i) => ({ slideId: s.id, position: i })),
        }),
      })

      onSaved(group.id, ordered.map((s) => s.id), added, removed)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  // Available to add = ungrouped + not already in this group's ordered list
  const orderedIds = new Set(ordered.map((s) => s.id))
  const available = ungroupedSlides.filter((s) => !orderedIds.has(s.id))

  return (
    <Dialog open={!!group} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage slides — {group?.name}</DialogTitle>
          <DialogDescription>
            Drag to reorder slides within this group, or add slides from the available list.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 gap-4 overflow-hidden min-h-0 py-2">
          {/* Left: slides in group */}
          <div className="flex flex-1 flex-col gap-2 overflow-hidden">
            <p className="text-xs font-medium text-muted-foreground">
              In this group ({ordered.length})
            </p>
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {ordered.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  No slides. Add some from the right.
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

          {/* Right: available to add */}
          <div className="flex flex-1 flex-col gap-2 overflow-hidden">
            <p className="text-xs font-medium text-muted-foreground">
              Available ({available.length})
            </p>
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {available.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  No ungrouped slides available.
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
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => addSlide(slide)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
