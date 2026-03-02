'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Monitor, Share2, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useCanvas } from '@/hooks/use-canvas'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { CARD_WIDTH } from '@/components/board/canvas-slide-card'
import { GroupSection } from '@/components/board/group-section'
import { ZoomControls } from '@/components/board/zoom-controls'
import { TrayPanel, type TrayItem } from '@/components/board/tray-panel'
import { EditFieldsDialog } from '@/components/board/edit-fields-dialog'
import { FillWarningDialog } from '@/components/board/fill-warning-dialog'
import { ExportProgressDialog } from '@/components/board/export-progress-dialog'
import { PresentationMode, type PresentationSlide } from '@/components/board/presentation-mode'
import { SharePanel, type ShareRecord, type SearchUser } from '@/components/projects/share-panel'
import { SearchFilterBar } from '@/components/board/search-filter-bar'
import { FilterPanel, type ActiveFilters } from '@/components/board/filter-panel'
import { checkFillStatus, type UnfilledField } from '@/lib/fill-check'
import type { Slide } from '@/components/slides/slide-card'

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const COLS = 5
const CARD_HEIGHT = 185
const GAP = 24
const PADDING = 48
const SECTION_HEADER = 36 + 12 // header + margin-bottom
const BETWEEN_GROUPS = 40

function calcGroupHeight(slideCount: number) {
  if (slideCount === 0) return SECTION_HEADER + 60 // empty state
  const rows = Math.ceil(slideCount / COLS)
  return SECTION_HEADER + rows * CARD_HEIGHT + (rows - 1) * GAP
}

