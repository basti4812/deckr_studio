'use client'

import { Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Briefcase,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  Eye,
  Lock,
  Maximize2,
  Minimize2,
  Plus,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { ResetLayoutDialog } from '@/components/board/reset-layout-dialog'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useCanvas } from '@/hooks/use-canvas'
import { useCanvasDrag, type DragState } from '@/hooks/use-canvas-drag'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { CARD_WIDTH, THUMB_HEIGHT } from '@/components/board/canvas-slide-card'
import {
  computeGroupPositions,
  calcGroupHeight as autoCalcGroupHeight,
  CARD_HEIGHT,
  COLS as AUTO_COLS,
  GAP as AUTO_GAP,
  PADDING as AUTO_PADDING,
  BETWEEN_GROUPS as AUTO_BETWEEN_GROUPS,
  SECTION_HEADER as AUTO_SECTION_HEADER,
} from '@/lib/auto-layout'
import { GroupSection } from '@/components/board/group-section'
import { ZoomControls } from '@/components/board/zoom-controls'
import { TrayPanel, type TrayItem } from '@/components/board/tray-panel'
import { EditFieldsDialog } from '@/components/board/edit-fields-dialog'
import { FillWarningDialog } from '@/components/board/fill-warning-dialog'
import { ExportProgressDialog } from '@/components/board/export-progress-dialog'
import { PrepareDialog } from '@/components/board/prepare-dialog'
import { SlidePreviewDialog } from '@/components/board/slide-preview-dialog'
import { PresentationMode, type PresentationSlide } from '@/components/board/presentation-mode'
import { SharePanel, type ShareRecord, type SearchUser } from '@/components/projects/share-panel'
import { CrmDetailsDialog } from '@/components/projects/crm-details-dialog'
import { CommentPanel } from '@/components/board/comment-panel'
import { NotePanel } from '@/components/board/note-panel'
import {
  UploadPersonalSlideDialog,
  type PersonalSlideRecord,
} from '@/components/board/upload-personal-slide-dialog'
import { SearchFilterBar } from '@/components/board/search-filter-bar'
import { FilterPanel, type ActiveFilters } from '@/components/board/filter-panel'
import { VersionHistoryPanel, type ProjectVersion } from '@/components/board/version-history-panel'
import { SaveVersionDialog } from '@/components/board/save-version-dialog'
import { RestoreConfirmDialog } from '@/components/board/restore-confirm-dialog'
import {
  checkFillStatus,
  checkMissingMandatory,
  type MissingMandatorySlide,
  type UnfilledField,
} from '@/lib/fill-check'
import type { Slide } from '@/components/slides/slide-card'
import { MobileProjectView } from '@/components/board/mobile-project-view'
import { useIsMobile } from '@/hooks/use-mobile'
import { useBoardFullscreen } from '@/providers/fullscreen-provider'

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const COLS = AUTO_COLS
const GAP = AUTO_GAP
const PADDING = AUTO_PADDING
const BETWEEN_GROUPS = AUTO_BETWEEN_GROUPS

function calcGroupHeight(slideCount: number, collapsed?: boolean) {
  return autoCalcGroupHeight(slideCount, collapsed)
}

/**
 * Compute the canvas world size from positioned sections.
 * Uses the bounding box of all groups instead of vertical stacking.
 */
