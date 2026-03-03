'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { Clock, Plus, RotateCcw, Share2, Users, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ResetLayoutDialog } from '@/components/board/reset-layout-dialog'
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
import { CommentPanel } from '@/components/board/comment-panel'
import { NotePanel } from '@/components/board/note-panel'
import { UploadPersonalSlideDialog, type PersonalSlideRecord } from '@/components/board/upload-personal-slide-dialog'
import { SearchFilterBar } from '@/components/board/search-filter-bar'
import { FilterPanel, type ActiveFilters } from '@/components/board/filter-panel'
import { VersionHistoryPanel, type ProjectVersion } from '@/components/board/version-history-panel'
import { SaveVersionDialog } from '@/components/board/save-version-dialog'
import { RestoreConfirmDialog } from '@/components/board/restore-confirm-dialog'
import { checkFillStatus, type UnfilledField } from '@/lib/fill-check'
import type { Slide } from '@/components/slides/slide-card'
import { MobileProjectView } from '@/components/board/mobile-project-view'
import { useIsMobile } from '@/hooks/use-mobile'

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
  status: 'active' | 'archived'
  slide_order: TrayItem[]
  text_edits: Record<string, Record<string, string>>
  updated_at: string
  userPermission?: 'owner' | 'view' | 'edit'
}

interface PersonalGroup {
  id: string
  name: string
  position: number
}

interface SlideOverride {
  groupId: string
  position: number
  annotation?: string
}

interface PersonalLayout {
  personalGroups: PersonalGroup[]
  slideOverrides: Record<string, SlideOverride>
}

interface BoardSection {
  id: string
  name: string
  slides: Slide[]
  isPersonal?: boolean
  annotations?: Record<string, string>
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

  // Personal layout state (PROJ-20)
  const [personalLayout, setPersonalLayout] = useState<PersonalLayout | null>(null)
  const [hasPersonalLayout, setHasPersonalLayout] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [editingAnnotation, setEditingAnnotation] = useState<{ slideId: string; value: string } | null>(null)
  const layoutSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const layoutRef = useRef<PersonalLayout | null>(null)

