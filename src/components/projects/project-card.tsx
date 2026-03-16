'use client'

import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Archive,
  ArchiveRestore,
  Copy,
  Loader2,
  LogOut,
  MoreVertical,
  Pencil,
  Trash2,
  Users,
} from 'lucide-react'
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
  variant?: 'active' | 'archived'
  isOwner?: boolean
  onRename?: (id: string, name: string) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  onLeave?: (id: string) => Promise<void>
  onDuplicate?: (id: string) => Promise<void>
  onArchive?: (id: string) => Promise<void>
  onRestore?: (id: string) => Promise<void>
  onDeletePermanently?: (id: string) => Promise<void>
}

function timeAgo(
  dateStr: string,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return t('project_card.today')
  if (days === 1) return t('project_card.yesterday')
  if (days < 7) return t('project_card.days_ago', { count: days })
  const weeks = Math.floor(days / 7)
  if (weeks === 1) return t('project_card.week_ago')
  if (weeks < 5) return t('project_card.weeks_ago', { count: weeks })
  const months = Math.floor(days / 30)
  if (months === 1) return t('project_card.month_ago')
  return t('project_card.months_ago', { count: months })
}

export function ProjectCard({
  project,
  variant = 'active',
  isOwner = true,
  onRename,
  onDelete,
  onLeave,
  onDuplicate,
  onArchive,
  onRestore,
  onDeletePermanently,
}: ProjectCardProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(project.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDeletePermanently, setConfirmDeletePermanently] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const slideCount = project.slide_order.length
  const isArchived = variant === 'archived'

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function commitRename() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === project.name || !onRename) {
      setEditing(false)
      setName(project.name)
      return
    }
    await onRename(project.id, trimmed)
    setEditing(false)
  }

  async function handleDelete() {
    if (!onDelete) return
    setDeleting(true)
    await onDelete(project.id)
    setDeleting(false)
    setConfirmDelete(false)
  }

  async function handleDeletePermanently() {
    if (!onDeletePermanently) return
    setDeleting(true)
    await onDeletePermanently(project.id)
    setDeleting(false)
    setConfirmDeletePermanently(false)
  }

  async function handleLeave() {
    if (!onLeave) return
    setLeaving(true)
    await onLeave(project.id)
    setLeaving(false)
    setConfirmLeave(false)
  }

  async function handleDuplicate() {
    if (!onDuplicate || duplicating) return
    setDuplicating(true)
    try {
      await onDuplicate(project.id)
    } finally {
      setDuplicating(false)
    }
  }

  async function handleArchive() {
    if (!onArchive || archiving) return
    setArchiving(true)
    try {
      await onArchive(project.id)
    } finally {
      setArchiving(false)
    }
  }

  async function handleRestore() {
    if (!onRestore || restoring) return
    setRestoring(true)
    try {
      await onRestore(project.id)
    } finally {
      setRestoring(false)
    }
  }

  function handleCardClick(e: React.MouseEvent) {
    if (editing || isArchived) return
    const target = e.target as HTMLElement
    if (target.closest('[data-no-nav]')) return
    router.push(`/board?project=${project.id}`)
  }

  return (
    <>
      <div
        onClick={handleCardClick}
        className={`group relative flex flex-col gap-3 rounded-lg border bg-background p-4 shadow-sm transition-all ${
          isArchived
            ? 'opacity-75 hover:opacity-100'
            : 'hover:shadow-md hover:border-primary/40 cursor-pointer'
        }`}
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
                if (e.key === 'Escape') {
                  setEditing(false)
                  setName(project.name)
                }
              }}
              className="h-7 flex-1 text-sm font-semibold"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <p className="flex-1 text-sm font-semibold leading-tight line-clamp-2">
              {project.name}
            </p>
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
              {/* Active project actions */}
              {!isArchived && isOwner && onRename && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditing(true)
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  {t('project_card.rename')}
                </DropdownMenuItem>
              )}
              {!isArchived && onDuplicate && (
                <DropdownMenuItem
                  disabled={duplicating}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDuplicate()
                  }}
                >
                  {duplicating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
                  )}
                  {duplicating ? t('project_card.duplicating') : t('project_card.duplicate')}
                </DropdownMenuItem>
              )}
              {!isArchived && isOwner && onArchive && (
                <DropdownMenuItem
                  disabled={archiving}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleArchive()
                  }}
                >
                  {archiving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Archive className="mr-2 h-4 w-4" />
                  )}
                  {archiving ? t('project_card.archiving') : t('project_card.archive')}
                </DropdownMenuItem>
              )}
              {!isArchived && isOwner && onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      setConfirmDelete(true)
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('project_card.delete')}
                  </DropdownMenuItem>
                </>
              )}
              {!isArchived && !isOwner && onLeave && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      setConfirmLeave(true)
                    }}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    {t('project_card.leave_project')}
                  </DropdownMenuItem>
                </>
              )}

              {/* Archived project actions */}
              {isArchived && onRestore && (
                <DropdownMenuItem
                  disabled={restoring}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRestore()
                  }}
                >
                  {restoring ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ArchiveRestore className="mr-2 h-4 w-4" />
                  )}
                  {restoring ? t('project_card.restoring') : t('project_card.restore')}
                </DropdownMenuItem>
              )}
              {isArchived && onDeletePermanently && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      setConfirmDeletePermanently(true)
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('project_card.delete_permanently')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-xs">
              {t('project_card.slides', { count: slideCount })}
            </Badge>
            {isArchived && (
              <Badge variant="outline" className="text-xs gap-1">
                <Archive className="h-3 w-3" />
                {t('project_card.archived_badge')}
              </Badge>
            )}
            {!isOwner && !isArchived && (
              <Badge variant="outline" className="text-xs gap-1">
                <Users className="h-3 w-3" />
                {t('project_card.shared_badge')}
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{timeAgo(project.updated_at, t)}</span>
        </div>
      </div>

      {/* Delete confirmation (active owner only) */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('project_card.delete_confirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('project_card.delete_confirm_message', { name: project.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('create_project.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t('project_card.deleting') : t('project_card.delete_confirm_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete permanently confirmation (archived only) */}
      <AlertDialog open={confirmDeletePermanently} onOpenChange={setConfirmDeletePermanently}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('project_card.delete_permanently_confirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('project_card.delete_permanently_message', { name: project.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('create_project.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePermanently}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t('project_card.deleting') : t('project_card.delete_permanently_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave confirmation (shared user only) */}
      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('project_card.leave_confirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('project_card.leave_confirm_message', { name: project.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaving}>{t('create_project.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeave}
              disabled={leaving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {leaving ? t('project_card.deleting') : t('project_card.leave_confirm_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
