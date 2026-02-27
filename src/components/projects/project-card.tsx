'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreVertical, Pencil, Trash2 } from 'lucide-react'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'

export interface Project {
  id: string
  name: string
  slide_order: { id: string; slide_id: string }[]
  status: 'active' | 'archived'
  created_at: string
  updated_at: string
}

interface ProjectCardProps {
  project: Project
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  const weeks = Math.floor(days / 7)
  if (weeks === 1) return '1 week ago'
  if (weeks < 5) return `${weeks} weeks ago`
  const months = Math.floor(days / 30)
  if (months === 1) return '1 month ago'
  return `${months} months ago`
}

export function ProjectCard({ project, onRename, onDelete }: ProjectCardProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(project.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const slideCount = project.slide_order.length

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function commitRename() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === project.name) {
      setEditing(false)
      setName(project.name)
      return
    }
    await onRename(project.id, trimmed)
    setEditing(false)
  }

  async function handleDelete() {
    setDeleting(true)
    await onDelete(project.id)
    setDeleting(false)
    setConfirmDelete(false)
  }

  function handleCardClick(e: React.MouseEvent) {
    if (editing) return
    const target = e.target as HTMLElement
    if (target.closest('[data-no-nav]')) return
    router.push(`/board?project=${project.id}`)
  }

  return (
    <>
      <div
        onClick={handleCardClick}
        className="group relative flex flex-col gap-3 rounded-lg border bg-background p-4 shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer"
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          {editing ? (
            <Input
              ref={inputRef}
              data-no-nav
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') { setEditing(false); setName(project.name) }
              }}
              className="h-7 flex-1 text-sm font-semibold"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <p className="flex-1 text-sm font-semibold leading-tight line-clamp-2">{project.name}</p>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                data-no-nav
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditing(true) }}>
                <Pencil className="mr-2 h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-xs">
            {slideCount} slide{slideCount !== 1 ? 's' : ''}
          </Badge>
          <span className="text-xs text-muted-foreground">{timeAgo(project.updated_at)}</span>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{project.name}</strong> will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete project'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