  // Version history state (PROJ-38)
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false)
  const [saveVersionOpen, setSaveVersionOpen] = useState(false)
  const [restoreVersion, setRestoreVersion] = useState<ProjectVersion | null>(null)

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

      const [slidesRes, groupsRes, layoutRes] = await Promise.all([
        fetch('/api/slides', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        fetch('/api/groups', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        fetch('/api/board/layout', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
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
      if (layoutRes?.ok) {
        const d = await layoutRes.json()
        if (d.layout) {
          setPersonalLayout(d.layout)
          setHasPersonalLayout(true)
          layoutRef.current = d.layout
        }
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
  // Personal layout save (PROJ-20)
  // -------------------------------------------------------------------------

  async function saveLayout(layout: PersonalLayout) {
    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
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
    if (!trimmed) return
    const group: PersonalGroup = {
      id: crypto.randomUUID(),
      name: trimmed,
      position: (personalLayout?.personalGroups.length ?? 0) + groups.length,
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
      personalGroups: prev.personalGroups.map((g) =>
        g.id === groupId ? { ...g, name } : g
      ),
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
      const { data: { session } } = await supabase.auth.getSession()
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

    // Library slides: check mandatory
    setTrayItems((prev) => {
      const it = prev.find((t) => t.id === instanceId)
      if (!it) return prev
      const slide = slideMap.get(it.slide_id)
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
  // Comment panel (PROJ-30)
  // -------------------------------------------------------------------------

  const fetchCommentCounts = useCallback(async () => {
    if (!projectId) return
    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
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
    const { data: { session } } = await supabase.auth.getSession()
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
    const { data: { session } } = await supabase.auth.getSession()
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
    const { data: { session } } = await supabase.auth.getSession()
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
    const { data: { session } } = await supabase.auth.getSession()
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

    // Build admin sections
    const adminSections: BoardSection[] = groups.map((group) => {
      const memberSlideIds = memberships
        .filter((m) => m.group_id === group.id)
        .sort((a, b) => a.position - b.position)
        .map((m) => m.slide_id)
      const groupSlides = memberSlideIds.flatMap((id) => slides.filter((s) => s.id === id))
      return { id: group.id, name: group.name, slides: groupSlides }
    })

    const ungrouped = slides.filter((s) => !assignedIds.has(s.id))

    // If no personal layout, return admin layout as-is
    if (!personalLayout) {
      if (ungrouped.length > 0 || groups.length === 0) {
        adminSections.push({ id: '__ungrouped__', name: 'Ungrouped', slides: ungrouped })
      }
      return adminSections
    }

    // Merge personal layout overrides
    const overrides = personalLayout.slideOverrides
    const overriddenSlideIds = new Set(Object.keys(overrides))

    // Remove overridden slides from admin sections
    const mergedAdminSections = adminSections.map((section) => ({
      ...section,
      slides: section.slides.filter((s) => !overriddenSlideIds.has(s.id)),
    }))

    // Build personal group sections
    const personalSections: BoardSection[] = personalLayout.personalGroups
      .sort((a, b) => a.position - b.position)
      .map((pg) => ({ id: pg.id, name: pg.name, slides: [] as Slide[], isPersonal: true }))

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
      // If target group no longer exists, slide falls through to ungrouped
    }

    // Sort only overridden slides within each section by position,
    // preserving original admin order for non-overridden slides
    const sortedSectionIds = new Set<string>()
    for (const [, override] of Object.entries(overrides)) {
      if (sortedSectionIds.has(override.groupId)) continue
      const target = sectionMap.get(override.groupId)
      if (!target) continue
      sortedSectionIds.add(override.groupId)

      // Partition: admin-ordered slides (no override) stay in original order,
      // overridden slides are sorted by their override position
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

    // Add ungrouped: slides without admin assignment AND without personal override
    const allPlacedIds = new Set(
      allSections.flatMap((s) => s.slides.map((sl) => sl.id))
    )
    const remainingUngrouped = ungrouped.filter((s) => !allPlacedIds.has(s.id))
    // Also catch slides that were overridden to a now-deleted personal group
    const orphanedOverrides = Object.entries(overrides)
      .filter(([, o]) => !sectionMap.has(o.groupId))
      .map(([slideId]) => slideById.get(slideId))
      .filter(Boolean) as Slide[]

    const allUngrouped = [...remainingUngrouped, ...orphanedOverrides]
    if (allUngrouped.length > 0 || (groups.length === 0 && personalSections.length === 0)) {
      allSections.push({ id: '__ungrouped__', name: 'Ungrouped', slides: allUngrouped })
    }

    // Attach annotations to all sections
    return allSections.map((s) => ({ ...s, annotations }))
  }

  // Slide lookup map for tray
  const slideMap = new Map(slides.map((s) => [s.id, s]))

  // Personal slides lookup map for tray (PROJ-32)
  const personalSlidesMap = new Map(personalSlides.map((s) => [s.id, s]))

  // Slides in tray order for presentation mode
  const presentationSlides: PresentationSlide[] = trayItems.flatMap((item) => {
    // Personal slides — no thumbnail in V1, show placeholder title
    if (item.is_personal && item.personal_slide_id) {
      const ps = personalSlidesMap.get(item.personal_slide_id)
      if (!ps) return []
      return [{ thumbnail_url: null, title: ps.title }]
    }
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

  // Move targets = all groups (admin + personal) for context menu
  const moveTargets = sections.map((s) => ({ id: s.id, name: s.name }))
  const overriddenSlideIds = new Set(Object.keys(personalLayout?.slideOverrides ?? {}))

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
      {!isMobile && <div className="hidden md:flex flex-1 min-h-0 -m-6">
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
                <p className="text-sm font-medium text-muted-foreground">{t('board.no_slides_in_library')}</p>
                {isAdmin && (
                  <Button variant="outline" size="sm" asChild data-no-pan>
                    <Link href="/admin/slides">{t('admin.upload_slide')}</Link>
                  </Button>
                )}
              </div>
            ) : isFiltering && resultCount === 0 ? (
              <div
                style={{ width: worldW, height: worldH }}
                className="flex flex-col items-center justify-center gap-2"
              >
                <p className="text-sm font-medium text-muted-foreground">{t('board.no_slides_match')}</p>
                <p className="text-xs text-muted-foreground">{t('board.try_different_keywords')}</p>
              </div>
            ) : (
              displaySections.map((section, i) => (
                <GroupSection
                  key={section.id}
                  id={section.id}
                  name={section.name}
                  slides={section.slides}
                  x={PADDING}
                  y={sectionYs[i]}
                  onAddToTray={projectId && canEdit ? addToTray : undefined}
                  isPersonal={section.isPersonal}
                  onRename={section.isPersonal ? (name) => renamePersonalGroup(section.id, name) : undefined}
                  onDelete={section.isPersonal ? () => deletePersonalGroup(section.id) : undefined}
                  annotations={section.annotations}
                  onAnnotationClick={(slideId) => {
                    const current = personalLayout?.slideOverrides[slideId]?.annotation ?? ''
                    setEditingAnnotation({ slideId, value: current })
                  }}
                  moveTargets={moveTargets}
                  onMoveToGroup={moveSlideToGroup}
                  onResetPosition={resetSlidePosition}
                  overriddenSlideIds={overriddenSlideIds}
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

          {/* Top-right toolbar: personal layout + share */}
          <div data-no-pan className="absolute top-4 right-4 z-10 flex items-center gap-2">
            {/* Personal layout controls */}
            {hasPersonalLayout && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 bg-background/80 backdrop-blur-sm"
                onClick={() => setResetDialogOpen(true)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('board.reset_layout')}
              </Button>
            )}
            {!addingGroup ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 bg-background/80 backdrop-blur-sm"
                onClick={() => setAddingGroup(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                {t('board.add_group')}
              </Button>
            ) : (
              <div className="flex items-center gap-1 bg-background/80 backdrop-blur-sm rounded-md border px-1">
                <Input
                  className="h-7 w-36 text-xs border-0 shadow-none focus-visible:ring-0"
                  placeholder={t('board.group_name_placeholder')}
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addPersonalGroup(); if (e.key === 'Escape') { setAddingGroup(false); setNewGroupName('') } }}
                  autoFocus
                />
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={addPersonalGroup}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setAddingGroup(false); setNewGroupName('') }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            {/* Version history button (PROJ-38) */}
            {projectId && canEdit && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 bg-background/80 backdrop-blur-sm"
                onClick={() => setVersionHistoryOpen(true)}
                aria-label={t('board.open_version_history')}
              >
                <Clock className="h-3.5 w-3.5" />
                {t('version_history.title')}
              </Button>
            )}
            {/* Share controls */}
            {projectId && !canEdit && (
              <Badge variant="outline" className="gap-1 bg-background/80 backdrop-blur-sm">
                <Users className="h-3 w-3" />
                {t('project_card.shared_badge')}
              </Badge>
            )}
            {projectId && canEdit && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 bg-background/80 backdrop-blur-sm"
                onClick={handleOpenSharePanel}
              >
                <Share2 className="h-3.5 w-3.5" />
                {t('board.share')}
              </Button>
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
          onEditFields={projectId && canEdit ? (instanceId) => setEditingInstance(instanceId) : undefined}
          onComment={projectId ? handleOpenCommentPanel : undefined}
          onNote={projectId ? handleOpenNotePanel : undefined}
          onExport={projectId && canEdit ? handleExport : undefined}
          onPdfExport={projectId && canEdit ? handlePdfExport : undefined}
          onPresent={projectId ? handlePresent : undefined}
          onUploadPersonalSlide={projectId && canEdit ? () => setUploadDialogOpen(true) : undefined}
          onSaveVersion={projectId && canEdit ? () => setSaveVersionOpen(true) : undefined}
        />
      </div>}

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

      {/* Share panel (owner + editors) */}
      {canEdit && (
        <SharePanel
          open={sharePanelOpen}
          onClose={() => setSharePanelOpen(false)}
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
          onClose={() => { setCommentPanelOpen(false); setCommentSlideId(null) }}
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
          onClose={() => { setNotePanelOpen(false); setNoteSlideId(null) }}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setEditingAnnotation(null)}>
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
              onChange={(e) => setEditingAnnotation({ ...editingAnnotation, value: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') setAnnotation(editingAnnotation.slideId, editingAnnotation.value) }}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              {editingAnnotation.value && (
                <Button variant="outline" size="sm" onClick={() => setAnnotation(editingAnnotation.slideId, '')}>
                  {t('common.remove')}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setEditingAnnotation(null)}>
                {t('common.cancel')}
              </Button>
              <Button size="sm" onClick={() => setAnnotation(editingAnnotation.slideId, editingAnnotation.value)}>
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
