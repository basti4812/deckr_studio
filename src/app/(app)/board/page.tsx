'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Monitor } from 'lucide-react'
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
  slide_order: TrayItem[]
  text_edits: Record<string, Record<string, string>>
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
  const { loading: userLoading, isAdmin } = useCurrentUser()
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

  useEffect(() => {
    if (!projectId || userLoading) return
    setTrayLoading(true)
    setTrayItems([])
    setTextEdits({})
    setProject(null)

    async function loadProject() {
      const supabase = createBrowserSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setTrayLoading(false); return }

      const res = await fetch(`/api/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const d = await res.json()
        setProject(d.project)
        const items: TrayItem[] = Array.isArray(d.project.slide_order) ? d.project.slide_order : []
        const edits: Record<string, Record<string, string>> =
          d.project.text_edits && typeof d.project.text_edits === 'object' ? d.project.text_edits : {}
        setTrayItems(items)
        setTextEdits(edits)
        trayItemsRef.current = items
        textEditsRef.current = edits
      }
      setTrayLoading(false)
    }

    loadProject()
  }, [projectId, userLoading])

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
  const { w: worldW, h: worldH } = calcWorldSize(sections)

  // Resolve the slide being edited (for EditFieldsDialog)
  const editingSlide = editingInstance
    ? slideMap.get(trayItems.find((t) => t.id === editingInstance)?.slide_id ?? '')
    : undefined

  // Compute Y positions for each section
  const sectionYs: number[] = []
  let currentY = PADDING
  for (let i = 0; i < sections.length; i++) {
    sectionYs.push(currentY)
    currentY += calcGroupHeight(sections[i].slides.length)
    if (i < sections.length - 1) currentY += BETWEEN_GROUPS
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
            ) : (
              sections.map((section, i) => (
                <GroupSection
                  key={section.name + i}
                  name={section.name}
                  slides={section.slides}
                  x={PADDING}
                  y={sectionYs[i]}
                  onAddToTray={projectId ? addToTray : undefined}
                />
              ))
            )}
          </div>

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
          trayItems={trayItems}
          slideMap={slideMap}
          textEdits={textEdits}
          loading={trayLoading}
          collapsed={trayCollapsed}
          deprecatedError={deprecatedError}
          onCollapse={() => setTrayCollapsed((c) => !c)}
          onReorder={reorderTray}
          onRemove={removeFromTray}
          onEditFields={projectId ? (instanceId) => setEditingInstance(instanceId) : undefined}
          onExport={projectId ? handleExport : undefined}
          onPdfExport={projectId ? handlePdfExport : undefined}
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
    </>
  )
}
