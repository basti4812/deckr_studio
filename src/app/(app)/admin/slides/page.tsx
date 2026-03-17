'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckSquare, ImageIcon, Loader2, RefreshCw, Tag, Trash2, Upload, X } from 'lucide-react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { useCurrentUser } from '@/hooks/use-current-user'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { SlideCard } from '@/components/slides/slide-card'
import { SlideGroupCard } from '@/components/slides/slide-group-card'
import { UploadSlideDialog } from '@/components/slides/upload-slide-dialog'
import { EditSlideDialog } from '@/components/slides/edit-slide-dialog'
import type { Slide } from '@/components/slides/slide-card'

type StatusFilter = 'all' | 'standard' | 'mandatory' | 'deprecated'

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
  const [slides, setSlides] = useState<Slide[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [editSlide, setEditSlide] = useState<Slide | null>(null)
  const [deleteSlide, setDeleteSlide] = useState<Slide | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [bulkStatusLoading, setBulkStatusLoading] = useState(false)
  const [bulkTagsOpen, setBulkTagsOpen] = useState(false)
  const [bulkTagsLoading, setBulkTagsLoading] = useState(false)

  const fetchSlides = useCallback(async () => {
    const supabase = createBrowserSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return

    setLoading(true)
    try {
      const res = await fetch('/api/slides', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setSlides(data.slides ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!userLoading) {
      fetchSlides()
    }
  }, [userLoading, fetchSlides])

  // Poll for thumbnail updates when slides are missing thumbnails
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingThumbnails = slides.filter((s) => s.pptx_url && !s.thumbnail_url)

  useEffect(() => {
    if (pendingThumbnails.length === 0 || loading) {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }

    // Start polling every 5 seconds
    if (!pollRef.current) {
      pollRef.current = setInterval(async () => {
        const supabase = createBrowserSupabaseClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) return

        const res = await fetch('/api/slides', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        const freshSlides = (data.slides ?? []) as Slide[]

        setSlides((prev) => {
          let changed = false
          const updated = prev.map((s) => {
            if (s.thumbnail_url) return s
            const fresh = freshSlides.find((f) => f.id === s.id)
            if (fresh?.thumbnail_url) {
              changed = true
              return { ...s, thumbnail_url: fresh.thumbnail_url }
            }
            return s
          })
          return changed ? updated : prev
        })
      }, 5000)
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [pendingThumbnails.length, loading])

  async function handleDelete() {
    if (!deleteSlide) return
    setDeleting(true)
    try {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch(`/api/slides/${deleteSlide.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        setSlides((prev) => prev.filter((s) => s.id !== deleteSlide.id))
      }
    } finally {
      setDeleting(false)
      setDeleteSlide(null)
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
      }

      if (deleted.length > 0) {
        setSlides((prev) => prev.filter((s) => !deleted.includes(s.id)))
      }
      setSelected(new Set())

      if (errors.length > 0) {
        console.error('[bulk-delete] Some slides could not be deleted:', errors)
      }
    } finally {
      setBulkDeleting(false)
      setBulkDeleteConfirm(false)
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
        setSlides((prev) => prev.map((s) => (selected.has(s.id) ? { ...s, status: newStatus } : s)))
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
        setSlides((prev) =>
          prev.map((s) => {
            if (!selected.has(s.id)) return s
            const currentTags: string[] = (s.tags as string[]) ?? []
            const merged = [...new Set([...currentTags, ...tagNames])].slice(0, 20)
            return { ...s, tags: merged }
          })
        )
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

  async function handleRegenerateThumbnails() {
    const missing = slides.filter((s) => !s.thumbnail_url)
    if (missing.length === 0) return

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
        body: JSON.stringify({ slideIds: missing.map((s) => s.id) }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.results) {
          setSlides((prev) =>
            prev.map((s) => {
              const result = data.results.find(
                (r: { slideId: string; thumbnailUrl: string | null }) => r.slideId === s.id
              )
              if (result?.thumbnailUrl) {
                return { ...s, thumbnail_url: result.thumbnailUrl }
              }
              return s
            })
          )
        }
      }
    } finally {
      setRegenerating(false)
    }
  }

  const missingThumbnailCount = slides.filter((s) => !s.thumbnail_url && s.pptx_url).length

  // Collect all unique tags from existing slides for the bulk tag popover
  const allTags = [...new Set(slides.flatMap((s) => (s.tags as string[]) ?? []))].sort()

  const filtered = filter === 'all' ? slides : slides.filter((s) => s.status === filter)

  const counts = {
    all: slides.length,
    standard: slides.filter((s) => s.status === 'standard').length,
    mandatory: slides.filter((s) => s.status === 'mandatory').length,
    deprecated: slides.filter((s) => s.status === 'deprecated').length,
  }

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
          {missingThumbnailCount > 0 && (
            <Button variant="outline" onClick={handleRegenerateThumbnails} disabled={regenerating}>
              <ImageIcon className="mr-2 h-4 w-4" />
              {regenerating
                ? t('admin.regenerating_thumbnails', 'Generating…')
                : t('admin.regenerate_thumbnails', {
                    count: missingThumbnailCount,
                    defaultValue: `Regenerate thumbnails (${missingThumbnailCount})`,
                  })}
            </Button>
          )}
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            {t('admin.upload_presentations')}
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
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

      {/* Selection toolbar */}
      {filtered.length > 0 && !loading && (
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
      {(regenerating || pendingThumbnails.length > 0) && !loading && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <p className="text-sm text-primary">
            {regenerating
              ? t('admin.generating_thumbnails_banner', 'Generating thumbnails, please wait…')
              : t('admin.thumbnails_pending_banner', {
                  count: pendingThumbnails.length,
                  defaultValue: `${pendingThumbnails.length} thumbnail${pendingThumbnails.length !== 1 ? 's' : ''} are being generated. They will appear automatically.`,
                })}
          </p>
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
      ) : filtered.length === 0 ? (
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

            for (const slide of filtered) {
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
                    onDelete={setDeleteSlide}
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
                    onDelete={setDeleteSlide}
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
          onUploaded={(slide) => {
            setSlides((prev) => [slide, ...prev])
          }}
        />
      )}

      {/* Edit dialog */}
      <EditSlideDialog
        slide={editSlide}
        onClose={() => setEditSlide(null)}
        onSaved={(updated) => {
          setSlides((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
          setEditSlide(null)
        }}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteSlide} onOpenChange={(o) => !o && setDeleteSlide(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.delete_slide_confirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin.delete_slide_message', { title: deleteSlide?.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t('admin.deleting') : t('admin.delete_slide_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={(o) => !o && setBulkDeleteConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('admin.bulk_delete_confirm', {
                count: selected.size,
                defaultValue: `Delete ${selected.size} slides?`,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'admin.bulk_delete_message',
                'This action cannot be undone. Slides that are used in projects cannot be deleted.'
              )}
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
                ? t('admin.deleting', 'Deleting…')
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
