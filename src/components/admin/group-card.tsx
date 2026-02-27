'use client'

import { useEffect, useRef, useState } from 'react'
import { GripVertical, Layers, Pencil, Trash2 } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
import { Input } from '@/components/ui/input'
import type { SlideGroup } from './manage-slides-dialog'

interface GroupCardProps {
  group: SlideGroup
  slideCount: number
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onManageSlides: (group: SlideGroup) => void
}

export function GroupCard({ group, slideCount, onRename, onDelete, onManageSlides }: GroupCardProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: group.id })

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function commitRename() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === group.name) { setEditing(false); setName(group.name); return }
    await onRename(group.id, trimmed)
    setEditing(false)
  }

  async function handleDelete() {
    setDeleting(true)
    await onDelete(group.id)
    setDeleting(false)
    setConfirmDelete(false)
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.4 : 1,
        }}
        className="flex items-center gap-3 rounded-lg border bg-background px-4 py-3"
      >
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-5 w-5" />
        </button>

        <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />

        {/* Name */}
        {editing ? (
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') { setEditing(false); setName(group.name) }
            }}
            className="h-7 flex-1 text-sm"
          />
        ) : (
          <span className="flex-1 text-sm font-medium">{group.name}</span>
        )}

        <Badge variant="secondary" className="shrink-0 text-xs">
          {slideCount} slide{slideCount !== 1 ? 's' : ''}
        </Badge>

        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => onManageSlides(group)}
        >
          Manage slides
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => { setEditing(true) }}
          title="Rename"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => setConfirmDelete(true)}
          title="Delete group"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete group?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{group.name}</strong> will be deleted. Its {slideCount} slide{slideCount !== 1 ? 's' : ''} will
              move to Ungrouped. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete group'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
