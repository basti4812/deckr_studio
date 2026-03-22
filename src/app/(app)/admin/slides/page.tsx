'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Archive,
  CheckSquare,
  ImageIcon,
  Loader2,
  RefreshCw,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { useCurrentUser } from '@/hooks/use-current-user'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { SlideCard } from '@/components/slides/slide-card'
import { SlideGroupCard } from '@/components/slides/slide-group-card'
import { UploadSlideDialog } from '@/components/slides/upload-slide-dialog'
import { EditSlideDialog } from '@/components/slides/edit-slide-dialog'
import { ReplaceSlideDialog } from '@/components/slides/replace-slide-dialog'
import type { Slide } from '@/components/slides/slide-card'

type StatusFilter = 'all' | 'standard' | 'mandatory' | 'deprecated'

// ---------------------------------------------------------------------------
// Impact data type from /api/slides/[id]/impact
// ---------------------------------------------------------------------------

interface SlideImpact {
  slideTitle: string
  projectCount: number
  userCount: number
  projects: { id: string; name: string; ownerName: string }[]
}

// ---------------------------------------------------------------------------
// Bulk Tag Popover — shows existing tags as checkboxes + input for new tag
// ---------------------------------------------------------------------------

function BulkTagPopover({
  open,
  onOpenChange,
  allTags,
  loading,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  allTags: string[]
  loading: boolean
  onApply: (tags: string[]) => void
}) {
  const { t } = useTranslation()
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [newTag, setNewTag] = useState('')

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  function handleApply() {
    const tags = [...selectedTags]
    if (newTag.trim()) tags.push(newTag.trim())
    if (tags.length > 0) onApply(tags)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) {
          setSelectedTags(new Set())
          setNewTag('')
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Tag className="mr-2 h-4 w-4" />
          )}
          {t('admin.add_tags')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        <div className="space-y-3">
          <p className="text-sm font-medium">{t('admin.select_tags')}</p>
          {allTags.length > 0 && (
            <div className="max-h-40 space-y-2 overflow-y-auto">
              {allTags.map((tag) => (
                <label key={tag} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={selectedTags.has(tag)}
                    onCheckedChange={() => toggleTag(tag)}
                  />
                  {tag}
                </label>
              ))}
            </div>
          )}
          <input
            type="text"
            className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground"
            placeholder={t('admin.new_tag_placeholder')}
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            maxLength={50}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleApply()
              }
            }}
          />
          <Button
            size="sm"
            className="w-full"
            disabled={selectedTags.size === 0 && !newTag.trim()}
            onClick={handleApply}
          >
            {t('admin.apply_tags')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default function SlideLibraryPage() {
  const { t } = useTranslation()
  const { tenantId, loading: userLoading } = useCurrentUser()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [editSlide, setEditSlide] = useState<Slide | null>(null)
  const [replaceSlide, setReplaceSlide] = useState<Slide | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState(0)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [bulkStatusLoading, setBulkStatusLoading] = useState(false)
  const [bulkTagsOpen, setBulkTagsOpen] = useState(false)
  const [bulkTagsLoading, setBulkTagsLoading] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  // Delete/archive dialog state
  const [deleteSlide, setDeleteSlide] = useState<Slide | null>(null)
  const [impact, setImpact] = useState<SlideImpact | null>(null)
  const [impactLoading, setImpactLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState(0)

  const { data: slidesData, isLoading: loading } = useQuery({
    queryKey: ['slides', showArchived],
    queryFn: async () => {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const url = showArchived ? '/api/slides?include_archived=true' : '/api/slides'
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) throw new Error('Failed to load slides')
      const data = await res.json()
      return (data.slides ?? []) as Slide[]
    },
    enabled: !userLoading,
  })

  const slides = slidesData ?? []

  function invalidateSlides() {
    queryClient.invalidateQueries({ queryKey: ['slides'] })
  }

  // Poll for thumbnail updates when slides are actively generating
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef = useRef(0)
  const MAX_POLL_CYCLES = 60 // 5s x 60 = 5 minutes max polling

  const generatingThumbnails = slides.filter(
    (s) =>
      s.thumbnail_status === 'generating' ||
      (s.pptx_url && !s.thumbnail_url && s.thumbnail_status !== 'failed')
  )
  const failedThumbnails = slides.filter((s) => s.thumbnail_status === 'failed')

  useEffect(() => {
    if (generatingThumbnails.length === 0 || loading) {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
        pollCountRef.current = 0
      }
      return
    }

    // Start polling every 5 seconds to pick up new thumbnails (max 5 minutes)
    if (!pollRef.current) {
      pollCountRef.current = 0
      pollRef.current = setInterval(() => {
        pollCountRef.current++
        if (pollCountRef.current >= MAX_POLL_CYCLES) {
          clearInterval(pollRef.current!)
          pollRef.current = null
          return
        }
        invalidateSlides()
      }, 5000)
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [generatingThumbnails.length, loading])

  // -------------------------------------------------------------------------
  // Impact check before delete
  // -------------------------------------------------------------------------

  async function fetchImpact(slide: Slide) {
    setDeleteSlide(slide)
    setImpact(null)
    setImpactLoading(true)
    try {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch(`/api/slides/${slide.id}/impact`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setImpact(data)
      } else {
        // Fallback: no impact data, allow delete
        setImpact({ slideTitle: slide.title, projectCount: 0, userCount: 0, projects: [] })
      }
    } finally {
      setImpactLoading(false)
    }
  }

  async function handleDelete() {
    if (!deleteSlide) return
    setDeleting(true)
    setDeleteProgress(30)
    try {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return

      setDeleteProgress(60)
      const res = await fetch(`/api/slides/${deleteSlide.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      setDeleteProgress(90)
      if (res.ok) {
        const data = await res.json()
        if (data.action === 'archived') {
          toast.success(t('admin.slide_archived_success'))
        } else {
          toast.success(t('admin.slide_deleted_success'))
        }
        invalidateSlides()
      }
      setDeleteProgress(100)
    } finally {
      // Brief delay to show 100% progress before closing
      setTimeout(() => {
        setDeleting(false)
        setDeleteSlide(null)
        setImpact(null)
        setDeleteProgress(0)
      }, 300)
    }
  }

  // -------------------------------------------------------------------------
  // Unarchive a slide
  // -------------------------------------------------------------------------

  async function handleUnarchive(slide: Slide) {
    try {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch(`/api/slides/${slide.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ archived_at: null }),
      })

      if (res.ok) {
        toast.success(t('admin.unarchive_success'))
        invalidateSlides()
      }
    } catch {
      /* ignore */
    }
  }

  function toggleSelect(id: string, isSelected: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (isSelected) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((s) => s.id)))
    }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return
    setBulkDeleting(true)
    try {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return

      const errors: string[] = []
      const deleted: string[] = []
      const total = selected.size
      let processed = 0
      setBulkDeleteProgress(0)

      for (const id of selected) {
        const res = await fetch(`/api/slides/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (res.ok) {
          deleted.push(id)
        } else {
          const data = await res.json().catch(() => ({}))
          const slide = slides.find((s) => s.id === id)
          errors.push(`${slide?.title ?? id}: ${(data as { error?: string }).error ?? 'Failed'}`)
        }
        processed++
        setBulkDeleteProgress(Math.round((processed / total) * 100))
      }

      if (deleted.length > 0) {
        invalidateSlides()
      }
      setSelected(new Set())

      if (errors.length > 0) {
        console.error('[bulk-delete] Some slides could not be deleted:', errors)
      }
    } finally {
      setBulkDeleting(false)
      setBulkDeleteConfirm(false)
      setBulkDeleteProgress(0)
    }
  }

  async function handleBulkStatusChange(newStatus: 'standard' | 'mandatory' | 'deprecated') {
    if (selected.size === 0) return
    setBulkStatusLoading(true)
    try {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch('/api/slides/bulk-status', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ slideIds: [...selected], status: newStatus }),
      })

      if (res.ok) {
        const data = await res.json()
        invalidateSlides()
        setSelected(new Set())
        toast.success(t('admin.status_changed_count', { count: data.updated }))
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error((data as { error?: string }).error ?? t('admin.bulk_action_error'))
      }
    } finally {
      setBulkStatusLoading(false)
    }
  }

  async function handleBulkAddTags(tagNames: string[]) {
    if (selected.size === 0 || tagNames.length === 0) return
    setBulkTagsLoading(true)
    try {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch('/api/slides/bulk-tags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ slideIds: [...selected], tags: tagNames }),
      })

      if (res.ok) {
        const data = await res.json()
        invalidateSlides()
        setSelected(new Set())
        setBulkTagsOpen(false)
        toast.success(t('admin.tags_added_count', { count: data.updated }))
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error((data as { error?: string }).error ?? t('admin.bulk_action_error'))
      }
    } finally {
      setBulkTagsLoading(false)
    }
  }

  const [regenerating, setRegenerating] = useState(false)

  async function handleRegenerateThumbnails(slideIds?: string[]) {
    const targetIds =
      slideIds ??
      slides.filter((s) => !s.thumbnail_url || s.thumbnail_status === 'failed').map((s) => s.id)
    if (targetIds.length === 0) return

    setRegenerating(true)
    try {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch('/api/slides/generate-thumbnails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ slideIds: targetIds }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.failed > 0) {
          toast.error(
            t('admin.thumbnail_generation_partial', {
              succeeded: data.succeeded,
              failed: data.failed,
              defaultValue: `${data.succeeded} succeeded, ${data.failed} failed`,
            })
          )
        }
      } else {
        const errData = await res.json().catch(() => ({}))
        toast.error((errData as { error?: string }).error ?? 'Thumbnail generation failed')
      }
      invalidateSlides()
    } finally {
      setRegenerating(false)
    }
  }

  const retryableThumbnailCount = slides.filter(
    (s) => s.pptx_url && (!s.thumbnail_url || s.thumbnail_status === 'failed')
  ).length

  // Collect all unique tags from existing slides for the bulk tag popover
  const allTags = [...new Set(slides.flatMap((s) => (s.tags as string[]) ?? []))].sort()

  // Split active vs archived
  const activeSlides = slides.filter((s) => !s.archived_at)
  const archivedSlides = slides.filter((s) => !!s.archived_at)

  const filtered = filter === 'all' ? activeSlides : activeSlides.filter((s) => s.status === filter)

  // When showArchived is true, also show archived slides at the end
  const displaySlides = showArchived ? [...filtered, ...archivedSlides] : filtered

  const counts = {
    all: activeSlides.length,
    standard: activeSlides.filter((s) => s.status === 'standard').length,
    mandatory: activeSlides.filter((s) => s.status === 'mandatory').length,
    deprecated: activeSlides.filter((s) => s.status === 'deprecated').length,
  }

  // Determine what the delete dialog should show
  const isDeleteSlideArchived = !!deleteSlide?.archived_at
  const hasImpact = impact && impact.projectCount > 0

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {t('admin.slide_library')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('admin.slide_library_description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {retryableThumbnailCount > 0 && (
            <Button
              variant="outline"
              onClick={() => handleRegenerateThumbnails()}
              disabled={regenerating}
            >
              <ImageIcon className="mr-2 h-4 w-4" />
              {regenerating
                ? t('admin.regenerating_thumbnails', 'Generating...')
                : t('admin.regenerate_thumbnails', {
                    count: retryableThumbnailCount,
                    defaultValue: `Regenerate thumbnails (${retryableThumbnailCount})`,
                  })}
            </Button>
          )}
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            {t('admin.upload_presentations')}
          </Button>
        </div>
      </div>

      {/* Filter tabs + archive toggle */}
      <div className="flex items-center justify-between gap-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
          <TabsList>
            <TabsTrigger value="all">
              {t('admin.all')} ({counts.all})
            </TabsTrigger>
            <TabsTrigger value="standard">
              {t('admin.standard')} ({counts.standard})
            </TabsTrigger>
            <TabsTrigger value="mandatory">
              {t('admin.mandatory')} ({counts.mandatory})
            </TabsTrigger>
            <TabsTrigger value="deprecated">
              {t('admin.deprecated')} ({counts.deprecated})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Archive toggle */}
        <label className="flex items-center gap-2 text-sm cursor-pointer shrink-0">
          <Switch
            checked={showArchived}
            onCheckedChange={setShowArchived}
            aria-label={showArchived ? t('admin.hide_archived') : t('admin.show_archived')}
          />
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Archive className="h-3.5 w-3.5" />
            {showArchived ? t('admin.hide_archived') : t('admin.show_archived')}
            {archivedSlides.length > 0 && (
              <span className="text-xs">({archivedSlides.length})</span>
            )}
          </span>
        </label>
      </div>

      {/* Selection toolbar */}
      {displaySlides.length > 0 && !loading && (
        <div className="flex items-center gap-3">
          <Button
            variant={selected.size > 0 ? 'default' : 'outline'}
            size="sm"
            onClick={toggleSelectAll}
          >
            <CheckSquare className="mr-2 h-4 w-4" />
            {selected.size === filtered.length && filtered.length > 0
              ? t('admin.deselect_all', 'Deselect all')
              : t('admin.select_all', 'Select all')}
          </Button>

          {selected.size > 0 && (
            <>
              <span className="text-sm text-muted-foreground">
                {t('admin.slides_selected', {
                  count: selected.size,
                  defaultValue: `${selected.size} selected`,
                })}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={bulkStatusLoading}>
                    {bulkStatusLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    {t('admin.change_status')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => handleBulkStatusChange('standard')}>
                    {t('admin.standard')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkStatusChange('mandatory')}>
                    {t('admin.mandatory')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkStatusChange('deprecated')}>
                    {t('admin.deprecated')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <BulkTagPopover
                open={bulkTagsOpen}
                onOpenChange={setBulkTagsOpen}
                allTags={allTags}
                loading={bulkTagsLoading}
                onApply={handleBulkAddTags}
              />
              <Button variant="destructive" size="sm" onClick={() => setBulkDeleteConfirm(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t('admin.delete_selected', 'Delete selected')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                <X className="mr-2 h-4 w-4" />
                {t('admin.clear_selection', 'Clear')}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Thumbnail generation banner */}
      {(regenerating || generatingThumbnails.length > 0) && !loading && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <p className="text-sm text-primary">
            {regenerating
              ? t('admin.generating_thumbnails_banner', 'Generating thumbnails, please wait...')
              : t('admin.thumbnails_pending_banner', {
                  count: generatingThumbnails.length,
                  defaultValue: `${generatingThumbnails.length} thumbnail${generatingThumbnails.length !== 1 ? 's' : ''} are being generated. They will appear automatically.`,
                })}
          </p>
        </div>
      )}

      {/* Failed thumbnails banner */}
      {failedThumbnails.length > 0 && !regenerating && !loading && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive">
            {t('admin.thumbnails_failed_banner', {
              count: failedThumbnails.length,
              defaultValue: `${failedThumbnails.length} thumbnail${failedThumbnails.length !== 1 ? 's' : ''} failed to generate.`,
            })}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleRegenerateThumbnails(failedThumbnails.map((s) => s.id))}
          >
            <RefreshCw className="mr-2 h-3 w-3" />
            {t('admin.retry_failed_thumbnails', 'Retry')}
          </Button>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-lg border">
              <Skeleton className="aspect-video w-full" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : displaySlides.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            {filter === 'all'
              ? t('admin.no_slides_yet')
              : t('admin.no_filtered_slides', { filter })}
          </p>
          {filter === 'all' && (
            <p className="mt-1 text-xs text-muted-foreground">{t('admin.upload_first_pptx')}</p>
          )}
          {filter === 'all' && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setUploadOpen(true)}
            >
              <Upload className="mr-2 h-4 w-4" />
              {t('admin.upload_presentations')}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(() => {
            // Group slides by source_filename (multi-page uploads)
            const groups = new Map<string, Slide[]>()
            const ungrouped: Slide[] = []

            for (const slide of displaySlides) {
              if (slide.source_filename && (slide.page_count ?? 1) > 1) {
                const key = slide.source_filename
                if (!groups.has(key)) groups.set(key, [])
                groups.get(key)!.push(slide)
              } else {
                ungrouped.push(slide)
              }
            }

            return (
              <>
                {/* Grouped presentations */}
                {Array.from(groups.entries()).map(([filename, groupSlides]) => (
                  <SlideGroupCard
                    key={filename}
                    filename={filename}
                    slides={groupSlides}
                    onEdit={setEditSlide}
                    onDelete={fetchImpact}
                    onReplace={setReplaceSlide}
                    onUnarchive={handleUnarchive}
                    selected={selected}
                    onSelectChange={toggleSelect}
                  />
                ))}
                {/* Ungrouped / single slides */}
                {ungrouped.map((slide) => (
                  <SlideCard
                    key={slide.id}
                    slide={slide}
                    onEdit={setEditSlide}
                    onDelete={fetchImpact}
                    onReplace={setReplaceSlide}
                    onUnarchive={handleUnarchive}
                    selected={selected.has(slide.id)}
                    onSelectChange={(checked) => toggleSelect(slide.id, checked)}
                  />
                ))}
              </>
            )
          })()}
        </div>
      )}

      {/* Upload dialog */}
      {tenantId && (
        <UploadSlideDialog
          open={uploadOpen}
          tenantId={tenantId}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            invalidateSlides()
          }}
        />
      )}

      {/* Edit dialog */}
      <EditSlideDialog
        slide={editSlide}
        onClose={() => setEditSlide(null)}
        onSaved={() => {
          invalidateSlides()
          setEditSlide(null)
        }}
      />

      {/* Replace dialog */}
      <ReplaceSlideDialog
        slide={replaceSlide}
        onClose={() => setReplaceSlide(null)}
        onReplaced={() => {
          invalidateSlides()
        }}
      />

      {/* Delete / Archive confirmation dialog */}
      <AlertDialog
        open={!!deleteSlide}
        onOpenChange={(o) => {
          if (!o && !deleting) {
            setDeleteSlide(null)
            setImpact(null)
            setDeleteProgress(0)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isDeleteSlideArchived
                ? t('admin.permanent_delete_title')
                : hasImpact
                  ? t('admin.archive_slide_title')
                  : t('admin.delete_slide_confirm')}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {impactLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t('admin.loading_impact')}</span>
                  </div>
                ) : isDeleteSlideArchived ? (
                  <p>{t('admin.permanent_delete_message')}</p>
                ) : hasImpact ? (
                  <>
                    <p>
                      {t('admin.archive_slide_impact', {
                        userCount: impact!.userCount,
                        projectCount: impact!.projectCount,
                      })}
                    </p>
                    {impact!.projects.length > 0 && impact!.projects.length <= 10 && (
                      <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
                        {impact!.projects.map((p) => (
                          <li key={p.id}>
                            {p.name} ({p.ownerName})
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <p>{t('admin.archive_slide_no_impact')}</p>
                )}
                {/* Progress bar during deletion */}
                {deleting && <Progress value={deleteProgress} className="h-2" />}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting || impactLoading}>
              {t('admin.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting || impactLoading}
              className={
                isDeleteSlideArchived || !hasImpact
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : ''
              }
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {deleting
                ? t('admin.deleting')
                : isDeleteSlideArchived
                  ? t('admin.permanent_delete_button')
                  : hasImpact
                    ? t('admin.archive_slide_button')
                    : t('admin.delete_slide_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation */}
      <AlertDialog
        open={bulkDeleteConfirm}
        onOpenChange={(o) => !o && !bulkDeleting && setBulkDeleteConfirm(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('admin.bulk_delete_confirm', {
                count: selected.size,
                defaultValue: `Delete ${selected.size} slides?`,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {t(
                    'admin.bulk_delete_message',
                    'This action cannot be undone. Slides that are used in projects cannot be deleted.'
                  )}
                </p>
                {bulkDeleting && (
                  <div className="space-y-1">
                    <Progress value={bulkDeleteProgress} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                      {t('admin.bulk_delete_progress', {
                        progress: bulkDeleteProgress,
                        defaultValue: `${bulkDeleteProgress}% complete`,
                      })}
                    </p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>
              {t('admin.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleting
                ? t('admin.deleting', 'Deleting...')
                : t('admin.delete_slides_button', {
                    count: selected.size,
                    defaultValue: `Delete ${selected.size} slides`,
                  })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
