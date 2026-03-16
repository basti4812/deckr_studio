'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, Loader2, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { createBrowserSupabaseClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectVersion {
  id: string
  project_id: string
  label: string | null
  is_auto: boolean
  created_at: string
}

interface VersionHistoryPanelProps {
  open: boolean
  onClose: () => void
  projectId: string
  onRestore: (version: ProjectVersion) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VersionHistoryPanel({
  open,
  onClose,
  projectId,
  onRestore,
}: VersionHistoryPanelProps) {
  const { t } = useTranslation()
  const [versions, setVersions] = useState<ProjectVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const PAGE_SIZE = 20

  const fetchVersions = useCallback(
    async (offset = 0, append = false) => {
      if (!projectId) return
      if (offset === 0) setLoading(true)
      else setLoadingMore(true)
      setError(null)

      try {
        const supabase = createBrowserSupabaseClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) {
          setError(t('version_history.not_authenticated'))
          return
        }

        const res = await fetch(
          `/api/projects/${projectId}/versions?offset=${offset}&limit=${PAGE_SIZE}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        )

        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          setError((d as { error?: string }).error ?? t('version_history.failed_to_load'))
          return
        }

        const d = await res.json()
        const incoming: ProjectVersion[] = d.versions ?? []

        if (append) {
          setVersions((prev) => [...prev, ...incoming])
        } else {
          setVersions(incoming)
        }
        setHasMore(incoming.length === PAGE_SIZE)
      } catch {
        setError(t('version_history.failed_to_load'))
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [projectId]
  )

  // Fetch on open
  useEffect(() => {
    if (open) {
      fetchVersions(0, false)
    }
  }, [open, fetchVersions])

  function handleLoadMore() {
    fetchVersions(versions.length, true)
  }

  function formatDate(iso: string) {
    const date = new Date(iso)
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[380px] sm:w-[420px] flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {t('version_history.title')}
          </SheetTitle>
          <SheetDescription>{t('version_history.description')}</SheetDescription>
        </SheetHeader>

        <Separator />

        <div className="flex-1 overflow-y-auto py-2">
          {/* Loading state */}
          {loading && (
            <div className="space-y-3 px-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div className="flex flex-col items-center gap-3 py-12 px-4 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={() => fetchVersions(0, false)}>
                {t('version_history.try_again')}
              </Button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && versions.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12 px-4 text-center">
              <Clock className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{t('version_history.no_versions')}</p>
              <p className="text-xs text-muted-foreground max-w-[260px]">
                {t('version_history.versions_created_info')}
              </p>
            </div>
          )}

          {/* Version list */}
          {!loading && !error && versions.length > 0 && (
            <div className="space-y-2 px-1">
              {versions.map((version) => (
                <div
                  key={version.id}
                  className="group rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {version.label || t('version_history.unnamed_version')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(version.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={version.is_auto ? 'secondary' : 'default'}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {version.is_auto ? t('version_history.auto') : t('version_history.manual')}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => onRestore(version)}
                      aria-label={t('version_history.restore_aria', {
                        name: version.label || t('version_history.unnamed_version'),
                      })}
                    >
                      <RotateCcw className="h-3 w-3" />
                      {t('version_history.restore')}
                    </Button>
                  </div>
                </div>
              ))}

              {/* Load more */}
              {hasMore && (
                <div className="flex justify-center pt-2 pb-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        {t('common.loading')}
                      </>
                    ) : (
                      t('version_history.load_more')
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
