'use client'

import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileStack, LayoutTemplate } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { createBrowserSupabaseClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TemplateSet {
  id: string
  name: string
  description: string | null
  category: string | null
  cover_image_url: string | null
  slide_count: number
  first_slide_thumbnail: string | null
}

interface TemplateSlide {
  slide_id: string
  position: number
  slide: {
    id: string
    name: string
    status: string
    thumbnail_url: string | null
  }
}

type View = 'name' | 'picker' | 'preview'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const { t } = useTranslation()
  const router = useRouter()

  // Shared state
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [view, setView] = useState<View>('name')

  // Template picker state
  const [templateSets, setTemplateSets] = useState<TemplateSet[]>([])
  const [loadingSets, setLoadingSets] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('All')

  // Template preview state
  const [selectedSet, setSelectedSet] = useState<TemplateSet | null>(null)
  const [previewSlides, setPreviewSlides] = useState<TemplateSlide[]>([])
  const [loadingPreview, setLoadingPreview] = useState(false)

  // Derived: distinct categories from loaded template sets
  const categories = useMemo(() => {
    const cats = new Set(templateSets.map((s) => s.category).filter(Boolean) as string[])
    return ['All', ...Array.from(cats).sort()]
  }, [templateSets])

  // Filtered template sets
  const filteredSets = useMemo(
    () =>
      categoryFilter === 'All'
        ? templateSets
        : templateSets.filter((s) => s.category === categoryFilter),
    [templateSets, categoryFilter]
  )

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  const getAccessToken = useCallback(async () => {
    const supabase = createBrowserSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')
    return session.access_token
  }, [])

  // Load template sets when picker view is entered (skip if already loaded)
  useEffect(() => {
    if (view !== 'picker' || templateSets.length > 0) return
    let cancelled = false

    async function load() {
      setLoadingSets(true)
      try {
        const token = await getAccessToken()
        const res = await fetch('/api/template-sets', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('Failed to load template sets')
        const { templateSets: sets } = await res.json()
        if (!cancelled) setTemplateSets(sets ?? [])
      } catch {
        // Silent — user can still pick "Start from scratch"
      } finally {
        if (!cancelled) setLoadingSets(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [view, getAccessToken])

  // Load slides when a template set is selected for preview
  useEffect(() => {
    if (view !== 'preview' || !selectedSet) return
    let cancelled = false

    async function load() {
      setLoadingPreview(true)
      try {
        const token = await getAccessToken()
        const res = await fetch(`/api/template-sets/${selectedSet!.id}/slides`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('Failed to load slides')
        const { slides } = await res.json()
        if (!cancelled) setPreviewSlides(slides ?? [])
      } catch {
        if (!cancelled) setPreviewSlides([])
      } finally {
        if (!cancelled) setLoadingPreview(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [view, selectedSet, getAccessToken])

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  function handleNext() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('create_project.project_name_error'))
      return
    }
    if (trimmed.length > 120) {
      setError(t('create_project.project_name_too_long'))
      return
    }
    setError('')
    setView('picker')
  }

  async function handleCreate(templateSetId?: string) {
    setCreating(true)
    setError('')

    try {
      const token = await getAccessToken()
      const payload: { name: string; templateSetId?: string } = { name: name.trim() }
      if (templateSetId) payload.templateSetId = templateSetId

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Failed to create project')
      }

      const { project } = await res.json()
      resetAndClose()
      router.push(`/board?project=${project.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setCreating(false)
    }
  }

  function resetAndClose() {
    onOpenChange(false)
    setName('')
    setError('')
    setView('name')
    setTemplateSets([])
    setSelectedSet(null)
    setPreviewSlides([])
    setCategoryFilter('All')
  }

  function handleOpenChange(nextOpen: boolean) {
    if (creating) return
    if (!nextOpen) resetAndClose()
    else onOpenChange(true)
  }

  function handleSelectTemplate(set: TemplateSet) {
    setSelectedSet(set)
    setView('preview')
  }

  function handleBackToPicker() {
    setSelectedSet(null)
    setPreviewSlides([])
    setView('picker')
  }

  function handleBackToName() {
    setView('name')
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={view === 'name' ? 'sm:max-w-md' : 'sm:max-w-2xl'}>
        {/* ---- View 1: Name ---- */}
        {view === 'name' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('create_project.title')}</DialogTitle>
              <DialogDescription>{t('create_project.description')}</DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-2">
              <Label htmlFor="project-name">{t('create_project.project_name')}</Label>
              <Input
                id="project-name"
                placeholder={t('create_project.project_name_placeholder')}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setError('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNext()
                }}
                maxLength={120}
                autoFocus
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                {t('create_project.cancel')}
              </Button>
              <Button onClick={handleNext} disabled={!name.trim()}>
                {t('create_project.next')}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ---- View 2: Template Picker ---- */}
        {view === 'picker' && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBackToName}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={t('create_project.back_to_name')}
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div>
                  <DialogTitle>{t('create_project.choose_template')}</DialogTitle>
                  <DialogDescription>{t('create_project.template_description')}</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {/* Category filter */}
            {categories.length > 1 && (
              <div className="flex flex-wrap gap-1.5 pb-1">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      categoryFilter === cat
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* Template grid */}
            <ScrollArea className="max-h-[400px] pr-3">
              {loadingSets ? (
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-48 rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {/* Start from scratch tile */}
                  <button
                    type="button"
                    onClick={() => handleCreate()}
                    disabled={creating}
                    className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-6 text-center transition-colors hover:border-primary hover:bg-accent"
                  >
                    <FileStack className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {t('create_project.start_from_scratch')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t('create_project.only_mandatory_slides')}
                      </p>
                    </div>
                  </button>

                  {/* Template set cards */}
                  {filteredSets.map((set) => (
                    <TemplatePickerCard
                      key={set.id}
                      templateSet={set}
                      onClick={() => handleSelectTemplate(set)}
                    />
                  ))}
                </div>
              )}

              {!loadingSets && filteredSets.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t('create_project.no_templates')}
                </p>
              )}
            </ScrollArea>

            {error && <p className="text-xs text-destructive">{error}</p>}

            {creating && (
              <div className="flex items-center justify-center py-2">
                <p className="text-sm text-muted-foreground">
                  {t('create_project.creating_project')}
                </p>
              </div>
            )}
          </>
        )}

        {/* ---- View 3: Template Preview ---- */}
        {view === 'preview' && selectedSet && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBackToPicker}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={t('create_project.back_to_templates')}
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div>
                  <DialogTitle>{selectedSet.name}</DialogTitle>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {selectedSet.category && (
                      <Badge variant="secondary" className="text-xs">
                        {selectedSet.category}
                      </Badge>
                    )}
                    <span>
                      {t('create_project.slide_count', { count: selectedSet.slide_count })}
                    </span>
                  </div>
                </div>
              </div>
            </DialogHeader>

            {/* Slide list */}
            <ScrollArea className="max-h-[400px] pr-3">
              {loadingPreview ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="h-16 w-24 shrink-0 rounded" />
                      <Skeleton className="h-5 w-40" />
                    </div>
                  ))}
                </div>
              ) : previewSlides.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t('create_project.template_no_slides')}
                </p>
              ) : (
                <div className="space-y-2">
                  {previewSlides.map((item, index) => (
                    <div
                      key={item.slide_id}
                      className="flex items-center gap-3 rounded-lg border bg-background p-2"
                    >
                      <span className="w-6 shrink-0 text-center text-xs text-muted-foreground">
                        {index + 1}
                      </span>
                      <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded bg-muted">
                        {item.slide.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.slide.thumbnail_url}
                            alt={item.slide.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <LayoutTemplate className="h-5 w-5 text-muted-foreground/30" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 items-center gap-2 overflow-hidden">
                        <span className="truncate text-sm">{item.slide.name}</span>
                        {item.slide.status === 'deprecated' && (
                          <Badge variant="secondary" className="shrink-0 text-[10px] text-warning">
                            {t('create_project.deprecated_badge')}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={handleBackToPicker} disabled={creating}>
                {t('create_project.back')}
              </Button>
              <Button onClick={() => handleCreate(selectedSet.id)} disabled={creating}>
                {creating ? t('create_project.creating') : t('create_project.use_this_template')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// TemplatePickerCard — small card for the picker grid (not the admin card)
// ---------------------------------------------------------------------------

function TemplatePickerCard({
  templateSet,
  onClick,
}: {
  templateSet: TemplateSet
  onClick: () => void
}) {
  const { t } = useTranslation()
  const coverSrc = templateSet.cover_image_url ?? templateSet.first_slide_thumbnail

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col overflow-hidden rounded-lg border bg-background text-left transition-colors hover:border-primary hover:bg-accent"
    >
      {/* Cover image */}
      <div className="relative aspect-video w-full max-h-[140px] bg-muted flex items-center justify-center overflow-hidden">
        {coverSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverSrc} alt={templateSet.name} className="h-full w-full object-cover" />
        ) : (
          <LayoutTemplate className="h-8 w-8 text-muted-foreground/30" />
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col gap-1 p-3">
        <p className="text-sm font-medium leading-snug truncate">{templateSet.name}</p>
        <div className="flex items-center gap-2">
          {templateSet.category && (
            <Badge variant="secondary" className="text-[10px]">
              {templateSet.category}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {t('create_project.slide_count', { count: templateSet.slide_count })}
          </span>
        </div>
        {templateSet.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{templateSet.description}</p>
        )}
      </div>
    </button>
  )
}
