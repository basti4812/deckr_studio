'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
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
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentUser } from '@/hooks/use-current-user'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { GroupCard } from '@/components/admin/group-card'
import { ManageSlidesDialog } from '@/components/admin/manage-slides-dialog'
import type { SlideGroup } from '@/components/admin/manage-slides-dialog'
import type { Slide } from '@/components/slides/slide-card'

interface Membership {
  id: string
  slide_id: string
  group_id: string
  position: number
}

export default function BoardConfigPage() {
  const { loading: userLoading } = useCurrentUser()
  const [groups, setGroups] = useState<SlideGroup[]>([])
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [allSlides, setAllSlides] = useState<Slide[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [managingGroup, setManagingGroup] = useState<SlideGroup | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // -------------------------------------------------------------------------
  // Fetch data
  // -------------------------------------------------------------------------

  const fetchAll = useCallback(async () => {
    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const token = session.access_token

    const [groupsRes, slidesRes] = await Promise.all([
      fetch('/api/groups', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/slides', { headers: { Authorization: `Bearer ${token}` } }),
    ])

    if (groupsRes.ok) {
      const d = await groupsRes.json()
      setGroups(d.groups ?? [])
      setMemberships(d.memberships ?? [])
    }
    if (slidesRes.ok) {
      const d = await slidesRes.json()
      setAllSlides(d.slides ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { if (!userLoading) fetchAll() }, [userLoading, fetchAll])

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  async function getToken() {
    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  function slideCountForGroup(groupId: string) {
    return memberships.filter((m) => m.group_id === groupId).length
  }

  function slidesForGroup(groupId: string): Slide[] {
    const memberSlideIds = memberships
      .filter((m) => m.group_id === groupId)
      .sort((a, b) => a.position - b.position)
      .map((m) => m.slide_id)
    return memberSlideIds.flatMap((id) => allSlides.filter((s) => s.id === id))
  }

  function ungroupedSlides(): Slide[] {
    const assignedIds = new Set(memberships.map((m) => m.slide_id))
    return allSlides.filter((s) => !assignedIds.has(s.id))
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async function handleCreateGroup() {
    setCreating(true)
    const token = await getToken()
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'New Group' }),
    })
    if (res.ok) {
      const d = await res.json()
      setGroups((prev) => [...prev, d.group])
    }
    setCreating(false)
  }

  async function handleRename(id: string, name: string) {
    const token = await getToken()
    const res = await fetch(`/api/groups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      const d = await res.json()
      setGroups((prev) => prev.map((g) => (g.id === id ? d.group : g)))
    }
  }

  async function handleDelete(id: string) {
    const token = await getToken()
    const res = await fetch(`/api/groups/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      setGroups((prev) => prev.filter((g) => g.id !== id))
      setMemberships((prev) => prev.filter((m) => m.group_id !== id))
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = groups.findIndex((g) => g.id === active.id)
    const newIndex = groups.findIndex((g) => g.id === over.id)
    const reordered = arrayMove(groups, oldIndex, newIndex).map((g, i) => ({ ...g, position: i }))
    setGroups(reordered)

    const token = await getToken()
    await fetch('/api/groups/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ groups: reordered.map((g) => ({ id: g.id, position: g.position })) }),
    })
  }

  function handleManageSaved(groupId: string, newOrder: string[], added: string[], removed: string[]) {
    setMemberships((prev) => {
      // Remove the removed ones
      const filtered = prev.filter(
        (m) => !(m.group_id === groupId && removed.includes(m.slide_id))
      )
      // Add new memberships (temporary IDs)
      const newMemberships: Membership[] = added.map((slideId, i) => ({
        id: `tmp-${slideId}`,
        slide_id: slideId,
        group_id: groupId,
        position: filtered.filter((m) => m.group_id === groupId).length + i,
      }))
      const combined = [...filtered, ...newMemberships]
      // Reorder within group
      const reordered = combined.map((m) => {
        if (m.group_id !== groupId) return m
        const idx = newOrder.indexOf(m.slide_id)
        return { ...m, position: idx >= 0 ? idx : m.position }
      })
      return reordered
    })
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Board Layout</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize slides into named sections. This layout is shown to all users on the board.
          </p>
        </div>
        <Button onClick={handleCreateGroup} disabled={creating}>
          <Plus className="mr-2 h-4 w-4" />
          Create group
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm font-medium text-muted-foreground">No groups yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create a group to organize your slides into named sections on the board.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={handleCreateGroup} disabled={creating}>
            <Plus className="mr-2 h-4 w-4" />
            Create group
          </Button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={groups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {groups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  slideCount={slideCountForGroup(group.id)}
                  onRename={handleRename}
                  onDelete={handleDelete}
                  onManageSlides={setManagingGroup}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <ManageSlidesDialog
        group={managingGroup}
        groupSlides={managingGroup ? slidesForGroup(managingGroup.id) : []}
        ungroupedSlides={ungroupedSlides()}
        onClose={() => setManagingGroup(null)}
        onSaved={handleManageSaved}
      />
    </>
  )
}
