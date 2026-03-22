'use client'

import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  Archive,
  LayoutTemplate,
  Lock,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface Slide {
  id: string
  tenant_id: string
  title: string
  status: 'standard' | 'mandatory' | 'deprecated'
  tags: string[]
  pptx_url: string | null
  thumbnail_url: string | null
  editable_fields: EditableField[]
  detected_fields?: DetectedFieldConfig[]
  pptx_updated_at: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  page_index?: number | null
  page_count?: number | null
  source_filename?: string | null
  thumbnail_status?: string | null
  thumbnail_error?: string | null
  archived_at?: string | null
}

export interface EditableField {
  id: string
  label: string
  placeholder: string
  required: boolean
  bounds?: { x: number; y: number; w: number; h: number }
}

export interface DetectedFieldConfig {
  id: string
  label: string
  placeholder: string
  shapeName: string
  phType: string | null
  editable_state: 'locked' | 'optional' | 'required'
  /** Shape position on slide as percentage (0-100) for thumbnail highlighting */
  bounds?: { x: number; y: number; w: number; h: number }
}

interface SlideCardProps {
  slide: Slide
  onEdit: (slide: Slide) => void
  onDelete: (slide: Slide) => void
  onUnarchive?: (slide: Slide) => void
  selected?: boolean
  onSelectChange?: (selected: boolean) => void
}

function StatusBadge({ status, isArchived }: { status: Slide['status']; isArchived?: boolean }) {
  const { t } = useTranslation()
  if (isArchived) {
    return (
      <Badge
        variant="outline"
        className="gap-1 text-xs border-amber-500 text-amber-600 dark:text-amber-400"
      >
        <Archive className="h-3 w-3" />
        {t('admin.archived_slides')}
      </Badge>
    )
  }
  if (status === 'mandatory') {
    return (
      <Badge variant="default" className="gap-1 text-xs">
        <Lock className="h-3 w-3" />
        Mandatory
      </Badge>
    )
  }
  if (status === 'deprecated') {
    return (
      <Badge variant="destructive" className="gap-1 text-xs">
        <AlertTriangle className="h-3 w-3" />
        Deprecated
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="text-xs">
      Standard
    </Badge>
  )
}

export function SlideCard({
  slide,
  onEdit,
  onDelete,
  onUnarchive,
  selected,
  onSelectChange,
}: SlideCardProps) {
  const { t } = useTranslation()
  const isArchived = !!slide.archived_at

  return (
    <Card
      className={`group overflow-hidden ${selected ? 'ring-2 ring-primary' : ''} ${isArchived ? 'opacity-70' : ''}`}
    >
      {/* Thumbnail area */}
      <div className="relative aspect-video bg-muted flex items-center justify-center border-b">
        {onSelectChange !== undefined && (
          <div className="absolute left-2 top-2 z-10">
            <Checkbox
              checked={selected}
              onCheckedChange={(checked) => onSelectChange(checked === true)}
              className="h-5 w-5 border-2 bg-background/80 backdrop-blur-sm"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
        {slide.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slide.thumbnail_url}
            alt={slide.title}
            className={`h-full w-full object-cover ${isArchived ? 'grayscale' : ''}`}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <LayoutTemplate className="h-10 w-10" />
            <span className="text-xs">.pptx</span>
          </div>
        )}
        {slide.status === 'deprecated' && !isArchived && (
          <div className="absolute inset-0 bg-destructive/10" />
        )}
        {isArchived && <div className="absolute inset-0 bg-muted/30" />}
      </div>

      <CardContent className="p-3 pb-2">
        <p className="truncate text-sm font-medium leading-tight" title={slide.title}>
          {slide.title}
        </p>
        {slide.editable_fields.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {slide.editable_fields.length} editable field
            {slide.editable_fields.length !== 1 ? 's' : ''}
          </p>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-between p-3 pt-0">
        <StatusBadge status={slide.status} isArchived={isArchived} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Slide actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!isArchived && (
              <DropdownMenuItem onClick={() => onEdit(slide)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
            )}
            {isArchived && onUnarchive && (
              <DropdownMenuItem onClick={() => onUnarchive(slide)}>
                <RotateCcw className="mr-2 h-4 w-4" />
                {t('admin.unarchive_slide')}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(slide)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {isArchived ? t('admin.permanent_delete_button') : 'Delete'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardFooter>
    </Card>
  )
}
