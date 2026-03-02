'use client'

import { useState } from 'react'
import { LayoutTemplate, Pencil, Trash2 } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export interface TemplateSet {
  id: string
  tenant_id: string
  name: string
  description: string | null
  category: string | null
  cover_image_url: string | null
  created_at: string
  updated_at: string
  slide_count: number
  first_slide_thumbnail: string | null
}

interface Props {
  templateSet: TemplateSet
  onManageSlides: (set: TemplateSet) => void
  onEdit: (set: TemplateSet) => void
  onDelete: (setId: string) => Promise<void>
}

export function TemplateSetCard({ templateSet, onManageSlides, onEdit, onDelete }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const coverSrc = templateSet.cover_image_url ?? templateSet.first_slide_thumbnail

  async function handleDelete() {
    setDeleting(true)
    await onDelete(templateSet.id)
    setDeleting(false)
    setConfirmDelete(false)
  }

  return (
    <>
      <div className="flex flex-col overflow-hidden rounded-lg border bg-background">
        {/* Cover image */}
        <div className="relative aspect-video w-full bg-muted flex items-center justify-center">
          {coverSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverSrc} alt={templateSet.name} className="h-full w-full object-cover" />
          ) : (
            <LayoutTemplate className="h-10 w-10 text-muted-foreground/30" />
          )}
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex items-start gap-2">
            <h3 className="flex-1 text-sm font-semibold leading-snug">{templateSet.name}</h3>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                title="Edit template set"
                onClick={() => onEdit(templateSet)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                title="Delete template set"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {templateSet.category && (
              <Badge variant="secondary" className="text-xs">
                {templateSet.category}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {templateSet.slide_count} slide{templateSet.slide_count !== 1 ? 's' : ''}
            </span>
          </div>

          {templateSet.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{templateSet.description}</p>
          )}

          <div className="mt-auto pt-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => onManageSlides(templateSet)}
            >
              Manage slides
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template set?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{templateSet.name}</strong> will be permanently deleted. Projects created from
              this template set will not be affected. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete template set'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
