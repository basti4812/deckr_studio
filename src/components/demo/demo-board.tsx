'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderOpen,
  GripVertical,
  LayoutTemplate,
  Lock,
  Play,
  Share2,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCanvas } from '@/hooks/use-canvas'
import { CanvasSlideCard, CARD_WIDTH } from '@/components/board/canvas-slide-card'
import { ZoomControls } from '@/components/board/zoom-controls'
import { SearchFilterBar } from '@/components/board/search-filter-bar'
import { FilterPanel, type ActiveFilters } from '@/components/board/filter-panel'
import { SimulatedExportDialog } from '@/components/demo/simulated-export-dialog'
import { SimulatedShareDialog } from '@/components/demo/simulated-share-dialog'
import {
  DEMO_GROUPS,
  ALL_DEMO_SLIDES,
  DEMO_SLIDE_MAP,
  DEMO_TAGS,
  DEMO_GROUP_NAMES,
  INITIAL_TRAY_ITEMS,
  type DemoTrayItem,
  type DemoGroup,
} from '@/lib/demo-data'
import type { Slide } from '@/components/slides/slide-card'

// ---------------------------------------------------------------------------
// Layout constants (matching real board)
// ---------------------------------------------------------------------------

const COLS = 5
const CARD_HEIGHT = 185
const GAP = 24
const PADDING = 48
const SECTION_HEADER = 36 + 12
const BETWEEN_GROUPS = 40

