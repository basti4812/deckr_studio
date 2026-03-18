'use client'

import { useTranslation } from 'react-i18next'
import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FolderOpen,
  Link2,
  Play,
  Save,
  Upload,
  Users,
} from 'lucide-react'
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
} from '@dnd-kit/sortable'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { TraySlideItem } from '@/components/board/tray-slide-item'
import { PersonalTraySlideItem } from '@/components/board/personal-tray-slide-item'
import type { Slide } from '@/components/slides/slide-card'
import type { PersonalSlideRecord } from '@/components/board/upload-personal-slide-dialog'

export interface TrayItem {
  id: string // instance UUID (allows same slide twice)
  slide_id: string
  is_personal?: boolean
  personal_slide_id?: string
}

interface TrayPanelProps {
  projectId: string | null
  projectName: string
  projectUpdatedAt?: string | null
  trayItems: TrayItem[]
  slideMap: Map<string, Slide>
  personalSlidesMap: Map<string, PersonalSlideRecord>
  textEdits: Record<string, Record<string, string>>
  commentCounts?: Record<string, number>
  notesExist?: Record<string, boolean>
  loading: boolean
  collapsed: boolean
  deprecatedError: string
  onCollapse: () => void
  onReorder?: (items: TrayItem[]) => void
  onRemove?: (instanceId: string) => void
  onEditFields?: (instanceId: string) => void
  onComment?: (instanceId: string, slideId: string, instanceIndex: number) => void
  onNote?: (instanceId: string, slideId: string) => void
  onExport?: () => void
  onPdfExport?: () => void
  onPresent?: () => void
  onUploadPersonalSlide?: () => void
  onSaveVersion?: () => void
  onShareLink?: () => void
  onManageAccess?: () => void
  previewUrls?: Record<string, string>
}

export function TrayPanel({
  projectId,
  projectName,
  projectUpdatedAt,
  trayItems,
  slideMap,
  personalSlidesMap,
  textEdits,
  commentCounts,
  notesExist,
  loading,
  collapsed,
  deprecatedError,
  onCollapse,
  onReorder,
  onRemove,
  onEditFields,
  onComment,
  onNote,
  onExport,
  onPdfExport,
  onPresent,
  onUploadPersonalSlide,
  onSaveVersion,
  onShareLink,
  onManageAccess,
  previewUrls,
}: TrayPanelProps) {
  const { t } = useTranslation()
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    if (!onReorder) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = trayItems.findIndex((t) => t.id === active.id)
    const newIndex = trayItems.findIndex((t) => t.id === over.id)
    onReorder(arrayMove(trayItems, oldIndex, newIndex))
  }

  // Collapsed state — thin strip
  if (collapsed) {
    return (
      <div className="flex w-10 flex-col items-center border-l bg-background py-3 gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onCollapse}
          title={t('tray.expand')}
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
            {projectId ? (
              <p className="truncate text-sm font-semibold leading-tight">
                {projectName || t('tray.project')}
              </p>
            ) : (
              <p className="text-sm font-semibold">{t('tray.title')}</p>
            )}
            {projectId && (
              <p className="text-xs text-muted-foreground">
                {t('tray.slide_count', { count: trayItems.length })}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={onCollapse}
            title={t('tray.collapse')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Action buttons — only shown when a project is open */}
        {projectId &&
          (onPresent ||
            onExport ||
            onUploadPersonalSlide ||
            onSaveVersion ||
            onShareLink ||
            onManageAccess) && (
            <TooltipProvider delayDuration={300}>
              <div className="flex gap-1">
                {onUploadPersonalSlide && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={onUploadPersonalSlide}
                      >
                        <Upload className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('tray.upload_personal_slide')}</TooltipContent>
                  </Tooltip>
                )}
                {onSaveVersion && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={onSaveVersion}
                        disabled={trayItems.length === 0}
                      >
                        <Save className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {trayItems.length === 0
                        ? t('tray.add_slides_to_save')
                        : t('tray.save_named_version')}
                    </TooltipContent>
                  </Tooltip>
                )}
                {onPresent && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={onPresent}
                        disabled={trayItems.length === 0}
                      >
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {trayItems.length === 0 ? t('tray.add_slides_to_present') : t('tray.present')}
                    </TooltipContent>
                  </Tooltip>
                )}
                {(onExport || onPdfExport) && (
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            disabled={trayItems.length === 0}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
                        {trayItems.length === 0 ? t('tray.add_slides_to_export') : t('tray.export')}
                      </TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="end" className="w-56">
                      {onExport && (
                        <DropdownMenuItem onClick={onExport}>
                          <div>
                            <div>{t('tray.export_pptx')}</div>
                            <div className="text-xs text-muted-foreground">
                              {t('tray.export_pptx_desc')}
                            </div>
                          </div>
                        </DropdownMenuItem>
                      )}
                      {onPdfExport && (
                        <DropdownMenuItem onClick={onPdfExport}>
                          <div>
                            <div>{t('tray.export_pdf')}</div>
                            <div className="text-xs text-muted-foreground">
                              {t('tray.export_pdf_desc')}
                            </div>
                          </div>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {onManageAccess && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={onManageAccess}
                      >
                        <Users className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('tray.manage_access_tooltip')}</TooltipContent>
                  </Tooltip>
                )}
                {onShareLink && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={onShareLink}
                        disabled={trayItems.length === 0}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {trayItems.length === 0
                        ? t('tray.add_slides_to_share')
                        : t('tray.share_link_tooltip')}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </TooltipProvider>
          )}
      </div>

      {/* Deprecated error */}
      {deprecatedError && (
        <p className="mx-3 mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          {deprecatedError}
        </p>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-2">
        {!projectId ? (
          /* No project open */
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <FolderOpen className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground px-4">{t('tray.open_project_hint')}</p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/projects">{t('tray.open_project')}</Link>
            </Button>
          </div>
        ) : loading ? (
          <div className="space-y-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : trayItems.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">{t('tray.no_slides')}</p>
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
                {trayItems.map((item, index) => {
                  // Personal slide
                  if (item.is_personal && item.personal_slide_id) {
                    const personalSlide = personalSlidesMap.get(item.personal_slide_id)
                    if (!personalSlide) return null
                    return (
                      <PersonalTraySlideItem
                        key={item.id}
                        instanceId={item.id}
                        personalSlide={personalSlide}
                        onRemove={onRemove}
                      />
                    )
                  }

                  // Library slide
                  const slide = slideMap.get(item.slide_id)
                  if (!slide) return null
                  const isMandatory = slide.status === 'mandatory'
                  return (
                    <TraySlideItem
                      key={item.id}
                      instanceId={item.id}
                      slide={slide}
                      isMandatory={isMandatory}
                      instanceEdits={textEdits[item.id] ?? {}}
                      projectUpdatedAt={projectUpdatedAt}
                      previewUrl={previewUrls?.[item.id]}
                      commentCount={commentCounts?.[item.slide_id] ?? 0}
                      hasNote={notesExist?.[item.slide_id] ?? false}
                      onRemove={onRemove}
                      onEditFields={onEditFields ? () => onEditFields(item.id) : undefined}
                      onComment={
                        onComment ? () => onComment(item.id, item.slide_id, index) : undefined
                      }
                      onNote={onNote ? () => onNote(item.id, item.slide_id) : undefined}
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
