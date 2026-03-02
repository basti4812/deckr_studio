'use client'

import { AlertTriangle, LayoutTemplate, Lock, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
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
  pptx_updated_at: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface EditableField {
  id: string
  label: string
  placeholder: string
  required: boolean
}

interface SlideCardProps {
  slide: Slide
  onEdit: (slide: Slide) => void
  onDelete: (slide: Slide) => void
}

function StatusBadge({ status }: { status: Slide['status'] }) {
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

export function SlideCard({ slide, onEdit, onDelete }: SlideCardProps) {
  return (
    <Card className="group overflow-hidden">
      {/* Thumbnail area */}
      <div className="relative aspect-video bg-muted flex items-center justify-center border-b">
        {slide.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slide.thumbnail_url}
            alt={slide.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <LayoutTemplate className="h-10 w-10" />
            <span className="text-xs">.pptx</span>
          </div>
        )}
        {slide.status === 'deprecated' && (
          <div className="absolute inset-0 bg-destructive/10" />
        )}
      </div>

      <CardContent className="p-3 pb-2">
        <p className="truncate text-sm font-medium leading-tight" title={slide.title}>
          {slide.title}
        </p>
        {slide.editable_fields.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {slide.editable_fields.length} editable field{slide.editable_fields.length !== 1 ? 's' : ''}
          </p>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-between p-3 pt-0">
        <StatusBadge status={slide.status} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Slide actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(slide)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(slide)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardFooter>
    </Card>
  )
}
