'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload } from 'lucide-react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCurrentUser } from '@/hooks/use-current-user'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { SlideCard } from '@/components/slides/slide-card'
import { UploadSlideDialog } from '@/components/slides/upload-slide-dialog'
import { EditSlideDialog } from '@/components/slides/edit-slide-dialog'
import type { Slide } from '@/components/slides/slide-card'

type StatusFilter = 'all' | 'standard' | 'mandatory' | 'deprecated'

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

  const fetchSlides = useCallback(async () => {
    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
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

  async function handleDelete() {
    if (!deleteSlide) return
    setDeleting(true)
    try {
      const supabase = createBrowserSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
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
          <h1 className="text-2xl font-semibold tracking-tight">{t('admin.slide_library')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('admin.slide_library_description')}
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="mr-2 h-4 w-4" />
          {t('admin.upload_slide')}
        </Button>
      </div>

      {/* Filter tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
        <TabsList>
          <TabsTrigger value="all">{t('admin.all')} ({counts.all})</TabsTrigger>
          <TabsTrigger value="standard">{t('admin.standard')} ({counts.standard})</TabsTrigger>
          <TabsTrigger value="mandatory">{t('admin.mandatory')} ({counts.mandatory})</TabsTrigger>
          <TabsTrigger value="deprecated">{t('admin.deprecated')} ({counts.deprecated})</TabsTrigger>
        </TabsList>
      </Tabs>

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
            {filter === 'all' ? t('admin.no_slides_yet') : t('admin.no_filtered_slides', { filter })}
          </p>
          {filter === 'all' && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('admin.upload_first_pptx')}
            </p>
          )}
          {filter === 'all' && (
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setUploadOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              {t('admin.upload_slide')}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((slide) => (
            <SlideCard
              key={slide.id}
              slide={slide}
              onEdit={setEditSlide}
              onDelete={setDeleteSlide}
            />
          ))}
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
            setUploadOpen(false)
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
    </>
  )
}