function calcWorldSize(
  sections: { slides: { length: number } | Slide[]; x: number; y: number; id?: string }[],
  collapsedGroups?: Set<string>
) {
  const groupWidth = COLS * CARD_WIDTH + (COLS - 1) * GAP
  let maxRight = 0
  let maxBottom = 0

  for (const s of sections) {
    const count = Array.isArray(s.slides) ? s.slides.length : 0
    const isCollapsed = s.id ? collapsedGroups?.has(s.id) : false
    const right = s.x + groupWidth
    const bottom = s.y + calcGroupHeight(count, isCollapsed)
    if (right > maxRight) maxRight = right
    if (bottom > maxBottom) maxBottom = bottom
  }

  const w = Math.max(maxRight + PADDING, 1500)
  const h = Math.max(maxBottom + PADDING, 1200)
  return { w, h }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SlideGroup {
  id: string
  name: string
  position: number
  x: number | null
  y: number | null
}

interface Membership {
  slide_id: string
  group_id: string
  position: number
  x: number | null
  y: number | null
}

interface Project {
  id: string
  name: string
  owner_id: string
  owner_name?: string
  status: 'active' | 'archived'
  slide_order: TrayItem[]
  text_edits: Record<string, Record<string, string>>
  updated_at: string
  userPermission?: 'owner' | 'view' | 'edit'
  crm_customer_name?: string | null
  crm_company_name?: string | null
  crm_deal_id?: string | null
}

interface PersonalGroup {
  id: string
  name: string
  position: number
  x?: number
  y?: number
}

interface SlideOverride {
  groupId: string
  position: number
  annotation?: string
  x?: number
  y?: number
}

interface PersonalLayout {
  personalGroups: PersonalGroup[]
  slideOverrides: Record<string, SlideOverride>
  groupPositions?: Record<string, { x: number; y: number }>
}

interface BoardSection {
  id: string
  name: string
  slides: Slide[]
  isPersonal?: boolean
  annotations?: Record<string, string>
  x: number
  y: number
}

// ---------------------------------------------------------------------------
// Board data reducer — groups tightly-coupled data state
// ---------------------------------------------------------------------------

interface BoardDataState {
  slides: Slide[]
  groups: SlideGroup[]
  memberships: Membership[]
  loading: boolean
}

type BoardDataAction =
  | { type: 'SET_BOARD_DATA'; slides: Slide[]; groups: SlideGroup[]; memberships: Membership[] }
  | { type: 'UPDATE_GROUP'; groupId: string; update: Partial<SlideGroup> }

const initialBoardData: BoardDataState = {
  slides: [],
  groups: [],
  memberships: [],
  loading: true,
}

function boardDataReducer(state: BoardDataState, action: BoardDataAction): BoardDataState {
  switch (action.type) {
    case 'SET_BOARD_DATA':
      return {
        ...state,
        slides: action.slides,
        groups: action.groups,
        memberships: action.memberships,
        loading: false,
      }
    case 'UPDATE_GROUP':
      return {
        ...state,
        groups: state.groups.map((g) => (g.id === action.groupId ? { ...g, ...action.update } : g)),
      }
    default:
      return state
  }
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
  const { t } = useTranslation()
  const router = useRouter()
  const { loading: userLoading, isAdmin, userId, displayName } = useCurrentUser()
  const searchParams = useSearchParams()
  const projectId = searchParams.get('project')
  const isMobile = useIsMobile()
  const { isFullscreen: isBoardFullscreen, toggleFullscreen: toggleBoardFullscreen } =
    useBoardFullscreen()

  const [boardData, dispatchBoard] = useReducer(boardDataReducer, initialBoardData)
  const { slides, groups, memberships, loading } = boardData

  // Project / tray state
  const [project, setProject] = useState<Project | null>(null)
  const [trayItems, setTrayItems] = useState<TrayItem[]>([])
  const [textEdits, setTextEdits] = useState<Record<string, Record<string, string>>>({})
  const [trayLoading, setTrayLoading] = useState(false)
  const [trayCollapsed, setTrayCollapsed] = useState(false)
  const [deprecatedError, setDeprecatedError] = useState('')
  const [editingInstance, setEditingInstance] = useState<string | null>(null)
  const [previewSlideId, setPreviewSlideId] = useState<string | null>(null)
  const [fillWarning, setFillWarning] = useState<{
    issues: UnfilledField[]
    proceed: () => void
    proceedLabel: string
  } | null>(null)
  const [mandatoryWarning, setMandatoryWarning] = useState<{
    missing: MissingMandatorySlide[]
    proceed: () => void
    proceedLabel: string
  } | null>(null)
  const [exportState, setExportState] = useState<{
    open: boolean
    error: string | null
    step: number
    format: 'pptx' | 'pdf'
  } | null>(null)
  const [presentationMode, setPresentationMode] = useState(false)

  // Archived slides warning dialog state (BUG-6 / PROJ-46)
  const [archivedWarning, setArchivedWarning] = useState<{
    proceed: () => void
  } | null>(null)

  // Prepare dialog state (PROJ-35: text injection for presentation/share/PDF)
  const [prepareState, setPrepareState] = useState<{
    open: boolean
    format: 'presentation' | 'share' | 'pdf'
    onReady: (previews: Record<string, string>) => void
  } | null>(null)

  // Share panel state
  const [sharePanelTab, setSharePanelTab] = useState<'people' | 'links' | null>(null)
  const [shares, setShares] = useState<ShareRecord[]>([])

  // Comment panel state (PROJ-30)
  const [commentPanelOpen, setCommentPanelOpen] = useState(false)
  const [commentSlideId, setCommentSlideId] = useState<string | null>(null)
  const [commentInstanceIndex, setCommentInstanceIndex] = useState(0)
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})

  // Note panel state (PROJ-31)
  const [notePanelOpen, setNotePanelOpen] = useState(false)
  const [noteSlideId, setNoteSlideId] = useState<string | null>(null)
  const [notesExist, setNotesExist] = useState<Record<string, boolean>>({})

  // Personal slides state (PROJ-32)
  const [personalSlides, setPersonalSlides] = useState<PersonalSlideRecord[]>([])
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [fileDragOver, setFileDragOver] = useState(false)

  // Personal layout state (PROJ-20)
  const [personalLayout, setPersonalLayout] = useState<PersonalLayout | null>(null)
  const [hasPersonalLayout, setHasPersonalLayout] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [editingAnnotation, setEditingAnnotation] = useState<{
    slideId: string
    value: string
  } | null>(null)
  const layoutSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const layoutRef = useRef<PersonalLayout | null>(null)

  // Version history state (PROJ-38)
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false)
  const [saveVersionOpen, setSaveVersionOpen] = useState(false)
  const [restoreVersion, setRestoreVersion] = useState<ProjectVersion | null>(null)

  // CRM details state (PROJ-28)
  const [crmDialogOpen, setCrmDialogOpen] = useState(false)

  // Search + filter state
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({
    groups: [],
    tags: [],
    statuses: [],
  })

  // Collapsed groups state (persisted to localStorage)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set<string>()
    try {
      const stored = localStorage.getItem(`onslide-collapsed-groups-${projectId ?? 'board'}`)
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set<string>()
    } catch {
      return new Set<string>()
    }
  })

  const toggleGroupCollapse = useCallback(
    (groupId: string) => {
      setCollapsedGroups((prev) => {
        const next = new Set(prev)
        if (next.has(groupId)) next.delete(groupId)
        else next.add(groupId)
        try {
          localStorage.setItem(
            `onslide-collapsed-groups-${projectId ?? 'board'}`,
            JSON.stringify([...next])
          )
        } catch {
          /* quota exceeded */
        }
        return next
      })
    },
    [projectId]
  )

  const collapseAll = useCallback(() => {
    const sections = buildSections()
    const allIds = new Set(sections.map((s) => s.id))
    setCollapsedGroups(allIds)
    try {
      localStorage.setItem(
        `onslide-collapsed-groups-${projectId ?? 'board'}`,
        JSON.stringify([...allIds])
      )
    } catch {
      /* quota exceeded */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, slides, groups, memberships, personalLayout])

  const expandAll = useCallback(() => {
    setCollapsedGroups(new Set())
    try {
      localStorage.removeItem(`onslide-collapsed-groups-${projectId ?? 'board'}`)
    } catch {
      /* ignore */
    }
  }, [projectId])

  // Derived permission state
  const isProjectOwner = project ? project.owner_id === userId : true
  const userPermission = project?.userPermission ?? (isProjectOwner ? 'owner' : 'view')
  const canEdit = userPermission === 'owner' || userPermission === 'edit'

  const containerRef = useRef<HTMLDivElement>(null)
  const canvas = useCanvas(0.5, containerRef)

  // Auto-save debounce
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trayItemsRef = useRef<TrayItem[]>([])
  const textEditsRef = useRef<Record<string, Record<string, string>>>({})

  // Tracks which export type to retry when the export dialog "Try again" is clicked
  const lastExportTypeRef = useRef<'pptx' | 'pdf'>('pptx')

  // Preview URLs: instance-level rendered thumbnails with text edits applied
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})
  const renderTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // -------------------------------------------------------------------------
  // Fetch slides + groups
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (userLoading) return

    async function load() {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return
      const token = session.access_token

      const [slidesRes, groupsRes, layoutRes] = await Promise.all([
        fetch('/api/slides?include_archived=true', {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
        fetch('/api/groups', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        fetch('/api/board/layout', { headers: { Authorization: `Bearer ${token}` } }).catch(
          () => null
        ),
      ])

      let newSlides: Slide[] = []
      let newGroups: SlideGroup[] = []
      let newMemberships: Membership[] = []

      if (slidesRes?.ok) {
        const d = await slidesRes.json()
        newSlides = d.slides ?? []
      }
      if (groupsRes?.ok) {
        const d = await groupsRes.json()
        newGroups = d.groups ?? []
        newMemberships = d.memberships ?? []
      }
      if (layoutRes?.ok) {
        const d = await layoutRes.json()
        if (d.layout) {
          setPersonalLayout(d.layout)
          setHasPersonalLayout(true)
          layoutRef.current = d.layout
        }
      }
      dispatchBoard({
        type: 'SET_BOARD_DATA',
        slides: newSlides,
        groups: newGroups,
        memberships: newMemberships,
      })
    }

    load()
  }, [userLoading])

  // -------------------------------------------------------------------------
  // Fetch project when ?project= param is set
  // -------------------------------------------------------------------------

  const loadProject = useCallback(
    async (showLoading = true) => {
      if (!projectId) return
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        if (showLoading) setTrayLoading(false)
        return
      }

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
        const edits: Record<string, Record<string, string>> = d.project.text_edits &&
        typeof d.project.text_edits === 'object'
          ? d.project.text_edits
          : {}
        setTrayItems(items)
        setTextEdits(edits)
        trayItemsRef.current = items
        textEditsRef.current = edits
      }
      if (showLoading) setTrayLoading(false)
    },
    [projectId]
  )

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
    if (q) {
      setSearchInput(q)
      setDebouncedQuery(q)
    }
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
    if (debouncedQuery) current.set('q', debouncedQuery)
    else current.delete('q')
    if (activeFilters.tags.length) current.set('tags', activeFilters.tags.join('|'))
    else current.delete('tags')
    if (activeFilters.statuses.length) current.set('statuses', activeFilters.statuses.join('|'))
    else current.delete('statuses')
    if (activeFilters.groups.length) current.set('groups', activeFilters.groups.join('|'))
    else current.delete('groups')
    window.history.replaceState(null, '', `?${current.toString()}`)
  }, [debouncedQuery, activeFilters])

  // -------------------------------------------------------------------------
  // Auto-save tray
  // -------------------------------------------------------------------------

  async function saveTray(items: TrayItem[], edits: Record<string, Record<string, string>>) {
    if (!projectId) return
    const supabase = createBrowserSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
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

  function scheduleSave(items: TrayItem[], edits: Record<string, Record<string, string>>) {
    trayItemsRef.current = items
    textEditsRef.current = edits
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTray(trayItemsRef.current, textEditsRef.current)
    }, 500)
  }

  // -------------------------------------------------------------------------
  // Personal layout save (PROJ-20)
  // -------------------------------------------------------------------------

  async function saveLayout(layout: PersonalLayout) {
    const supabase = createBrowserSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    await fetch('/api/board/layout', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(layout),
    })
  }

  function scheduleLayoutSave(layout: PersonalLayout) {
    layoutRef.current = layout
    if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current)
    layoutSaveTimer.current = setTimeout(() => {
      if (layoutRef.current) saveLayout(layoutRef.current)
    }, 1000)
  }

  function updateLayout(updater: (prev: PersonalLayout) => PersonalLayout) {
    setPersonalLayout((prev) => {
      const base: PersonalLayout = prev ?? { personalGroups: [], slideOverrides: {} }
      const next = updater(base)
      setHasPersonalLayout(true)
      scheduleLayoutSave(next)
      return next
    })
  }

  // Personal group CRUD
  function addPersonalGroup() {
    const trimmed = newGroupName.trim()
    if (!trimmed) {
      toast.error(t('board.group_name_required'))
      return
    }

    // Place the new group below all existing sections
    const currentSections = buildSections()
    let maxBottom = PADDING
    for (const s of currentSections) {
      const bottom = s.y + calcGroupHeight(s.slides.length) + BETWEEN_GROUPS
      if (bottom > maxBottom) maxBottom = bottom
    }

    const group: PersonalGroup = {
      id: crypto.randomUUID(),
      name: trimmed,
      position: (personalLayout?.personalGroups.length ?? 0) + groups.length,
      x: PADDING,
      y: maxBottom,
    }
    updateLayout((prev) => ({
      ...prev,
      personalGroups: [...prev.personalGroups, group],
    }))
    setNewGroupName('')
    setAddingGroup(false)
  }

  function renamePersonalGroup(groupId: string, name: string) {
    updateLayout((prev) => ({
      ...prev,
      personalGroups: prev.personalGroups.map((g) => (g.id === groupId ? { ...g, name } : g)),
    }))
  }

  function deletePersonalGroup(groupId: string) {
    updateLayout((prev) => {
      // Move slides in this group back to ungrouped (remove their overrides)
      const newOverrides = { ...prev.slideOverrides }
      for (const [slideId, override] of Object.entries(newOverrides)) {
        if (override.groupId === groupId) delete newOverrides[slideId]
      }
      return {
        ...prev,
        personalGroups: prev.personalGroups.filter((g) => g.id !== groupId),
        slideOverrides: newOverrides,
      }
    })
  }

  // Move a slide to a different group
  function moveSlideToGroup(slideId: string, targetGroupId: string) {
    updateLayout((prev) => {
      // Count existing slides in the target group to determine position
      const existingInGroup = Object.values(prev.slideOverrides).filter(
        (o) => o.groupId === targetGroupId
      ).length
      return {
        ...prev,
        slideOverrides: {
          ...prev.slideOverrides,
          [slideId]: {
            groupId: targetGroupId,
            position: existingInGroup,
            annotation: prev.slideOverrides[slideId]?.annotation,
          },
        },
      }
    })
  }

  // Remove a slide's personal override (return to admin position)
  function resetSlidePosition(slideId: string) {
    updateLayout((prev) => {
      const newOverrides = { ...prev.slideOverrides }
      delete newOverrides[slideId]
      return { ...prev, slideOverrides: newOverrides }
    })
  }

  // Set/clear annotation on a slide
  function setAnnotation(slideId: string, text: string) {
    updateLayout((prev) => {
      const existing = prev.slideOverrides[slideId]
      if (!existing && !text) return prev
      if (existing) {
        const updated = { ...existing, annotation: text || undefined }
        return {
          ...prev,
          slideOverrides: { ...prev.slideOverrides, [slideId]: updated },
        }
      }
      // No existing override — we only set an annotation, keep slide in admin position
      // Find admin group for this slide
      const membership = memberships.find((m) => m.slide_id === slideId)
      return {
        ...prev,
        slideOverrides: {
          ...prev.slideOverrides,
          [slideId]: {
            groupId: membership?.group_id ?? '__ungrouped__',
            position: membership?.position ?? 0,
            annotation: text || undefined,
          },
        },
      }
    })
    setEditingAnnotation(null)
  }

  // Reset layout to admin default
  async function handleResetLayout() {
    setResetting(true)
    try {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return
      await fetch('/api/board/layout', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      setPersonalLayout(null)
      setHasPersonalLayout(false)
      layoutRef.current = null
    } finally {
      setResetting(false)
      setResetDialogOpen(false)
    }
  }

  // -------------------------------------------------------------------------
  // Tray actions
  // -------------------------------------------------------------------------

  function addToTray(slide: Slide) {
    if (!projectId) return
    if (slide.status === 'deprecated') {
      setDeprecatedError(t('board.deprecated_cannot_add', { title: slide.title }))
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
    const item = trayItems.find((t) => t.id === instanceId)
    if (!item) return

    // Personal slides: delete via API then remove
    if (item.is_personal) {
      removePersonalSlideFromTray(instanceId)
      return
    }

    // Library slides: allow removal (including mandatory — checked on export)
    setTrayItems((prev) => {
      const updated = prev.filter((t) => t.id !== instanceId)
      scheduleSave(updated, textEditsRef.current)
      return updated
    })
  }

  function reorderTray(items: TrayItem[]) {
    setTrayItems(items)
    scheduleSave(items, textEditsRef.current)
  }

  /** Save all field values at once and render preview */
  async function handleSaveFields(
    instanceId: string,
    fieldValues: Record<string, string>
  ): Promise<string | undefined> {
    // Update state
    const updated = { ...textEditsRef.current, [instanceId]: fieldValues }
    setTextEdits(updated)
    textEditsRef.current = updated
    scheduleSave(trayItemsRef.current, updated)

    // Render preview immediately (no debounce)
    const trayItem = trayItemsRef.current.find((t) => t.id === instanceId)
    if (!trayItem || trayItem.is_personal || !projectId) return undefined

    // Clear any pending debounced render
    if (renderTimers.current[instanceId]) {
      clearTimeout(renderTimers.current[instanceId])
    }

    try {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return undefined

      const res = await fetch('/api/slides/render-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          slideId: trayItem.slide_id,
          projectId,
          instanceId,
          edits: fieldValues,
        }),
      })

      if (!res.ok) return undefined
      const data = await res.json()
      if (data.previewUrl) {
        setPreviewUrls((prev) => ({ ...prev, [instanceId]: data.previewUrl }))
        return data.previewUrl as string
      }
    } catch {
      // Silently ignore render failures
    }
    return undefined
  }

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  async function doExport(type: 'pptx' | 'pdf' = 'pptx') {
    if (!projectId) return
    setExportState({ open: true, error: null, step: 1, format: type })

    try {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        setExportState({
          open: true,
          error: t(
            'export_dialog.not_authenticated',
            'Not authenticated. Please refresh and try again.'
          ),
          step: 1,
          format: type,
        })
        return
      }

      setExportState({ open: true, error: null, step: 2, format: type })

      const apiUrl =
        type === 'pdf'
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
          error:
            (data as { error?: string }).error ??
            t('export_dialog.export_failed_message', 'Export failed. Please try again.'),
          step: 2,
          format: type,
        })
        return
      }

      setExportState({ open: true, error: null, step: 3, format: type })

      // Trigger browser download
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download =
        res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ??
        `presentation.${type}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setExportState(null)
    } catch {
      setExportState({
        open: true,
        error: t('export_dialog.export_failed_message', 'Export failed. Please try again.'),
        step: 2,
        format: type,
      })
    }
  }

  function showExportPreview(type: 'pptx' | 'pdf') {
    setExportState({ open: true, error: null, step: 0, format: type })
  }

  /**
   * Run mandatory-slide + fill-status checks before an action.
   * Shows mandatory warning first, then fill warning, then calls `action`.
   */
  function guardExport(action: () => void, proceedLabel: string) {
    const missing = checkMissingMandatory(trayItems, slideMap)

    // BUG-6: Check for archived slides and show warning before export
    const runArchivedCheck = (nextAction: () => void) => {
      const hasArchived = trayItems.some((item) => {
        if (item.is_personal) return false
        const slide = slideMap.get(item.slide_id)
        return slide?.archived_at != null
      })
      if (hasArchived) {
        setArchivedWarning({ proceed: nextAction })
      } else {
        nextAction()
      }
    }

    const runFillCheck = () => {
      const issues = checkFillStatus(trayItems, slideMap, textEdits)
      if (issues.length > 0) {
        setFillWarning({ issues, proceed: action, proceedLabel })
      } else {
        runArchivedCheck(action)
      }
    }
    if (missing.length > 0) {
      setMandatoryWarning({ missing, proceed: runFillCheck, proceedLabel })
    } else {
      runFillCheck()
    }
  }

  function handleExport() {
    if (!projectId) return
    lastExportTypeRef.current = 'pptx'
    guardExport(() => showExportPreview('pptx'), t('board.export'))
  }

  function handlePdfExport() {
    if (!projectId) return
    lastExportTypeRef.current = 'pdf'
    const startPdf = () => {
      if (hasAnyTextEdits()) {
        startPrepare('pdf', () => showExportPreview('pdf'))
      } else {
        showExportPreview('pdf')
      }
    }
    guardExport(startPdf, t('board.export_pdf'))
  }

  /** Check if any tray item has actual text edits that need rendering */
  function hasAnyTextEdits(): boolean {
    return trayItems.some((item) => {
      const slide = slideMap.get(item.slide_id)
      if (!slide) return false
      const fields = Array.isArray(slide.editable_fields) ? slide.editable_fields : []
      const edits = textEdits[item.id]
      if (!edits) return false
      return fields.some((f: { id: string }) => edits[f.id]?.trim())
    })
  }

  function startPrepare(
    format: 'presentation' | 'share' | 'pdf',
    onReady: (previews: Record<string, string>) => void
  ) {
    setPrepareState({ open: true, format, onReady })
  }

  function handlePrepareReady(previews: Record<string, string>) {
    // Merge rendered previews into local previewUrls state
    setPreviewUrls((prev) => ({ ...prev, ...previews }))
    const onReady = prepareState?.onReady
    setPrepareState(null)
    onReady?.(previews)
  }

  function handlePresent() {
    if (!projectId) return
    const startPresentation = () => {
      if (hasAnyTextEdits()) {
        startPrepare('presentation', () => setPresentationMode(true))
      } else {
        setPresentationMode(true)
      }
    }
    guardExport(startPresentation, t('board.present'))
  }

  // -------------------------------------------------------------------------
  // Share panel handlers (placeholder — will call real API after backend)
  // -------------------------------------------------------------------------

  async function fetchShares() {
    if (!projectId) return
    const supabase = createBrowserSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`/api/projects/${projectId}/shares`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const d = await res.json()
      setShares(d.shares ?? [])
    }
  }

  function handleOpenShareLinks() {
    fetchShares()
    setSharePanelTab('links')
  }

  function handleOpenManageAccess() {
    fetchShares()
    setSharePanelTab('people')
  }

  async function handleAddShare(
    targetUserId: string,
    permission: 'view' | 'edit'
  ): Promise<string | null> {
    if (!projectId) return 'No project selected'
    const supabase = createBrowserSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return 'Not authenticated'
    const res = await fetch(`/api/projects/${projectId}/shares`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
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
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    await fetch(`/api/projects/${projectId}/shares/${shareId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ permission }),
    })
    await fetchShares()
  }

  async function handleRemoveShare(shareId: string) {
    if (!projectId) return
    const supabase = createBrowserSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    await fetch(`/api/projects/${projectId}/shares/${shareId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    await fetchShares()
  }

  async function handleSearchUsers(query: string): Promise<SearchUser[]> {
    const supabase = createBrowserSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
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
  // Comment panel (PROJ-30)
  // -------------------------------------------------------------------------

  const fetchCommentCounts = useCallback(async () => {
    if (!projectId) return
    const supabase = createBrowserSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`/api/projects/${projectId}/comments/counts`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const d = await res.json()
      setCommentCounts(d.counts ?? {})
    }
  }, [projectId])

  // Fetch comment counts when project loads
  useEffect(() => {
    if (projectId && !userLoading) {
      fetchCommentCounts()
    }
  }, [projectId, userLoading, fetchCommentCounts])

  function handleOpenCommentPanel(instanceId: string, slideId: string, instanceIndex: number) {
    setCommentSlideId(slideId)
    setCommentInstanceIndex(instanceIndex)
    setCommentPanelOpen(true)
  }

  function handleCommentCountChange(slideId: string, delta: number) {
    setCommentCounts((prev) => ({
      ...prev,
      [slideId]: Math.max(0, (prev[slideId] ?? 0) + delta),
    }))
  }

  // -------------------------------------------------------------------------
  // Note panel (PROJ-31)
  // -------------------------------------------------------------------------

  const fetchNotesExist = useCallback(async () => {
    if (!projectId) return
    const supabase = createBrowserSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`/api/projects/${projectId}/notes/has`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const d = await res.json()
      setNotesExist(d.slides ?? {})
    }
  }, [projectId])

  // Fetch notes existence when project loads
  useEffect(() => {
    if (projectId && !userLoading) {
      fetchNotesExist()
    }
  }, [projectId, userLoading, fetchNotesExist])

  function handleOpenNotePanel(_instanceId: string, slideId: string) {
    setNoteSlideId(slideId)
    setNotePanelOpen(true)
  }

  function handleNoteChange(slideId: string, hasNote: boolean) {
    setNotesExist((prev) => ({ ...prev, [slideId]: hasNote }))
  }

  // -------------------------------------------------------------------------
  // Personal slides (PROJ-32)
  // -------------------------------------------------------------------------

  const fetchPersonalSlides = useCallback(async () => {
    if (!projectId) return
    const supabase = createBrowserSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`/api/projects/${projectId}/personal-slides`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const d = await res.json()
      setPersonalSlides(d.slides ?? [])
    }
  }, [projectId])

  // Fetch personal slides when project loads
  useEffect(() => {
    if (projectId && !userLoading) {
      fetchPersonalSlides()
    }
  }, [projectId, userLoading, fetchPersonalSlides])

  function handlePersonalSlideUploaded(slide: PersonalSlideRecord) {
    setPersonalSlides((prev) => [...prev, slide])
    // Add to tray at the end
    const newItem: TrayItem = {
      id: crypto.randomUUID(),
      slide_id: '',
      is_personal: true,
      personal_slide_id: slide.id,
    }
    setTrayItems((prev) => {
      const updated = [...prev, newItem]
      scheduleSave(updated, textEditsRef.current)
      return updated
    })
  }

  async function removePersonalSlideFromTray(instanceId: string) {
    const item = trayItems.find((t) => t.id === instanceId)
    if (!item?.is_personal || !item.personal_slide_id) return

    // Delete via API (removes storage + DB record)
    const supabase = createBrowserSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session) {
      await fetch(`/api/projects/${projectId}/personal-slides/${item.personal_slide_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
    }

    // Remove from local state
    setPersonalSlides((prev) => prev.filter((s) => s.id !== item.personal_slide_id))
    setTrayItems((prev) => {
      const updated = prev.filter((t) => t.id !== instanceId)
      scheduleSave(updated, textEditsRef.current)
      return updated
    })
  }

  // -------------------------------------------------------------------------
  // Version history (PROJ-38)
  // -------------------------------------------------------------------------

  function handleRestoreRequest(version: ProjectVersion) {
    setRestoreVersion(version)
  }

  async function handleConfirmRestore(versionId: string) {
    if (!projectId) return
    const supabase = createBrowserSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return

    const res = await fetch(`/api/projects/${projectId}/versions/${versionId}/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })

    if (res.ok) {
      // Re-fetch the project to get the restored state
      await loadProject(false)
      setVersionHistoryOpen(false)
    } else {
      const d = await res.json().catch(() => ({}))
      const msg = (d as { error?: string }).error ?? 'Failed to restore version.'
      alert(msg)
    }
  }

  function handleVersionSaved() {
    // Close and reopen the panel to trigger a fresh fetch
    setVersionHistoryOpen(false)
    setTimeout(() => setVersionHistoryOpen(true), 100)
  }

  // -------------------------------------------------------------------------
  // Build sections: grouped + ungrouped, with personal layout merge
  // -------------------------------------------------------------------------

  function buildSections(): BoardSection[] {
    const assignedIds = new Set(memberships.map((m) => m.slide_id))

    // Build admin sections (without positions yet)
    const adminSections: (Omit<BoardSection, 'x' | 'y'> & {
      x?: number
      y?: number
      dbX: number | null
      dbY: number | null
    })[] = groups.map((group) => {
      const memberSlideIds = memberships
        .filter((m) => m.group_id === group.id)
        .sort((a, b) => a.position - b.position)
        .map((m) => m.slide_id)
      const groupSlides = memberSlideIds.flatMap((id) => slides.filter((s) => s.id === id))
      return { id: group.id, name: group.name, slides: groupSlides, dbX: group.x, dbY: group.y }
    })

    const ungrouped = slides.filter((s) => !assignedIds.has(s.id))

    // If no personal layout, return admin layout with positions
    if (!personalLayout) {
      const withUngrouped = [...adminSections]
      if (ungrouped.length > 0 || groups.length === 0) {
        withUngrouped.push({
          id: '__ungrouped__',
          name: 'Ungrouped',
          slides: ungrouped,
          dbX: null,
          dbY: null,
        })
      }
      return assignPositions(withUngrouped)
    }

    // Merge personal layout overrides
    const overrides = personalLayout.slideOverrides
    const overriddenSlideIds = new Set(Object.keys(overrides))

    // Remove overridden slides from admin sections
    const mergedAdminSections = adminSections.map((section) => ({
      ...section,
      slides: section.slides.filter((s) => !overriddenSlideIds.has(s.id)),
    }))

    // Build personal group sections (with personal layout positions)
    const personalGroupMap = new Map(personalLayout.personalGroups.map((pg) => [pg.id, pg]))
    const personalSections = personalLayout.personalGroups
      .sort((a, b) => a.position - b.position)
      .map((pg) => ({
        id: pg.id,
        name: pg.name,
        slides: [] as Slide[],
        isPersonal: true as const,
        dbX: pg.x ?? null,
        dbY: pg.y ?? null,
      }))

    // Place overridden slides into the correct sections
    const slideById = new Map(slides.map((s) => [s.id, s]))
    const allSections = [...mergedAdminSections, ...personalSections]
    const sectionMap = new Map(allSections.map((s) => [s.id, s]))

    for (const [slideId, override] of Object.entries(overrides)) {
      const slide = slideById.get(slideId)
      if (!slide) continue // admin deleted this slide
      const target = sectionMap.get(override.groupId)
      if (target) {
        target.slides.push(slide)
      }
    }

    // Sort only overridden slides within each section by position
    const sortedSectionIds = new Set<string>()
    for (const [, override] of Object.entries(overrides)) {
      if (sortedSectionIds.has(override.groupId)) continue
      const target = sectionMap.get(override.groupId)
      if (!target) continue
      sortedSectionIds.add(override.groupId)

      const adminSlides = target.slides.filter((s) => !overrides[s.id])
      const overriddenSlides = target.slides
        .filter((s) => overrides[s.id])
        .sort((a, b) => (overrides[a.id]?.position ?? 0) - (overrides[b.id]?.position ?? 0))
      target.slides = [...adminSlides, ...overriddenSlides]
    }

    // Collect annotations for rendering
    const annotations: Record<string, string> = {}
    for (const [slideId, override] of Object.entries(overrides)) {
      if (override.annotation) annotations[slideId] = override.annotation
    }

    // Add ungrouped
    const allPlacedIds = new Set(allSections.flatMap((s) => s.slides.map((sl) => sl.id)))
    const remainingUngrouped = ungrouped.filter((s) => !allPlacedIds.has(s.id))
    const orphanedOverrides = Object.entries(overrides)
      .filter(([, o]) => !sectionMap.has(o.groupId))
      .map(([slideId]) => slideById.get(slideId))
      .filter(Boolean) as Slide[]

    const allUngrouped = [...remainingUngrouped, ...orphanedOverrides]
    if (allUngrouped.length > 0 || (groups.length === 0 && personalSections.length === 0)) {
      allSections.push({
        id: '__ungrouped__',
        name: 'Ungrouped',
        slides: allUngrouped,
        dbX: null,
        dbY: null,
      })
    }

    // Apply personal position overrides
    const groupPosOverrides = personalLayout?.groupPositions ?? {}
    const positioned = allSections.map((s) => {
      // Check groupPositions for admin group overrides
      const posOverride = groupPosOverrides[s.id]
      if (posOverride) {
        return { ...s, dbX: posOverride.x, dbY: posOverride.y }
      }
      // Personal groups get their x/y from personalGroupMap
      const pg = personalGroupMap.get(s.id)
      if (pg) {
        return { ...s, dbX: pg.x ?? s.dbX, dbY: pg.y ?? s.dbY }
      }
      return s
    })

    return assignPositions(positioned).map((s) => ({ ...s, annotations }))
  }

  /**
   * Assign x/y positions to sections. Uses stored positions when available,
   * falls back to auto-layout for sections without positions.
   */
  function assignPositions(
    sections: (Omit<BoardSection, 'x' | 'y'> & { dbX: number | null; dbY: number | null })[]
  ): BoardSection[] {
    // Check if any section has stored positions
    const hasAnyPosition = sections.some((s) => s.dbX !== null && s.dbY !== null)

    if (!hasAnyPosition) {
      // No custom positions at all — use full auto-layout
      const autoPositions = computeGroupPositions(
        sections.map((s) => ({ id: s.id, slideCount: s.slides.length }))
      )
      const posMap = new Map(autoPositions.map((p) => [p.id, p]))
      return sections.map((s) => {
        const pos = posMap.get(s.id) ?? { x: PADDING, y: PADDING }
        const { dbX, dbY, ...rest } = s
        return { ...rest, x: pos.x, y: pos.y }
      })
    }

    // Mixed: some have positions, some don't. Place unpositioned ones after the last positioned group.
    let maxBottom = 0
    for (const s of sections) {
      if (s.dbX !== null && s.dbY !== null) {
        const bottom = s.dbY + calcGroupHeight(s.slides.length) + BETWEEN_GROUPS
        if (bottom > maxBottom) maxBottom = bottom
      }
    }

    let nextY = maxBottom || PADDING
    return sections.map((s) => {
      const { dbX, dbY, ...rest } = s
      if (dbX !== null && dbY !== null) {
        return { ...rest, x: dbX, y: dbY }
      }
      const pos = { x: PADDING, y: nextY }
      nextY += calcGroupHeight(s.slides.length) + BETWEEN_GROUPS
      return { ...rest, x: pos.x, y: pos.y }
    })
  }

  // Slide lookup map for tray
  const slideMap = useMemo(() => new Map(slides.map((s) => [s.id, s])), [slides])

  // Personal slides lookup map for tray (PROJ-32)
  const personalSlidesMap = useMemo(
    () => new Map(personalSlides.map((s) => [s.id, s])),
    [personalSlides]
  )

  // Slides in tray order for presentation mode
  const presentationSlides: PresentationSlide[] = trayItems.flatMap((item): PresentationSlide[] => {
    // Personal slides — no thumbnail in V1, show placeholder title
    if (item.is_personal && item.personal_slide_id) {
      const ps = personalSlidesMap.get(item.personal_slide_id)
      if (!ps) return []
      return [{ thumbnail_url: null, title: ps.title, hasTextEdits: false }]
    }
    const slide = slideMap.get(item.slide_id)
    if (!slide) return []
    const edits = textEdits[item.id]
    const hasTextEdits = !!edits && Object.values(edits).some((v) => v.trim() !== '')
    // Use rendered preview if available (shows text edits applied)
    const thumbnailUrl = previewUrls[item.id] ?? slide.thumbnail_url
    return [{ thumbnail_url: thumbnailUrl, title: slide.title, hasTextEdits }]
  })

  // -------------------------------------------------------------------------
  // Fit to screen once loaded
  // -------------------------------------------------------------------------

  const didFit = useRef(false)
  useEffect(() => {
    if (loading || didFit.current || !containerRef.current) return
    didFit.current = true
    const sections = buildSections()
    const { w, h } = calcWorldSize(sections, collapsedGroups)
    const rect = containerRef.current.getBoundingClientRect()
    canvas.fitToScreen(w, h, rect.width, rect.height)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const handleFit = useCallback(() => {
    if (!containerRef.current) return
    const sections = buildSections()
    const { w, h } = calcWorldSize(sections, collapsedGroups)
    const rect = containerRef.current.getBoundingClientRect()
    canvas.fitToScreen(w, h, rect.width, rect.height)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides, groups, memberships, canvas, collapsedGroups])

  // Re-fit canvas when entering/exiting board fullscreen
  useEffect(() => {
    // Small delay to let layout transition complete
    const timer = setTimeout(() => handleFit(), 100)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBoardFullscreen])

  // Keyboard shortcut: F to toggle board fullscreen (only when no input focused)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'f' || e.key === 'F') {
        if (presentationMode) return
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable)
          return
        e.preventDefault()
        toggleBoardFullscreen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleBoardFullscreen, presentationMode])

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sections = useMemo(() => buildSections(), [slides, groups, memberships, personalLayout])

  // --- Search + filter ---
  const isFiltering =
    debouncedQuery.length > 0 ||
    activeFilters.groups.length > 0 ||
    activeFilters.tags.length > 0 ||
    activeFilters.statuses.length > 0

  const filteredSections = useMemo(() => {
    if (!isFiltering) return sections

    return sections.map((section) => {
      if (activeFilters.groups.length > 0 && !activeFilters.groups.includes(section.name)) {
        return { ...section, slides: [] as Slide[] }
      }
      const filteredSlides = section.slides.filter((slide) => {
        if (debouncedQuery) {
          const q = debouncedQuery.toLowerCase()
          if (
            !slide.title.toLowerCase().includes(q) &&
            !(slide.tags ?? []).some((t) => t.toLowerCase().includes(q))
          )
            return false
        }
        if (
          activeFilters.tags.length > 0 &&
          !(slide.tags ?? []).some((t) => activeFilters.tags.includes(t))
        )
          return false
        if (activeFilters.statuses.length > 0 && !activeFilters.statuses.includes(slide.status))
          return false
        return true
      })
      return { ...section, slides: filteredSlides }
    })
  }, [sections, isFiltering, debouncedQuery, activeFilters])

  const displaySections = useMemo(
    () => (isFiltering ? filteredSections.filter((s) => s.slides.length > 0) : sections),
    [isFiltering, filteredSections, sections]
  )
  const totalCount = slides.length
  const resultCount = filteredSections.reduce((acc, s) => acc + s.slides.length, 0)
  const filterCount =
    activeFilters.groups.length + activeFilters.tags.length + activeFilters.statuses.length
  const allTags = Array.from(new Set(slides.flatMap((s) => s.tags ?? []))).sort()
  const allGroupNames = sections.map((s) => s.name)

  const { w: worldW, h: worldH } = calcWorldSize(
    isFiltering ? displaySections : sections,
    collapsedGroups
  )

  // Track container size for virtualization (resize-aware)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setContainerSize((prev) =>
        prev.w === width && prev.h === height ? prev : { w: width, h: height }
      )
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Move targets = all groups (admin + personal) for context menu
  const moveTargets = sections.map((s) => ({ id: s.id, name: s.name }))
  const overriddenSlideIds = new Set(Object.keys(personalLayout?.slideOverrides ?? {}))

  // Resolve the slide being edited (for EditFieldsDialog)
  const editingSlide = editingInstance
    ? slideMap.get(trayItems.find((t) => t.id === editingInstance)?.slide_id ?? '')
    : undefined

  // -------------------------------------------------------------------------
  // Group dragging
  // -------------------------------------------------------------------------

  const handleDragEnd = useCallback(
    async (drag: DragState) => {
      if (drag.target.type !== 'group') return

      const groupId = drag.target.id
      const section = displaySections.find((s) => s.id === groupId)
      if (!section) return

      const newX = section.x + drag.deltaX
      const newY = section.y + drag.deltaY

      // Check if this is a personal group or admin group
      const isPersonalGroup = section.isPersonal
      const isAdminGroup = groups.some((g) => g.id === groupId)

      if (isAdminGroup && isAdmin) {
        // Admin dragging an admin group: persist to DB
        const supabase = createBrowserSupabaseClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) return
        fetch(`/api/groups/${groupId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ x: newX, y: newY }),
        }).catch(() => {})

        // Update local state
        dispatchBoard({ type: 'UPDATE_GROUP', groupId, update: { x: newX, y: newY } })
      } else if (isPersonalGroup) {
        // Personal group: persist to personal layout
        updateLayout((prev) => ({
          ...prev,
          personalGroups: prev.personalGroups.map((pg) =>
            pg.id === groupId ? { ...pg, x: newX, y: newY } : pg
          ),
        }))
      } else {
        // Non-admin user dragging an admin group: store position override in personal layout
        updateLayout((prev) => ({
          ...prev,
          groupPositions: {
            ...(prev.groupPositions ?? {}),
            [groupId]: { x: newX, y: newY },
          },
        }))
      }
    },
    [displaySections, groups, isAdmin]
  )

  const canvasDrag = useCanvasDrag({
    zoom: canvas.zoom,
    panX: canvas.panX,
    panY: canvas.panY,
    onDragEnd: handleDragEnd,
  })

  // Virtualization: only render groups visible in the viewport (+ buffer)
  const VIRTUALIZATION_BUFFER = 400 // pixels in world coordinates
  const groupWidth = COLS * CARD_WIDTH + (COLS - 1) * GAP
  const draggedGroupId =
    canvasDrag.activeDrag?.target.type === 'group' ? canvasDrag.activeDrag.target.id : null
  const visibleSections = useMemo(() => {
    if (containerSize.w === 0 || displaySections.length <= 5) return displaySections
    const viewLeft = -canvas.panX / canvas.zoom - VIRTUALIZATION_BUFFER
    const viewTop = -canvas.panY / canvas.zoom - VIRTUALIZATION_BUFFER
    const viewRight = (-canvas.panX + containerSize.w) / canvas.zoom + VIRTUALIZATION_BUFFER
    const viewBottom = (-canvas.panY + containerSize.h) / canvas.zoom + VIRTUALIZATION_BUFFER

    return displaySections.filter((section) => {
      // Always keep the actively-dragged group visible
      if (section.id === draggedGroupId) return true

      const count = section.slides.length
      const isCollapsed = collapsedGroups.has(section.id)
      const sectionHeight = calcGroupHeight(count, isCollapsed)
      const sRight = section.x + groupWidth
      const sBottom = section.y + sectionHeight

      // AABB intersection test
      return (
        sRight >= viewLeft &&
        section.x <= viewRight &&
        sBottom >= viewTop &&
        section.y <= viewBottom
      )
    })
  }, [
    displaySections,
    canvas.panX,
    canvas.panY,
    canvas.zoom,
    collapsedGroups,
    containerSize,
    draggedGroupId,
  ])

  return (
    <>
      {/* Mobile project view — not mounted on desktop */}
      {isMobile && (
        <MobileProjectView
          projectId={projectId ?? ''}
          projectName={project?.name ?? ''}
          trayItems={trayItems}
          slideMap={slideMap}
          personalSlidesMap={personalSlidesMap}
          notesExist={notesExist}
          onPresent={() => setPresentationMode(true)}
          onNoteChange={(slideId, hasNote) =>
            setNotesExist((prev) => ({ ...prev, [slideId]: hasNote }))
          }
          loading={loading}
        />
      )}

      {/* Full-bleed canvas + tray (desktop only — not mounted on mobile) */}
      {!isMobile && (
        <div className={`hidden md:flex flex-1 min-h-0 ${isBoardFullscreen ? '' : '-m-6'}`}>
          {/* Canvas area */}
          <div
            ref={containerRef}
            className={`relative flex-1 min-h-0 overflow-hidden cursor-grab active:cursor-grabbing ${isBoardFullscreen ? 'rounded-lg border' : ''}`}
            style={{
              background: 'radial-gradient(circle, hsl(var(--canvas-dot)) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
              backgroundColor: 'hsl(var(--canvas-bg))',
            }}
            onPointerDown={(e) => {
              // If a drag is active, don't start panning
              if (canvasDrag.isDragging) return
              canvas.onPointerDown(e)
            }}
            onPointerMove={(e) => {
              if (canvasDrag.isDragging && containerRef.current) {
                canvasDrag.updateDrag(e, containerRef.current.getBoundingClientRect())
                return
              }
              canvas.onPointerMove(e)
            }}
            onPointerUp={() => {
              if (canvasDrag.isDragging) {
                canvasDrag.endDrag()
                return
              }
              canvas.onPointerUp()
            }}
            onPointerLeave={() => {
              if (canvasDrag.isDragging) {
                canvasDrag.endDrag()
                return
              }
              canvas.onPointerUp()
            }}
            onDragOver={(e) => {
              if (projectId && canEdit && e.dataTransfer.types.includes('Files')) {
                e.preventDefault()
                setFileDragOver(true)
              }
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return
              setFileDragOver(false)
            }}
            onDrop={(e) => {
              setFileDragOver(false)
              if (!projectId || !canEdit) return
              const file = e.dataTransfer.files[0]
              if (file?.name.endsWith('.pptx')) {
                e.preventDefault()
                setUploadDialogOpen(true)
              }
            }}
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
              }}
            >
              {loading ? (
                <div
                  style={{ padding: PADDING, display: 'flex', flexDirection: 'column', gap: 40 }}
                >
                  {Array.from({ length: 2 }).map((_, gi) => (
                    <div key={gi}>
                      <Skeleton className="mb-3 h-5 w-40 rounded" />
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: `repeat(${COLS}, ${CARD_WIDTH}px)`,
                          gap: GAP,
                        }}
                      >
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Skeleton
                            key={i}
                            style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
                            className="rounded-lg"
                          />
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
                  <p className="text-sm font-medium text-muted-foreground">
                    {t('board.no_slides_in_library')}
                  </p>
                  {isAdmin && (
                    <Button variant="outline" size="sm" asChild data-no-pan>
                      <Link href="/admin/slides">{t('admin.upload_presentations')}</Link>
                    </Button>
                  )}
                </div>
              ) : isFiltering && resultCount === 0 ? (
                <div
                  style={{ width: worldW, height: worldH }}
                  className="flex flex-col items-center justify-center gap-2"
                >
                  <p className="text-sm font-medium text-muted-foreground">
                    {t('board.no_slides_match')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('board.try_different_keywords')}
                  </p>
                </div>
              ) : (
                visibleSections.map((section) => {
                  const isDragTarget =
                    canvasDrag.activeDrag?.target.type === 'group' &&
                    canvasDrag.activeDrag.target.id === section.id
                  const dragOffset = isDragTarget
                    ? { dx: canvasDrag.activeDrag!.deltaX, dy: canvasDrag.activeDrag!.deltaY }
                    : undefined

                  return (
                    <GroupSection
                      key={section.id}
                      id={section.id}
                      name={section.name}
                      slides={section.slides}
                      x={section.x}
                      y={section.y}
                      zoom={canvas.zoom}
                      onAddToTray={projectId && canEdit ? addToTray : undefined}
                      isPersonal={section.isPersonal}
                      onRename={
                        section.isPersonal
                          ? (name) => renamePersonalGroup(section.id, name)
                          : undefined
                      }
                      onDelete={
                        section.isPersonal ? () => deletePersonalGroup(section.id) : undefined
                      }
                      annotations={section.annotations}
                      onAnnotationClick={(slideId) => {
                        const current = personalLayout?.slideOverrides[slideId]?.annotation ?? ''
                        setEditingAnnotation({ slideId, value: current })
                      }}
                      moveTargets={moveTargets}
                      onMoveToGroup={moveSlideToGroup}
                      onResetPosition={resetSlidePosition}
                      overriddenSlideIds={overriddenSlideIds}
                      dragOffset={dragOffset}
                      onGroupPointerDown={(e) => {
                        if (!containerRef.current) return
                        canvasDrag.startDrag(
                          e,
                          { type: 'group', id: section.id },
                          containerRef.current.getBoundingClientRect()
                        )
                      }}
                      isCollapsed={collapsedGroups.has(section.id)}
                      onToggleCollapse={() => toggleGroupCollapse(section.id)}
                      onPreview={(slide) => setPreviewSlideId(slide.id)}
                      onEditFields={(slide) => {
                        const inst = trayItems.find((t) => t.slide_id === slide.id)
                        if (inst) setEditingInstance(inst.id)
                      }}
                      onDoubleClick={(slide) => {
                        if (!containerRef.current) return
                        const idx = section.slides.findIndex((s) => s.id === slide.id)
                        if (idx < 0) return
                        const col = idx % AUTO_COLS
                        const row = Math.floor(idx / AUTO_COLS)
                        const slideX = section.x + col * (CARD_WIDTH + AUTO_GAP)
                        const slideY =
                          section.y + AUTO_SECTION_HEADER + row * (CARD_HEIGHT + AUTO_GAP)
                        const rect = containerRef.current.getBoundingClientRect()
                        canvas.zoomToRect(
                          slideX,
                          slideY,
                          CARD_WIDTH,
                          THUMB_HEIGHT,
                          rect.width,
                          rect.height
                        )
                      }}
                    />
                  )
                })
              )}
            </div>

            {/* Breadcrumb */}
            {!loading && projectId && !isBoardFullscreen && (
              <div
                data-no-pan
                className="absolute top-4 left-4 z-10 rounded-md bg-background/80 px-2.5 py-1.5 backdrop-blur-sm"
              >
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink asChild>
                        <Link href="/projects">{t('nav.projects', 'Presentations')}</Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage className="max-w-[200px] truncate">
                        {project?.name || t('board.project', 'Presentation')}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
            )}
            {!loading && slides.length > 0 && (
              <div
                data-no-pan
                className={`absolute left-4 z-10 ${projectId && !isBoardFullscreen ? 'top-14' : 'top-4'}`}
              >
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
                      onClearFilters={() =>
                        setActiveFilters({ groups: [], tags: [], statuses: [] })
                      }
                    />
                  </div>
                )}
              </div>
            )}

            {/* Top-right toolbar: personal layout + share */}
            <TooltipProvider delayDuration={300}>
              <div data-no-pan className="absolute top-4 right-4 z-10 flex items-center gap-1">
                {/* Board fullscreen toggle */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 bg-background/80 backdrop-blur-sm"
                      onClick={toggleBoardFullscreen}
                    >
                      {isBoardFullscreen ? (
                        <Minimize2 className="h-3.5 w-3.5" />
                      ) : (
                        <Maximize2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isBoardFullscreen
                      ? t('board.exit_fullscreen', 'Exit fullscreen (F)')
                      : t('board.enter_fullscreen', 'Fullscreen (F)')}
                  </TooltipContent>
                </Tooltip>
                {/* Collapse/Expand all groups */}
                {!loading && sections.length > 1 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 bg-background/80 backdrop-blur-sm"
                        onClick={collapsedGroups.size > 0 ? expandAll : collapseAll}
                      >
                        {collapsedGroups.size > 0 ? (
                          <ChevronsUpDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronsDownUp className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {collapsedGroups.size > 0
                        ? t('board.expand_all', 'Expand all')
                        : t('board.collapse_all', 'Collapse all')}
                    </TooltipContent>
                  </Tooltip>
                )}
                {/* Personal layout controls */}
                {hasPersonalLayout && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 bg-background/80 backdrop-blur-sm"
                        onClick={() => setResetDialogOpen(true)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('board.reset_layout')}</TooltipContent>
                  </Tooltip>
                )}
                {!addingGroup ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 bg-background/80 backdrop-blur-sm"
                        onClick={() => setAddingGroup(true)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('board.add_group')}</TooltipContent>
                  </Tooltip>
                ) : (
                  <div className="flex items-center gap-1 bg-background/80 backdrop-blur-sm rounded-md border px-1">
                    <Input
                      className="h-7 w-36 text-xs border-0 shadow-none focus-visible:ring-0"
                      placeholder={t('board.group_name_placeholder')}
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addPersonalGroup()
                        if (e.key === 'Escape') {
                          setAddingGroup(false)
                          setNewGroupName('')
                        }
                      }}
                      autoFocus
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={addPersonalGroup}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        setAddingGroup(false)
                        setNewGroupName('')
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
                {/* Version history button (PROJ-38) */}
                {projectId && canEdit && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 bg-background/80 backdrop-blur-sm"
                        onClick={() => setVersionHistoryOpen(true)}
                        aria-label={t('board.open_version_history')}
                      >
                        <Clock className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('version_history.title')}</TooltipContent>
                  </Tooltip>
                )}
                {/* Share controls */}
                {projectId && !canEdit && (
                  <Badge
                    variant="outline"
                    className="gap-1.5 bg-background/80 backdrop-blur-sm text-muted-foreground"
                  >
                    <Eye className="h-3 w-3" />
                    {t('board.view_only', 'View only')}
                  </Badge>
                )}
                {projectId && canEdit && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 bg-background/80 backdrop-blur-sm"
                          onClick={() => setCrmDialogOpen(true)}
                        >
                          <Briefcase className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('crm.button')}</TooltipContent>
                    </Tooltip>
                  </>
                )}
              </div>
            </TooltipProvider>

            {/* File drag-and-drop overlay */}
            {fileDragOver && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-lg pointer-events-none">
                <div className="flex flex-col items-center gap-2 bg-background/90 rounded-lg px-6 py-4 shadow-lg">
                  <Upload className="h-8 w-8 text-primary" />
                  <p className="text-sm font-medium text-primary">
                    {t('slides.drop_pptx_here', 'Drop .pptx file to upload')}
                  </p>
                </div>
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
            personalSlidesMap={personalSlidesMap}
            textEdits={textEdits}
            commentCounts={commentCounts}
            notesExist={notesExist}
            loading={trayLoading}
            collapsed={trayCollapsed}
            deprecatedError={deprecatedError}
            onCollapse={() => setTrayCollapsed((c) => !c)}
            onReorder={canEdit ? reorderTray : undefined}
            onRemove={canEdit ? removeFromTray : undefined}
            onEditFields={
              projectId && canEdit ? (instanceId) => setEditingInstance(instanceId) : undefined
            }
            onComment={projectId ? handleOpenCommentPanel : undefined}
            onNote={projectId ? handleOpenNotePanel : undefined}
            onExport={projectId && canEdit ? handleExport : undefined}
            onPdfExport={projectId && canEdit ? handlePdfExport : undefined}
            onPresent={projectId ? handlePresent : undefined}
            onUploadPersonalSlide={
              projectId && canEdit ? () => setUploadDialogOpen(true) : undefined
            }
            onSaveVersion={projectId && canEdit ? () => setSaveVersionOpen(true) : undefined}
            onShareLink={projectId && canEdit ? handleOpenShareLinks : undefined}
            onManageAccess={projectId && canEdit ? handleOpenManageAccess : undefined}
            previewUrls={previewUrls}
          />
        </div>
      )}

      {/* Edit fields dialog */}
      {editingInstance && editingSlide && (
        <EditFieldsDialog
          open
          onClose={() => setEditingInstance(null)}
          slide={editingSlide}
          instanceId={editingInstance}
          values={textEdits[editingInstance] ?? {}}
          previewUrl={previewUrls[editingInstance]}
          onSave={(fieldValues) => handleSaveFields(editingInstance, fieldValues)}
        />
      )}

      {/* Slide preview dialog */}
      {previewSlideId && (
        <SlidePreviewDialog
          open
          onClose={() => setPreviewSlideId(null)}
          slide={slideMap.get(previewSlideId) ?? null}
          previewUrl={(() => {
            const inst = trayItems.find((t) => t.slide_id === previewSlideId)
            return inst ? previewUrls[inst.id] : undefined
          })()}
          onEditFields={
            projectId && canEdit
              ? () => {
                  const inst = trayItems.find((t) => t.slide_id === previewSlideId)
                  if (inst) {
                    setPreviewSlideId(null)
                    setEditingInstance(inst.id)
                  }
                }
              : undefined
          }
        />
      )}

      {/* Export progress dialog */}
      {exportState && (
        <ExportProgressDialog
          open={exportState.open}
          onClose={() => setExportState(null)}
          onRetry={() => doExport(lastExportTypeRef.current)}
          onStartExport={() => doExport(exportState.format)}
          error={exportState.error}
          step={exportState.step}
          format={exportState.format}
          slideCount={trayItems.length}
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

      {/* Mandatory slides missing warning */}
      {mandatoryWarning && (
        <Dialog
          open
          onOpenChange={(o) => {
            if (!o) setMandatoryWarning(null)
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                {t('mandatory_warning.title')}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{t('mandatory_warning.description')}</p>
            <ul className="space-y-1.5">
              {mandatoryWarning.missing.map((m) => (
                <li
                  key={m.slideId}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {m.slideTitle}
                </li>
              ))}
            </ul>
            <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => {
                  const proceed = mandatoryWarning.proceed
                  setMandatoryWarning(null)
                  proceed()
                }}
              >
                {t('mandatory_warning.proceed_anyway', {
                  action: mandatoryWarning.proceedLabel,
                })}
              </Button>
              <Button size="sm" onClick={() => setMandatoryWarning(null)}>
                {t('mandatory_warning.go_back')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Archived slides warning dialog (BUG-6 / PROJ-46) */}
      {archivedWarning && (
        <Dialog
          open
          onOpenChange={(o) => {
            if (!o) setArchivedWarning(null)
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                {t('board.slide_archived')}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{t('board.export_warning_archived')}</p>
            <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-2">
              <Button variant="ghost" size="sm" onClick={() => setArchivedWarning(null)}>
                {t('export_dialog.close')}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const proceed = archivedWarning.proceed
                  setArchivedWarning(null)
                  proceed()
                }}
              >
                {t('board.export_continue_anyway')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Prepare dialog (PROJ-35: text injection before presentation/share/PDF) */}
      {prepareState && projectId && (
        <PrepareDialog
          open={prepareState.open}
          projectId={projectId}
          format={prepareState.format}
          onReady={handlePrepareReady}
          onCancel={() => setPrepareState(null)}
        />
      )}

      {/* Presentation mode — full-screen overlay */}
      {presentationMode && (
        <PresentationMode slides={presentationSlides} onExit={() => setPresentationMode(false)} />
      )}

      {/* CRM details dialog (PROJ-28) */}
      {projectId && canEdit && (
        <CrmDetailsDialog
          open={crmDialogOpen}
          onClose={() => setCrmDialogOpen(false)}
          projectId={projectId}
          initialCustomerName={project?.crm_customer_name ?? ''}
          initialCompanyName={project?.crm_company_name ?? ''}
          initialDealId={project?.crm_deal_id ?? ''}
          onSaved={(fields) => {
            setProject((prev) => (prev ? { ...prev, ...fields } : prev))
          }}
        />
      )}

      {/* Share panel (owner + editors) */}
      {canEdit && (
        <SharePanel
          open={sharePanelTab !== null}
          mode={sharePanelTab ?? 'people'}
          onClose={() => setSharePanelTab(null)}
          projectId={projectId!}
          projectName={project?.name ?? ''}
          ownerName={displayName ?? 'You'}
          shares={shares}
          onAddShare={handleAddShare}
          onUpdatePermission={handleUpdatePermission}
          onRemoveShare={handleRemoveShare}
          onSearchUsers={handleSearchUsers}
        />
      )}

      {/* Comment panel (PROJ-30) */}
      {commentSlideId && (
        <CommentPanel
          open={commentPanelOpen}
          onClose={() => {
            setCommentPanelOpen(false)
            setCommentSlideId(null)
          }}
          projectId={projectId!}
          slideId={commentSlideId}
          slideTitle={slideMap.get(commentSlideId)?.title ?? 'Slide'}
          instanceIndex={commentInstanceIndex}
          currentUserId={userId ?? ''}
          canModerate={isProjectOwner || isAdmin}
          isArchived={project?.status === 'archived'}
          onCommentCountChange={handleCommentCountChange}
        />
      )}

      {/* Note panel (PROJ-31) */}
      {noteSlideId && (
        <NotePanel
          key={noteSlideId}
          open={notePanelOpen}
          onClose={() => {
            setNotePanelOpen(false)
            setNoteSlideId(null)
          }}
          projectId={projectId!}
          slideId={noteSlideId}
          slideTitle={slideMap.get(noteSlideId)?.title ?? 'Slide'}
          onNoteChange={handleNoteChange}
        />
      )}

      {/* Upload personal slide dialog (PROJ-32) */}
      {projectId && (
        <UploadPersonalSlideDialog
          open={uploadDialogOpen}
          projectId={projectId}
          onClose={() => setUploadDialogOpen(false)}
          onUploaded={handlePersonalSlideUploaded}
        />
      )}

      {/* Reset layout dialog (PROJ-20) */}
      <ResetLayoutDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        onConfirm={handleResetLayout}
        resetting={resetting}
      />

      {/* Annotation editing overlay (PROJ-20) */}
      {editingAnnotation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setEditingAnnotation(null)}
        >
          <div
            data-no-pan
            className="bg-background rounded-lg border shadow-lg p-4 w-80"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium mb-2">{t('board.slide_annotation')}</p>
            <Input
              className="mb-3"
              placeholder={t('board.annotation_placeholder')}
              maxLength={100}
              value={editingAnnotation.value}
              onChange={(e) =>
                setEditingAnnotation({ ...editingAnnotation, value: e.target.value })
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter')
                  setAnnotation(editingAnnotation.slideId, editingAnnotation.value)
              }}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              {editingAnnotation.value && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAnnotation(editingAnnotation.slideId, '')}
                >
                  {t('common.remove')}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setEditingAnnotation(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                onClick={() => setAnnotation(editingAnnotation.slideId, editingAnnotation.value)}
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Version history panel (PROJ-38) */}
      {projectId && (
        <VersionHistoryPanel
          open={versionHistoryOpen}
          onClose={() => setVersionHistoryOpen(false)}
          projectId={projectId}
          onRestore={handleRestoreRequest}
        />
      )}

      {/* Save version dialog (PROJ-38) */}
      {projectId && (
        <SaveVersionDialog
          open={saveVersionOpen}
          onClose={() => setSaveVersionOpen(false)}
          projectId={projectId}
          onSaved={handleVersionSaved}
        />
      )}

      {/* Restore confirm dialog (PROJ-38) */}
      <RestoreConfirmDialog
        open={!!restoreVersion}
        version={restoreVersion}
        onClose={() => setRestoreVersion(null)}
        onConfirm={handleConfirmRestore}
      />
    </>
  )
}
