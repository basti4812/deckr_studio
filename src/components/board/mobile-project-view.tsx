'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Monitor, Play, StickyNote } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MobileSlideDetail } from './mobile-slide-detail'
import type { TrayItem } from '@/components/board/tray-panel'
import type { Slide } from '@/components/slides/slide-card'
import type { PersonalSlideRecord } from '@/components/board/upload-personal-slide-dialog'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MobileProjectViewProps {
  projectId: string
  projectName: string
  trayItems: TrayItem[]
  slideMap: Map<string, Slide>
  personalSlidesMap: Map<string, PersonalSlideRecord>
  notesExist: Record<string, boolean>
  onPresent: () => void
  onNoteChange?: (slideId: string, hasNote: boolean) => void
  loading?: boolean
}

interface SlideRow {
  trayId: string
  slideId: string
  title: string
  thumbnailUrl: string | null
  status?: 'standard' | 'mandatory' | 'deprecated'
  hasNote: boolean
  isPersonal: boolean
}

// ---------------------------------------------------------------------------
// MobileProjectView
// ---------------------------------------------------------------------------

export function MobileProjectView({
  projectId,
  projectName,
  trayItems,
  slideMap,
  personalSlidesMap,
  notesExist,
  onPresent,
  onNoteChange,
  loading,
}: MobileProjectViewProps) {
  const { t } = useTranslation()
  const [selectedTrayId, setSelectedTrayId] = useState<string | null>(null)

  // Build the flat list of rows from tray items
  const rows: SlideRow[] = trayItems.flatMap((item): SlideRow[] => {
    if (item.is_personal && item.personal_slide_id) {
      const ps = personalSlidesMap.get(item.personal_slide_id)
      if (!ps) return []
      return [{
        trayId: item.id,
        slideId: ps.id,
        title: ps.title,
        thumbnailUrl: null,
        status: undefined,
        hasNote: false,
        isPersonal: true,
      }]
    }
    const slide = slideMap.get(item.slide_id)
    if (!slide) return []
    return [{
      trayId: item.id,
      slideId: slide.id,
      title: slide.title,
      thumbnailUrl: slide.thumbnail_url,
      status: slide.status,
      hasNote: notesExist[slide.id] ?? false,
      isPersonal: false,
    }]
  })

  const selectedRow = rows.find((r) => r.trayId === selectedTrayId) ?? null

  return (
    <div className="flex flex-col min-h-0 flex-1 md:hidden">
      {/* Desktop editing banner */}
      <div className="flex items-center gap-2 bg-muted/60 px-4 py-2.5 border-b">
        <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{t('board.desktop_editing_banner')}</p>
      </div>

      {/* Project header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h1 className="font-semibold text-sm truncate max-w-[200px]">{projectName}</h1>
          <p className="text-xs text-muted-foreground">
            {t('board.slide_count', { count: rows.length })}
          </p>
        </div>
        {rows.length > 0 && (
          <Button size="sm" className="gap-1.5" onClick={onPresent}>
            <Play className="h-3.5 w-3.5" />
            {t('board.present')}
          </Button>
        )}
      </div>

      {/* Slide list */}
      {loading ? (
        <div className="flex flex-col gap-0 flex-1 overflow-y-auto divide-y">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="w-16 h-10 rounded bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-muted animate-pulse rounded w-3/4" />
                <div className="h-2.5 bg-muted animate-pulse rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">{t('board.no_slides_yet')}</p>
        </div>
      ) : (
        <div className="flex flex-col flex-1 overflow-y-auto divide-y">
          {rows.map((row, index) => (
            <button
              key={row.trayId}
              className="flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/40 active:bg-accent/60 transition-colors min-h-[44px] w-full"
              onClick={() => setSelectedTrayId(row.trayId)}
            >
              {/* Slide number */}
              <span className="text-[10px] text-muted-foreground w-5 shrink-0 text-right">
                {index + 1}
              </span>

              {/* Thumbnail */}
              {row.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.thumbnailUrl}
                  alt={row.title}
                  className="w-16 h-10 object-cover rounded border bg-muted shrink-0"
                />
              ) : (
                <div className="w-16 h-10 rounded border bg-muted shrink-0 flex items-center justify-center">
                  <span className="text-[8px] text-muted-foreground">—</span>
                </div>
              )}

              {/* Title + badges */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{row.title}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {row.status === 'mandatory' && (
                    <Badge variant="default" className="text-[9px] px-1 py-0 h-4">
                      {t('board.mandatory')}
                    </Badge>
                  )}
                  {row.status === 'deprecated' && (
                    <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">
                      {t('board.deprecated')}
                    </Badge>
                  )}
                  {row.isPersonal && (
                    <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                      {t('nav.personal_workspace')}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Note indicator */}
              {row.hasNote && (
                <StickyNote
                  className="h-4 w-4 text-muted-foreground shrink-0"
                  aria-label={t('board.note_indicator')}
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Slide detail sheet */}
      {selectedRow && (
        <MobileSlideDetail
          open={selectedTrayId !== null}
          onClose={() => setSelectedTrayId(null)}
          projectId={projectId}
          slideId={selectedRow.slideId}
          slideTitle={selectedRow.title}
          thumbnailUrl={selectedRow.thumbnailUrl}
          status={selectedRow.status}
          isPersonal={selectedRow.isPersonal}
          onNoteChange={onNoteChange}
        />
      )}
    </div>
  )
}