function calcWorldSize(sections: { slides: Slide[] }[]) {
  const totalH = sections.reduce((acc, s, i) => {
    return acc + calcGroupHeight(s.slides.length) + (i < sections.length - 1 ? BETWEEN_GROUPS : 0)
  }, 0)
  const w = Math.max(COLS * CARD_WIDTH + (COLS - 1) * GAP + PADDING * 2, 1500)
  const h = Math.max(totalH + PADDING * 2, 1200)
  return { w, h }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SlideGroup {
  id: string
  name: string
  position: number
}

interface Membership {
  slide_id: string
  group_id: string
  position: number
}

interface Project {
  id: string
  name: string
  owner_id: string
  owner_name?: string
  slide_order: TrayItem[]
  text_edits: Record<string, Record<string, string>>
  updated_at: string
  userPermission?: 'owner' | 'view' | 'edit'
}

// ---------------------------------------------------------------------------
// Board page
// ---------------------------------------------------------------------------

export default function BoardPage() {
  return (
    <Suspense>
      <BoardPageInner />
    </Suspense>
  )
}

function BoardPageInner() {
  const router = useRouter()
  const { loading: userLoading, isAdmin, userId, displayName } = useCurrentUser()
  const searchParams = useSearchParams()
  const projectId = searchParams.get('project')

  const [slides, setSlides] = useState<Slide[]>([])
  const [groups, setGroups] = useState<SlideGroup[]>([])
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [loading, setLoading] = useState(true)

  // Project / tray state
  const [project, setProject] = useState<Project | null>(null)
  const [trayItems, setTrayItems] = useState<TrayItem[]>([])
  const [textEdits, setTextEdits] = useState<Record<string, Record<string, string>>>({})
  const [trayLoading, setTrayLoading] = useState(false)
  const [trayCollapsed, setTrayCollapsed] = useState(false)
  const [deprecatedError, setDeprecatedError] = useState('')
  const [editingInstance, setEditingInstance] = useState<string | null>(null)
  const [fillWarning, setFillWarning] = useState<{ issues: UnfilledField[]; proceed: () => void; proceedLabel: string } | null>(null)
  const [exportState, setExportState] = useState<{ open: boolean; error: string | null } | null>(null)
  const [presentationMode, setPresentationMode] = useState(false)

  // Share panel state
  const [sharePanelOpen, setSharePanelOpen] = useState(false)
  const [shares, setShares] = useState<ShareRecord[]>([])

  // Search + filter state
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({ groups: [], tags: [], statuses: [] })

  // Derived permission state
  const isProjectOwner = project ? project.owner_id === userId : true
  const userPermission = project?.userPermission ?? (isProjectOwner ? 'owner' : 'view')
  const canEdit = userPermission === 'owner' || userPermission === 'edit'

  const containerRef = useRef<HTMLDivElement>(null)
  const canvas = useCanvas(0.5)

  // Auto-save debounce
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trayItemsRef = useRef<TrayItem[]>([])
  const textEditsRef = useRef<Record<string, Record<string, string>>>({})

  // Tracks which export type to retry when the export dialog "Try again" is clicked
  const lastExportTypeRef = useRef<'pptx' | 'pdf'>('pptx')

  // -------------------------------------------------------------------------
  // Fetch slides + groups
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (userLoading) return

    async function load() {
      const supabase = createBrowserSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const token = session.access_token

      const [slidesRes, groupsRes] = await Promise.all([
        fetch('/api/slides', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        fetch('/api/groups', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      ])

      if (slidesRes?.ok) {
        const d = await slidesRes.json()
        setSlides(d.slides ?? [])
      }
      if (groupsRes?.ok) {
        const d = await groupsRes.json()
        setGroups(d.groups ?? [])
        setMemberships(d.memberships ?? [])
      }
      setLoading(false)
    }

    load()
  }, [userLoading])

  // -------------------------------------------------------------------------
  // Fetch project when ?project= param is set
  // -------------------------------------------------------------------------

  const loadProject = useCallback(async (showLoading = true) => {
    if (!projectId) return
    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { if (showLoading) setTrayLoading(false); return }

    if (showLoading) setTrayLoading(true)
    const res = await fetch(`/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const d = await res.json()
      if (d.project.status === 'archived') {
        router.replace('/projects')
        return
      }
      setProject(d.project)
      const items: TrayItem[] = Array.isArray(d.project.slide_order) ? d.project.slide_order : []
      const edits: Record<string, Record<string, string>> =
        d.project.text_edits && typeof d.project.text_edits === 'object' ? d.project.text_edits : {}
      setTrayItems(items)
      setTextEdits(edits)
      trayItemsRef.current = items
      textEditsRef.current = edits
    }
    if (showLoading) setTrayLoading(false)
  }, [projectId])

  useEffect(() => {
    if (!projectId || userLoading) return
    setTrayItems([])
    setTextEdits({})
    setProject(null)
    loadProject(true)
  }, [projectId, userLoading, loadProject])

  // Re-fetch project on tab focus + periodic poll to pick up permission changes
  useEffect(() => {
    if (!projectId) return
    function handleVisibility() {
      if (document.visibilityState === 'visible') loadProject(false)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadProject(false)
    }, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      clearInterval(interval)
    }
  }, [projectId, loadProject])

  // -------------------------------------------------------------------------
  // Search + filter effects
  // -------------------------------------------------------------------------

  // Restore filter state from URL on mount
  useEffect(() => {
    const q = searchParams.get('q') ?? ''
    const tagParam = searchParams.get('tags')
    const statusParam = searchParams.get('statuses')
    const groupParam = searchParams.get('groups')
    if (q) { setSearchInput(q); setDebouncedQuery(q) }
    setActiveFilters({
      tags: tagParam ? tagParam.split('|').filter(Boolean) : [],
      statuses: statusParam ? statusParam.split('|').filter(Boolean) : [],
      groups: groupParam ? groupParam.split('|').filter(Boolean) : [],
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // mount only

  // Debounce search input → debouncedQuery
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 200)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Sync filter state to URL params
  useEffect(() => {
    const current = new URLSearchParams(window.location.search)
    if (debouncedQuery) current.set('q', debouncedQuery); else current.delete('q')
    if (activeFilters.tags.length) current.set('tags', activeFilters.tags.join('|')); else current.delete('tags')
    if (activeFilters.statuses.length) current.set('statuses', activeFilters.statuses.join('|')); else current.delete('statuses')
    if (activeFilters.groups.length) current.set('groups', activeFilters.groups.join('|')); else current.delete('groups')
    window.history.replaceState(null, '', `?${current.toString()}`)
  }, [debouncedQuery, activeFilters])

  // -------------------------------------------------------------------------
  // Auto-save tray
  // -------------------------------------------------------------------------

  async function saveTray(
    items: TrayItem[],
    edits: Record<string, Record<string, string>>
  ) {
    if (!projectId) return
    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ slide_order: items, text_edits: edits }),
    })
  }

  function scheduleSave(
    items: TrayItem[],
    edits: Record<string, Record<string, string>>
  ) {
    trayItemsRef.current = items
    textEditsRef.current = edits
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTray(trayItemsRef.current, textEditsRef.current)
    }, 500)
  }

  // -------------------------------------------------------------------------
  // Tray actions
  // -------------------------------------------------------------------------

  function addToTray(slide: Slide) {
    if (!projectId) return
    if (slide.status === 'deprecated') {
      setDeprecatedError(`"${slide.title}" is deprecated and cannot be added to projects.`)
      setTimeout(() => setDeprecatedError(''), 4000)
      return
    }
    setDeprecatedError('')
    const newItem: TrayItem = { id: crypto.randomUUID(), slide_id: slide.id }
    setTrayItems((prev) => {
      const updated = [...prev, newItem]
      scheduleSave(updated, textEditsRef.current)
      return updated
    })
  }

  function removeFromTray(instanceId: string) {
    setTrayItems((prev) => {
      // Find item and check if mandatory
      const item = prev.find((t) => t.id === instanceId)
      if (!item) return prev
      const slide = slideMap.get(item.slide_id)
      if (slide?.status === 'mandatory') return prev
      const updated = prev.filter((t) => t.id !== instanceId)
      scheduleSave(updated, textEditsRef.current)
      return updated
    })
  }

  function reorderTray(items: TrayItem[]) {
    setTrayItems(items)
    scheduleSave(items, textEditsRef.current)
  }

  function handleFieldChange(instanceId: string, fieldId: string, value: string) {
    setTextEdits((prev) => {
      const updated = {
        ...prev,
        [instanceId]: { ...(prev[instanceId] ?? {}), [fieldId]: value },
      }
      scheduleSave(trayItemsRef.current, updated)
      return updated
    })
  }

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  async function doExport(type: 'pptx' | 'pdf' = 'pptx') {
    if (!projectId) return
    setExportState({ open: true, error: null })

    try {
      const supabase = createBrowserSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setExportState({ open: true, error: 'Not authenticated. Please refresh and try again.' })
        return
      }

      const apiUrl = type === 'pdf'
        ? `/api/projects/${projectId}/export/pdf`
        : `/api/projects/${projectId}/export`

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setExportState({
          open: true,
          error: (data as { error?: string }).error ?? 'Export failed. Please try again.',
        })
        return
      }

      // Trigger browser download
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('content-disposition')
        ?.match(/filename="([^"]+)"/)?.[1] ?? `presentation.${type}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setExportState(null)
    } catch {
      setExportState({ open: true, error: 'Export failed. Please try again.' })
    }
  }

  function handleExport() {
    if (!projectId) return
    lastExportTypeRef.current = 'pptx'
    const issues = checkFillStatus(trayItems, slideMap, textEdits)
    if (issues.length > 0) {
      setFillWarning({ issues, proceed: () => doExport('pptx'), proceedLabel: 'Export' })
    } else {
      doExport('pptx')
    }
  }

  function handlePdfExport() {
    if (!projectId) return
    lastExportTypeRef.current = 'pdf'
    const issues = checkFillStatus(trayItems, slideMap, textEdits)
    if (issues.length > 0) {
      setFillWarning({ issues, proceed: () => doExport('pdf'), proceedLabel: 'Export PDF' })
    } else {
      doExport('pdf')
    }
  }

  function handlePresent() {
    if (!projectId) return
    const issues = checkFillStatus(trayItems, slideMap, textEdits)
    if (issues.length > 0) {
      setFillWarning({ issues, proceed: () => setPresentationMode(true), proceedLabel: 'Present' })
    } else {
      setPresentationMode(true)
    }
  }

  // -------------------------------------------------------------------------
  // Share panel handlers (placeholder — will call real API after backend)
  // -------------------------------------------------------------------------

  async function fetchShares() {
    if (!projectId) return
    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`/api/projects/${projectId}/shares`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const d = await res.json()
      setShares(d.shares ?? [])
    }
  }

  function handleOpenSharePanel() {
    fetchShares()
    setSharePanelOpen(true)
  }

  async function handleAddShare(targetUserId: string, permission: 'view' | 'edit'): Promise<string | null> {
    if (!projectId) return 'No project selected'
    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return 'Not authenticated'
    const res = await fetch(`/api/projects/${projectId}/shares`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ user_id: targetUserId, permission }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      return (d as { error?: string }).error ?? 'Failed to add user'
    }
    await fetchShares()
    return null
  }

  async function handleUpdatePermission(shareId: string, permission: 'view' | 'edit') {
    if (!projectId) return
    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch(`/api/projects/${projectId}/shares/${shareId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ permission }),
    })
    await fetchShares()
  }

  async function handleRemoveShare(shareId: string) {
    if (!projectId) return
    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch(`/api/projects/${projectId}/shares/${shareId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    await fetchShares()
  }

  async function handleSearchUsers(query: string): Promise<SearchUser[]> {
    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return []
    const res = await fetch(`/api/team/search?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const d = await res.json()
      return d.users ?? []
    }
    return []
  }

  // -------------------------------------------------------------------------
  // Build sections: grouped + ungrouped
  // -------------------------------------------------------------------------

  function buildSections(): { name: string; slides: Slide[] }[] {
    const assignedIds = new Set(memberships.map((m) => m.slide_id))

    const grouped = groups.map((group) => {
      const memberSlideIds = memberships
        .filter((m) => m.group_id === group.id)
        .sort((a, b) => a.position - b.position)
        .map((m) => m.slide_id)
      const groupSlides = memberSlideIds.flatMap((id) => slides.filter((s) => s.id === id))
      return { name: group.name, slides: groupSlides }
    })

    const ungrouped = slides.filter((s) => !assignedIds.has(s.id))
    if (ungrouped.length > 0 || groups.length === 0) {
      grouped.push({ name: 'Ungrouped', slides: ungrouped })
    }

    return grouped
  }

  // Slide lookup map for tray
  const slideMap = new Map(slides.map((s) => [s.id, s]))

  // Slides in tray order for presentation mode
  const presentationSlides: PresentationSlide[] = trayItems.flatMap((item) => {
    const slide = slideMap.get(item.slide_id)
    if (!slide) return []
    return [{ thumbnail_url: slide.thumbnail_url, title: slide.title }]
  })

  // -------------------------------------------------------------------------
  // Fit to screen once loaded
  // -------------------------------------------------------------------------

  const didFit = useRef(false)
  useEffect(() => {
    if (loading || didFit.current || !containerRef.current) return
    didFit.current = true
    const sections = buildSections()
    const { w, h } = calcWorldSize(sections)
    const rect = containerRef.current.getBoundingClientRect()
    canvas.fitToScreen(w, h, rect.width, rect.height)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const handleFit = useCallback(() => {
    if (!containerRef.current) return
    const sections = buildSections()
    const { w, h } = calcWorldSize(sections)
    const rect = containerRef.current.getBoundingClientRect()
    canvas.fitToScreen(w, h, rect.width, rect.height)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides, groups, memberships, canvas])

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const sections = buildSections()

  // --- Search + filter ---
  const isFiltering = debouncedQuery.length > 0 || activeFilters.groups.length > 0 || activeFilters.tags.length > 0 || activeFilters.statuses.length > 0

  const filteredSections = sections.map((section) => {
    if (activeFilters.groups.length > 0 && !activeFilters.groups.includes(section.name)) {
      return { ...section, slides: [] as Slide[] }
    }
    const filteredSlides = section.slides.filter((slide) => {
      if (debouncedQuery) {
        const q = debouncedQuery.toLowerCase()
        if (!slide.title.toLowerCase().includes(q) && !(slide.tags ?? []).some((t) => t.toLowerCase().includes(q))) return false
      }
      if (activeFilters.tags.length > 0 && !(slide.tags ?? []).some((t) => activeFilters.tags.includes(t))) return false
      if (activeFilters.statuses.length > 0 && !activeFilters.statuses.includes(slide.status)) return false
      return true
    })
    return { ...section, slides: filteredSlides }
  })

  const displaySections = isFiltering ? filteredSections.filter((s) => s.slides.length > 0) : sections
  const totalCount = slides.length
  const resultCount = filteredSections.reduce((acc, s) => acc + s.slides.length, 0)
  const filterCount = activeFilters.groups.length + activeFilters.tags.length + activeFilters.statuses.length
  const allTags = Array.from(new Set(slides.flatMap((s) => s.tags ?? []))).sort()
  const allGroupNames = sections.map((s) => s.name)

  const { w: worldW, h: worldH } = calcWorldSize(isFiltering ? displaySections : sections)

  // Resolve the slide being edited (for EditFieldsDialog)
  const editingSlide = editingInstance
    ? slideMap.get(trayItems.find((t) => t.id === editingInstance)?.slide_id ?? '')
    : undefined

  // Compute Y positions for each display section
  const sectionYs: number[] = []
  let currentY = PADDING
  for (let i = 0; i < displaySections.length; i++) {
    sectionYs.push(currentY)
    currentY += calcGroupHeight(displaySections[i].slides.length)
    if (i < displaySections.length - 1) currentY += BETWEEN_GROUPS
  }

  return (
    <>
      {/* Mobile guard */}
      <div className="flex flex-col items-center justify-center gap-4 p-8 md:hidden">
        <Monitor className="h-12 w-12 text-muted-foreground" />
        <p className="text-center text-sm text-muted-foreground max-w-xs">
          The board canvas requires a desktop browser. Please open deckr on a larger screen.
        </p>
      </div>

      {/* Full-bleed canvas + tray (desktop only) */}
      <div className="hidden md:flex flex-1 min-h-0 -m-6">
        {/* Canvas area */}
        <div
          ref={containerRef}
          className="relative flex-1 min-h-0 overflow-hidden cursor-grab active:cursor-grabbing"
          style={{
            background: 'radial-gradient(circle, #d0d0d0 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            backgroundColor: '#f0f0f0',
          }}
          onWheel={canvas.onWheel}
          onPointerDown={canvas.onPointerDown}
          onPointerMove={canvas.onPointerMove}
          onPointerUp={canvas.onPointerUp}
          onPointerLeave={canvas.onPointerUp}
        >
          {/* Canvas world */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: worldW,
              height: worldH,
              transform: `translate(${canvas.panX}px, ${canvas.panY}px) scale(${canvas.zoom})`,
              transformOrigin: '0 0',
              willChange: 'transform',
            }}
          >
            {loading ? (
              <div style={{ padding: PADDING, display: 'flex', flexDirection: 'column', gap: 40 }}>
                {Array.from({ length: 2 }).map((_, gi) => (
                  <div key={gi}>
                    <Skeleton className="mb-3 h-5 w-40 rounded" />
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, ${CARD_WIDTH}px)`, gap: GAP }}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} style={{ width: CARD_WIDTH, height: CARD_HEIGHT }} className="rounded-lg" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : slides.length === 0 ? (
              <div
                style={{ width: worldW, height: worldH }}
                className="flex flex-col items-center justify-center gap-4"
              >
                <p className="text-sm font-medium text-muted-foreground">No slides in the library yet.</p>
                {isAdmin && (
                  <Button variant="outline" size="sm" asChild data-no-pan>
                    <Link href="/admin/slides">Upload slides</Link>
                  </Button>
                )}
              </div>
            ) : isFiltering && resultCount === 0 ? (
              <div
                style={{ width: worldW, height: worldH }}
                className="flex flex-col items-center justify-center gap-2"
              >
                <p className="text-sm font-medium text-muted-foreground">No slides match your search.</p>
                <p className="text-xs text-muted-foreground">Try different keywords or clear the filters.</p>
              </div>
            ) : (
              displaySections.map((section, i) => (
                <GroupSection
                  key={section.name + i}
                  name={section.name}
                  slides={section.slides}
                  x={PADDING}
                  y={sectionYs[i]}
                  onAddToTray={projectId && canEdit ? addToTray : undefined}
                />
              ))
            )}
          </div>

          {/* Search + filter bar */}
          {!loading && slides.length > 0 && (
            <div data-no-pan className="absolute top-4 left-4 z-10">
              <SearchFilterBar
                searchQuery={searchInput}
                onSearchChange={setSearchInput}
                filterCount={filterCount}
                filterOpen={filterOpen}
                onToggleFilter={() => setFilterOpen((o) => !o)}
                resultCount={resultCount}
                totalCount={totalCount}
                onClearAll={() => {
                  setSearchInput('')
                  setDebouncedQuery('')
                  setActiveFilters({ groups: [], tags: [], statuses: [] })
                  setFilterOpen(false)
                }}
              />
              {filterOpen && (
                <div className="mt-2">
                  <FilterPanel
                    groups={allGroupNames}
                    tags={allTags}
                    filters={activeFilters}
                    onFiltersChange={setActiveFilters}
                    onClearFilters={() => setActiveFilters({ groups: [], tags: [], statuses: [] })}
                  />
                </div>
              )}
            </div>
          )}

          {/* Top-right toolbar: share button + shared badge */}
          {projectId && (
            <div data-no-pan className="absolute top-4 right-4 z-10 flex items-center gap-2">
              {!isProjectOwner && (
                <Badge variant="outline" className="gap-1 bg-background/80 backdrop-blur-sm">
                  <Users className="h-3 w-3" />
                  Shared
                </Badge>
              )}
              {isProjectOwner && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 bg-background/80 backdrop-blur-sm"
                  onClick={handleOpenSharePanel}
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Share
                </Button>
              )}
            </div>
          )}

          {/* Zoom controls */}
          <div data-no-pan className="absolute bottom-4 right-4 z-10">
            <ZoomControls
              zoom={canvas.zoom}
              onZoomIn={canvas.zoomIn}
              onZoomOut={canvas.zoomOut}
              onFit={handleFit}
            />
          </div>
        </div>

        {/* Tray panel */}
        <TrayPanel
          projectId={projectId}
          projectName={project?.name ?? ''}
          projectUpdatedAt={project?.updated_at}
          trayItems={trayItems}
          slideMap={slideMap}
          textEdits={textEdits}
          loading={trayLoading}
          collapsed={trayCollapsed}
          deprecatedError={deprecatedError}
          onCollapse={() => setTrayCollapsed((c) => !c)}
          onReorder={canEdit ? reorderTray : undefined}
          onRemove={canEdit ? removeFromTray : undefined}
          onEditFields={projectId && canEdit ? (instanceId) => setEditingInstance(instanceId) : undefined}
          onExport={projectId && canEdit ? handleExport : undefined}
          onPdfExport={projectId && canEdit ? handlePdfExport : undefined}
          onPresent={projectId ? handlePresent : undefined}
        />
      </div>

      {/* Edit fields dialog */}
      {editingInstance && editingSlide && (
        <EditFieldsDialog
          open
          onClose={() => setEditingInstance(null)}
          slide={editingSlide}
          instanceId={editingInstance}
          values={textEdits[editingInstance] ?? {}}
          onChange={(fieldId, value) => handleFieldChange(editingInstance, fieldId, value)}
        />
      )}

      {/* Export progress dialog */}
      {exportState && (
        <ExportProgressDialog
          open={exportState.open}
          onClose={() => setExportState(null)}
          onRetry={() => doExport(lastExportTypeRef.current)}
          error={exportState.error}
        />
      )}

      {/* Fill warning dialog */}
      {fillWarning && (
        <FillWarningDialog
          open
          onClose={() => setFillWarning(null)}
          issues={fillWarning.issues}
          proceedLabel={fillWarning.proceedLabel}
          onProceedAnyway={() => {
            fillWarning.proceed()
            setFillWarning(null)
          }}
          onGoToField={(instanceId) => setEditingInstance(instanceId)}
        />
      )}

      {/* Presentation mode — full-screen overlay */}
      {presentationMode && (
        <PresentationMode
          slides={presentationSlides}
          onExit={() => setPresentationMode(false)}
        />
      )}

      {/* Share panel (owner only) */}
      {isProjectOwner && (
        <SharePanel
          open={sharePanelOpen}
          onClose={() => setSharePanelOpen(false)}
          projectName={project?.name ?? ''}
          ownerName={displayName ?? 'You'}
          shares={shares}
          onAddShare={handleAddShare}
          onUpdatePermission={handleUpdatePermission}
          onRemoveShare={handleRemoveShare}
          onSearchUsers={handleSearchUsers}
        />
      )}
    </>
  )
}