function calcGroupHeight(slideCount: number) {
  if (slideCount === 0) return SECTION_HEADER + 60
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
// DemoTraySlideItem — simplified tray item without features like comments/notes
// ---------------------------------------------------------------------------

function DemoTraySlideItem({
  instanceId,
  slide,
  onRemove,
}: {
  instanceId: string
  slide: Slide
  onRemove: (id: string) => void
}) {
  const { t } = useTranslation()
  const isMandatory = slide.status === 'mandatory'
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: instanceId,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 group"
    >
      {/* Drag handle */}
      {isMandatory ? (
        <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
      ) : (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Thumbnail */}
      <div className="flex h-8 w-14 shrink-0 items-center justify-center rounded bg-muted overflow-hidden">
        {slide.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slide.thumbnail_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <LayoutTemplate className="h-3.5 w-3.5 text-muted-foreground/50" />
        )}
      </div>

      {/* Title */}
      <span className="flex-1 min-w-0 truncate text-xs leading-tight" title={slide.title}>
        {slide.title}
      </span>

      {/* Status badges */}
      {isMandatory && (
        <Badge variant="default" className="text-[10px] h-4 px-1.5 shrink-0">
          {t('board.mandatory')}
        </Badge>
      )}

      {/* Remove (not for mandatory slides) */}
      {!isMandatory && (
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
          onClick={() => onRemove(instanceId)}
          title="Remove from tray"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DemoTrayPanel — simplified tray panel for the demo
// ---------------------------------------------------------------------------

function DemoTrayPanel({
  trayItems,
  collapsed,
  onCollapse,
  onReorder,
  onRemove,
  onExport,
  onPdfExport,
  onPresent,
  onShare,
}: {
  trayItems: DemoTrayItem[]
  collapsed: boolean
  onCollapse: () => void
  onReorder: (items: DemoTrayItem[]) => void
  onRemove: (id: string) => void
  onExport: () => void
  onPdfExport: () => void
  onPresent: () => void
  onShare: () => void
}) {
  const { t } = useTranslation()
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = trayItems.findIndex((t) => t.id === active.id)
    const newIndex = trayItems.findIndex((t) => t.id === over.id)
    onReorder(arrayMove(trayItems, oldIndex, newIndex))
  }

  if (collapsed) {
    return (
      <div className="flex w-10 flex-col items-center border-l bg-background py-3 gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onCollapse}
          title="Expand tray"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex w-72 flex-col border-l bg-background">
      {/* Header */}
      <div className="flex flex-col border-b px-3 py-2.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{t('demo.demo_project')}</p>
            <p className="text-xs text-muted-foreground">
              {trayItems.length} slide{trayItems.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={onCollapse}
            title="Collapse tray"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5"
            onClick={onShare}
            disabled={trayItems.length === 0}
            title="Share"
          >
            <Share2 className="h-3.5 w-3.5" />
            {t('board.share')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5"
            onClick={onPresent}
            disabled={trayItems.length === 0}
            title={
              trayItems.length === 0 ? t('board.add_slides_to_present') : t('board.present_tooltip')
            }
          >
            <Play className="h-3.5 w-3.5" />
            {t('board.present')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5"
                disabled={trayItems.length === 0}
                title={
                  trayItems.length === 0
                    ? t('board.add_slides_to_export')
                    : t('board.export_tooltip')
                }
              >
                <Download className="h-3.5 w-3.5" />
                {t('board.export')}
                <ChevronDown className="h-3 w-3 ml-auto" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={onExport}>
                <div>
                  <div>{t('board.export_pptx')}</div>
                  <div className="text-xs text-muted-foreground">{t('board.export_pptx_desc')}</div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onPdfExport}>
                <div>
                  <div>{t('board.export_pdf')}</div>
                  <div className="text-xs text-muted-foreground">{t('board.export_pdf_desc')}</div>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tray body */}
      <div className="flex-1 overflow-y-auto p-2">
        {trayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <FolderOpen className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground px-4">{t('board.click_slide_to_add')}</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={trayItems.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1.5">
                {trayItems.map((item) => {
                  const slide = DEMO_SLIDE_MAP.get(item.slide_id)
                  if (!slide) return null
                  return (
                    <DemoTraySlideItem
                      key={item.id}
                      instanceId={item.id}
                      slide={slide}
                      onRemove={onRemove}
                    />
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DemoGroupSection — reuses CanvasSlideCard, no edit/delete controls
// ---------------------------------------------------------------------------

function DemoGroupSection({
  group,
  filteredSlides,
  x,
  y,
  onAddToTray,
}: {
  group: DemoGroup
  filteredSlides: Slide[]
  x: number
  y: number
  onAddToTray: (slide: Slide) => void
}) {
  return (
    <div style={{ position: 'absolute', left: x, top: y }}>
      {/* Section label */}
      <div style={{ marginBottom: 12 }} className="flex items-center gap-3">
        <span className="text-sm font-semibold text-foreground/70 uppercase tracking-wider whitespace-nowrap">
          {group.name}
        </span>
        <div className="flex-1 h-px bg-border" style={{ minWidth: 40 }} />
        <span className="text-xs text-muted-foreground">{filteredSlides.length}</span>
      </div>

      {/* Slides grid */}
      {filteredSlides.length === 0 ? (
        <div
          style={{ width: COLS * CARD_WIDTH + (COLS - 1) * GAP }}
          className="flex items-center justify-center rounded-lg border border-dashed text-muted-foreground text-xs"
        >
          <span className="py-6">No slides match your filters</span>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, ${CARD_WIDTH}px)`,
            gap: GAP,
          }}
        >
          {filteredSlides.map((slide) => (
            <CanvasSlideCard key={slide.id} slide={slide} onAddToTray={onAddToTray} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Simulated presentation overlay (simple slide preview)
// ---------------------------------------------------------------------------

function DemoPresentationMode({ slides, onClose }: { slides: Slide[]; onClose: () => void }) {
  const { t } = useTranslation()
  const [currentIndex, setCurrentIndex] = useState(0)
  const slide = slides[currentIndex]

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose()
    if (e.key === 'ArrowRight' || e.key === ' ') {
      setCurrentIndex((i) => Math.min(i + 1, slides.length - 1))
    }
    if (e.key === 'ArrowLeft') {
      setCurrentIndex((i) => Math.max(i - 1, 0))
    }
  }

  if (!slide) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black"
      tabIndex={0}
      onKeyDown={handleKeyDown}
       
      autoFocus
      role="dialog"
      aria-label="Presentation mode"
    >
      {/* Slide content */}
      <div className="flex flex-1 items-center justify-center px-8 py-12 w-full">
        <div className="relative w-full max-w-4xl aspect-video rounded-lg bg-gray-900 border border-white/10 flex flex-col items-center justify-center gap-4">
          {slide.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slide.thumbnail_url}
              alt={slide.title}
              className="h-full w-full object-contain rounded-lg"
            />
          ) : (
            <>
              <LayoutTemplate className="h-16 w-16 text-white/20" />
              <p className="text-2xl font-bold text-white/80">{slide.title}</p>
              {slide.status === 'mandatory' && (
                <Badge variant="default" className="mt-2">
                  {t('board.mandatory')}
                </Badge>
              )}
            </>
          )}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-between w-full max-w-4xl px-4 pb-6">
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          className="bg-transparent text-white border-white/20 hover:bg-white/10 hover:text-white"
        >
          {t('presentation.exit')}
        </Button>
        <span className="text-sm text-white/60">
          {currentIndex + 1} / {slides.length}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentIndex((i) => Math.max(i - 1, 0))}
            disabled={currentIndex === 0}
            className="bg-transparent text-white border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            {t('common.back')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentIndex((i) => Math.min(i + 1, slides.length - 1))}
            disabled={currentIndex === slides.length - 1}
            className="bg-transparent text-white border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            {t('common.next')}
          </Button>
        </div>
      </div>

      {/* Demo notice */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur rounded-full px-4 py-1.5 text-xs text-white/60">
        {t('demo.demo_presentation_notice')}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DemoBoard — main interactive component
// ---------------------------------------------------------------------------

export function DemoBoard() {
  // Canvas (zoom / pan)
  const viewportRef = useRef<HTMLDivElement>(null)

  const {
    zoom,
    panX,
    panY,
    zoomIn,
    zoomOut,
    fitToScreen,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  } = useCanvas(0.45, viewportRef)

  // Tray state
  const [trayItems, setTrayItems] = useState<DemoTrayItem[]>([...INITIAL_TRAY_ITEMS])
  const [trayCollapsed, setTrayCollapsed] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  )
  const trayIdCounter = useRef(100)

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<ActiveFilters>({ groups: [], tags: [], statuses: [] })

  // Dialogs
  const [exportDialog, setExportDialog] = useState<{ open: boolean; format: 'pptx' | 'pdf' }>({
    open: false,
    format: 'pptx',
  })
  const [shareDialog, setShareDialog] = useState(false)
  const [presentationMode, setPresentationMode] = useState(false)

  // ---------------------------------------------------------------------------
  // Filter logic
  // ---------------------------------------------------------------------------

  const filterCount = filters.groups.length + filters.tags.length + filters.statuses.length

  const filteredGroups = useMemo(() => {
    return DEMO_GROUPS.map((group) => {
      let slides = group.slides

      // Group filter
      if (filters.groups.length > 0 && !filters.groups.includes(group.name)) {
        slides = []
      }

      // Status filter
      if (filters.statuses.length > 0) {
        slides = slides.filter((s) => filters.statuses.includes(s.status))
      }

      // Tag filter
      if (filters.tags.length > 0) {
        slides = slides.filter((s) => s.tags.some((t) => filters.tags.includes(t)))
      }

      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        slides = slides.filter(
          (s) =>
            s.title.toLowerCase().includes(q) || s.tags.some((t) => t.toLowerCase().includes(q))
        )
      }

      return { ...group, filteredSlides: slides }
    })
  }, [searchQuery, filters])

  const totalSlideCount = ALL_DEMO_SLIDES.length
  const filteredSlideCount = filteredGroups.reduce((acc, g) => acc + g.filteredSlides.length, 0)

  // ---------------------------------------------------------------------------
  // World size
  // ---------------------------------------------------------------------------

  const worldSize = useMemo(
    () => calcWorldSize(filteredGroups.map((g) => ({ slides: g.filteredSlides }))),
    [filteredGroups]
  )

  // ---------------------------------------------------------------------------
  // Tray handlers
  // ---------------------------------------------------------------------------

  const handleAddToTray = useCallback((slide: Slide) => {
    trayIdCounter.current++
    const newItem: DemoTrayItem = {
      id: `tray-inst-${trayIdCounter.current}`,
      slide_id: slide.id,
    }
    setTrayItems((prev) => [...prev, newItem])
    // Auto-expand tray when adding slides
    setTrayCollapsed(false)
  }, [])

  const handleRemoveFromTray = useCallback((instanceId: string) => {
    setTrayItems((prev) => prev.filter((t) => t.id !== instanceId))
  }, [])

  const handleReorderTray = useCallback((newItems: DemoTrayItem[]) => {
    setTrayItems(newItems)
  }, [])

  // ---------------------------------------------------------------------------
  // Fit-to-screen
  // ---------------------------------------------------------------------------

  const handleFit = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    fitToScreen(worldSize.w, worldSize.h, el.clientWidth, el.clientHeight)
  }, [fitToScreen, worldSize])

  // ---------------------------------------------------------------------------
  // Presentation mode
  // ---------------------------------------------------------------------------

  const presentationSlides = useMemo(() => {
    return trayItems.map((item) => DEMO_SLIDE_MAP.get(item.slide_id)).filter((s): s is Slide => !!s)
  }, [trayItems])

  // ---------------------------------------------------------------------------
  // Clear all filters
  // ---------------------------------------------------------------------------

  function clearAll() {
    setSearchQuery('')
    setFilters({ groups: [], tags: [], statuses: [] })
    setFilterOpen(false)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <div className="flex h-[calc(100vh-42px)] w-full">
        {/* Main canvas area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top toolbar */}
          <div className="flex items-center gap-3 border-b px-4 py-2">
            <SearchFilterBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              filterCount={filterCount}
              filterOpen={filterOpen}
              onToggleFilter={() => setFilterOpen((v) => !v)}
              resultCount={filteredSlideCount}
              totalCount={totalSlideCount}
              onClearAll={clearAll}
            />
          </div>

          {/* Filter panel overlay */}
          {filterOpen && (
            <div className="absolute left-4 top-[calc(42px+52px)] z-30">
              <FilterPanel
                groups={DEMO_GROUP_NAMES}
                tags={DEMO_TAGS}
                filters={filters}
                onFiltersChange={setFilters}
                onClearFilters={clearAll}
              />
            </div>
          )}

          {/* Canvas viewport */}
          <div
            ref={viewportRef}
            className="relative flex-1 overflow-hidden bg-muted/30 cursor-grab active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {/* Canvas world (transformed) */}
            <div
              style={{
                transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
                transformOrigin: '0 0',
                width: worldSize.w,
                height: worldSize.h,
              }}
            >
              {filteredGroups.map((group, groupIndex) => {
                // Calculate Y position
                let y = PADDING
                for (let i = 0; i < groupIndex; i++) {
                  y += calcGroupHeight(filteredGroups[i].filteredSlides.length) + BETWEEN_GROUPS
                }

                return (
                  <DemoGroupSection
                    key={group.id}
                    group={group}
                    filteredSlides={group.filteredSlides}
                    x={PADDING}
                    y={y}
                    onAddToTray={handleAddToTray}
                  />
                )
              })}
            </div>

            {/* Zoom controls — bottom left */}
            <div className="absolute bottom-4 left-4 z-20">
              <ZoomControls zoom={zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onFit={handleFit} />
            </div>
          </div>
        </div>

        {/* Tray panel — right side */}
        <DemoTrayPanel
          trayItems={trayItems}
          collapsed={trayCollapsed}
          onCollapse={() => setTrayCollapsed((v) => !v)}
          onReorder={handleReorderTray}
          onRemove={handleRemoveFromTray}
          onExport={() => setExportDialog({ open: true, format: 'pptx' })}
          onPdfExport={() => setExportDialog({ open: true, format: 'pdf' })}
          onPresent={() => setPresentationMode(true)}
          onShare={() => setShareDialog(true)}
        />
      </div>

      {/* Simulated dialogs */}
      <SimulatedExportDialog
        open={exportDialog.open}
        onOpenChange={(open) => setExportDialog((prev) => ({ ...prev, open }))}
        format={exportDialog.format}
      />
      <SimulatedShareDialog open={shareDialog} onOpenChange={setShareDialog} />

      {/* Presentation mode */}
      {presentationMode && presentationSlides.length > 0 && (
        <DemoPresentationMode
          slides={presentationSlides}
          onClose={() => setPresentationMode(false)}
        />
      )}
    </>
  )
}
