'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Mail, MoreHorizontal, RefreshCw, Send, Trash2, UserPlus, XCircle } from 'lucide-react'
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useToast } from '@/hooks/use-toast'
import { createBrowserSupabaseClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeamMember {
  id: string
  display_name: string | null
  email: string
  role: 'admin' | 'employee'
  is_active: boolean
  avatar_url: string | null
  last_active_at: string | null
  created_at: string
  is_pending: boolean
}

interface SeatInfo {
  used: number
  total: number | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(dateStr)
}

async function getAccessToken(): Promise<string | null> {
  const supabase = createBrowserSupabaseClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function TeamManagementPage() {
  const { t } = useTranslation()
  const { userId, loading: userLoading } = useCurrentUser()
  const { toast } = useToast()

  const [members, setMembers] = useState<TeamMember[]>([])
  const [seats, setSeats] = useState<SeatInfo>({ used: 0, total: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog states
  const [inviteOpen, setInviteOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null)
  const [cancelInviteTarget, setCancelInviteTarget] = useState<TeamMember | null>(null)

  // ---------------------------------------------------------------------------
  // Fetch team members
  // ---------------------------------------------------------------------------

  const fetchTeam = useCallback(async () => {
    const token = await getAccessToken()
    if (!token) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/team', {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to fetch team')
      }

      const data = await res.json()
      setMembers(data.members ?? [])
      setSeats(data.seats ?? { used: 0, total: null })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load team members'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!userLoading) {
      fetchTeam()
    }
  }, [userLoading, fetchTeam])

  // ---------------------------------------------------------------------------
  // Check if current user is the last admin
  // ---------------------------------------------------------------------------

  const adminCount = members.filter((m) => m.role === 'admin' && !m.is_pending).length

  const isLastAdmin = (memberId: string) => {
    const member = members.find((m) => m.id === memberId)
    return member?.role === 'admin' && adminCount <= 1
  }

  const isSeatLimitReached = seats.total !== null && seats.used >= seats.total

  // ---------------------------------------------------------------------------
  // Role change handler
  // ---------------------------------------------------------------------------

  async function handleRoleChange(memberId: string, newRole: 'admin' | 'employee') {
    const token = await getAccessToken()
    if (!token) return

    // Optimistic update
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)))

    try {
      const res = await fetch(`/api/users/${memberId}/role`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: newRole }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to update role')
      }

      toast({
        title: 'Role updated',
        description: `Role changed to ${newRole}.`,
      })
    } catch (err) {
      // Revert optimistic update
      fetchTeam()
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to update role',
        variant: 'destructive',
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Remove user handler
  // ---------------------------------------------------------------------------

  async function handleRemoveUser() {
    if (!removeTarget) return

    const token = await getAccessToken()
    if (!token) return

    try {
      const res = await fetch(`/api/team/${removeTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to remove user')
      }

      setMembers((prev) => prev.filter((m) => m.id !== removeTarget.id))
      setSeats((prev) => ({
        ...prev,
        used: Math.max(0, prev.used - (removeTarget.is_pending ? 0 : 1)),
      }))

      toast({
        title: t('admin.user_removed'),
        description: t('admin.user_removed_message', {
          name: removeTarget.display_name ?? removeTarget.email,
        }),
      })
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to remove user',
        variant: 'destructive',
      })
    } finally {
      setRemoveTarget(null)
    }
  }

  // ---------------------------------------------------------------------------
  // Cancel invite handler
  // ---------------------------------------------------------------------------

  async function handleCancelInvite() {
    if (!cancelInviteTarget) return

    const token = await getAccessToken()
    if (!token) return

    try {
      const res = await fetch(`/api/team/${cancelInviteTarget.id}/invite`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to cancel invitation')
      }

      setMembers((prev) => prev.filter((m) => m.id !== cancelInviteTarget.id))

      toast({
        title: t('admin.invitation_cancelled'),
        description: t('admin.invitation_cancelled', { email: cancelInviteTarget.email }),
      })
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to cancel invitation',
        variant: 'destructive',
      })
    } finally {
      setCancelInviteTarget(null)
    }
  }

  // ---------------------------------------------------------------------------
  // Resend invite handler
  // ---------------------------------------------------------------------------

  async function handleResendInvite(member: TeamMember) {
    const token = await getAccessToken()
    if (!token) return

    try {
      const res = await fetch(`/api/team/${member.id}/invite`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to resend invitation')
      }

      const data = await res.json()
      // Update the member with the new ID (resend creates a new auth user)
      if (data.member) {
        setMembers((prev) => prev.map((m) => (m.id === member.id ? data.member : m)))
      }

      toast({
        title: t('admin.invitation_sent'),
        description: t('admin.invitation_sent_to', { email: member.email }),
      })
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to resend invitation',
        variant: 'destructive',
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <TooltipProvider>
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {t('admin.team_management')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('admin.team_management_description')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Seat usage indicator */}
          <div className="text-sm text-muted-foreground">
            {seats.total !== null ? (
              <span>{t('admin.seats_used', { used: seats.used, total: seats.total })}</span>
            ) : (
              <span>{t('admin.seats_used', { used: seats.used, total: null })}</span>
            )}
          </div>

          <Button variant="outline" onClick={() => setInviteOpen(true)} disabled={loading}>
            <Mail className="mr-2 h-4 w-4" />
            {t('admin.invite_member')}
          </Button>
          <Button onClick={() => setCreateOpen(true)} disabled={loading}>
            <UserPlus className="mr-2 h-4 w-4" />
            {t('admin.create_user')}
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
          <Button variant="ghost" size="sm" className="ml-2" onClick={fetchTeam}>
            Retry
          </Button>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[280px]">{t('admin.member')}</TableHead>
                <TableHead>{t('admin.email')}</TableHead>
                <TableHead className="w-[140px]">{t('admin.role')}</TableHead>
                <TableHead className="w-[100px]">{t('admin.status')}</TableHead>
                <TableHead className="w-[120px]">{t('admin.last_active')}</TableHead>
                <TableHead className="w-[120px]">{t('admin.since')}</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-9 w-9 rounded-full" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-8" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : members.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <UserPlus className="h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            {t('admin.no_team_members_yet')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">{t('admin.invite_first_member')}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setInviteOpen(true)}>
            <Mail className="mr-2 h-4 w-4" />
            {t('admin.invite_member')}
          </Button>
        </div>
      ) : (
        /* Team table */
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[280px]">{t('admin.member')}</TableHead>
                <TableHead>{t('admin.email')}</TableHead>
                <TableHead className="w-[140px]">{t('admin.role')}</TableHead>
                <TableHead className="w-[100px]">{t('admin.status')}</TableHead>
                <TableHead className="w-[120px]">{t('admin.last_active')}</TableHead>
                <TableHead className="w-[120px]">{t('admin.since')}</TableHead>
                <TableHead className="w-[60px]">
                  <span className="sr-only">{t('admin.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TeamMemberRow
                  key={member.id}
                  member={member}
                  currentUserId={userId}
                  isLastAdmin={isLastAdmin(member.id)}
                  onRoleChange={handleRoleChange}
                  onRemove={setRemoveTarget}
                  onResendInvite={handleResendInvite}
                  onCancelInvite={setCancelInviteTarget}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Invite Dialog */}
      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        seatLimitReached={isSeatLimitReached}
        onInvited={(newMember) => {
          setMembers((prev) => [newMember, ...prev])
          setInviteOpen(false)
        }}
      />

      {/* Create User Dialog */}
      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        seatLimitReached={isSeatLimitReached}
        onCreated={(newMember) => {
          setMembers((prev) => {
            const pendingCount = prev.filter((m) => m.is_pending).length
            return [...prev.slice(0, pendingCount), newMember, ...prev.slice(pendingCount)]
          })
          setSeats((prev) => ({
            ...prev,
            used: prev.used + (newMember.is_pending ? 0 : 1),
          }))
          setCreateOpen(false)
        }}
      />

      {/* Remove Confirm Dialog */}
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('admin.remove_from_team', {
                name: removeTarget?.display_name ?? removeTarget?.email,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('admin.remove_user_message')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('admin.remove_user_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Invite Confirm Dialog */}
      <AlertDialog
        open={!!cancelInviteTarget}
        onOpenChange={(o) => !o && setCancelInviteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('admin.cancel_invite_for', { email: cancelInviteTarget?.email })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('admin.cancel_invite_message')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('admin.keep_invite')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelInvite}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <XCircle className="mr-2 h-4 w-4" />
              {t('admin.cancel_invite_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
// Team Member Row
// ---------------------------------------------------------------------------

interface TeamMemberRowProps {
  member: TeamMember
  currentUserId: string | null
  isLastAdmin: boolean
  onRoleChange: (memberId: string, newRole: 'admin' | 'employee') => void
  onRemove: (member: TeamMember) => void
  onResendInvite: (member: TeamMember) => void
  onCancelInvite: (member: TeamMember) => void
}

function TeamMemberRow({
  member,
  currentUserId,
  isLastAdmin,
  onRoleChange,
  onRemove,
  onResendInvite,
  onCancelInvite,
}: TeamMemberRowProps) {
  const { t } = useTranslation()
  const isOwnRow = member.id === currentUserId
  const roleDisabled = isOwnRow || (isLastAdmin && member.role === 'admin') || member.is_pending

  return (
    <TableRow>
      {/* Avatar + Name */}
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            {member.avatar_url && (
              <AvatarImage src={member.avatar_url} alt={member.display_name ?? member.email} />
            )}
            <AvatarFallback className="text-xs">
              {getInitials(member.display_name, member.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{member.display_name ?? '---'}</p>
            {isOwnRow && <span className="text-xs text-muted-foreground">({t('admin.you')})</span>}
          </div>
        </div>
      </TableCell>

      {/* Email */}
      <TableCell>
        <span className="text-sm text-muted-foreground">{member.email}</span>
      </TableCell>

      {/* Role dropdown */}
      <TableCell>
        {member.is_pending ? (
          <span className="text-sm text-muted-foreground">{t('nav.employee')}</span>
        ) : roleDisabled ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Select value={member.role} disabled>
                  <SelectTrigger
                    className="h-8 w-[120px]"
                    aria-label={`Role for ${member.display_name ?? member.email}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                </Select>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {isOwnRow ? t('admin.cannot_change_own_role') : t('admin.at_least_one_admin')}
            </TooltipContent>
          </Tooltip>
        ) : (
          <Select
            value={member.role}
            onValueChange={(v) => onRoleChange(member.id, v as 'admin' | 'employee')}
          >
            <SelectTrigger
              className="h-8 w-[120px]"
              aria-label={`Role for ${member.display_name ?? member.email}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">{t('nav.admin')}</SelectItem>
              <SelectItem value="employee">{t('nav.employee')}</SelectItem>
            </SelectContent>
          </Select>
        )}
      </TableCell>

      {/* Status badge */}
      <TableCell>
        {member.is_pending ? (
          <Badge
            variant="outline"
            className="border-amber-500/50 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
          >
            {t('admin.pending')}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-green-500/50 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
          >
            {t('admin.active')}
          </Badge>
        )}
      </TableCell>

      {/* Last active */}
      <TableCell>
        <span className="text-sm text-muted-foreground">
          {formatRelativeDate(member.last_active_at)}
        </span>
      </TableCell>

      {/* Since (join date / invite date) */}
      <TableCell>
        <span className="text-sm text-muted-foreground">{formatDate(member.created_at)}</span>
      </TableCell>

      {/* Actions */}
      <TableCell>
        {member.is_pending ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={`Actions for ${member.email}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onResendInvite(member)}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('admin.resend_invite')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onCancelInvite(member)}
                className="text-destructive focus:text-destructive"
              >
                <XCircle className="mr-2 h-4 w-4" />
                {t('admin.cancel_invite')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : !isOwnRow ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={`Actions for ${member.display_name ?? member.email}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => onRemove(member)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('admin.remove_from_team')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </TableCell>
    </TableRow>
  )
}

// ---------------------------------------------------------------------------
// Invite Dialog
// ---------------------------------------------------------------------------

interface InviteDialogProps {
  open: boolean
  onClose: () => void
  seatLimitReached: boolean
  onInvited: (member: TeamMember) => void
}

function InviteDialog({ open, onClose, seatLimitReached, onInvited }: InviteDialogProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)

  function handleClose() {
    setEmail('')
    setFieldError(null)
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFieldError(null)

    if (!email.trim()) {
      setFieldError('Email is required')
      return
    }

    const token = await getAccessToken()
    if (!token) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'invite', email: email.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.code === 'SEAT_LIMIT_REACHED') {
          setFieldError(data.error)
        } else {
          setFieldError(data.error ?? 'Failed to send invitation')
        }
        return
      }

      toast({
        title: t('admin.invitation_sent'),
        description: t('admin.invitation_sent_to', { email }),
      })

      onInvited(data.member)
      setEmail('')
    } catch {
      setFieldError('An unexpected error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('admin.invite_team_member')}</DialogTitle>
          <DialogDescription>{t('admin.invite_description')}</DialogDescription>
        </DialogHeader>

        {seatLimitReached ? (
          <div className="rounded-lg border border-amber-500/50 bg-amber-50 p-4 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
            <p className="font-medium">{t('admin.seat_limit_reached')}</p>
            <p className="mt-1">{t('admin.upgrade_to_invite_more')}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="invite-email">{t('admin.email_address')}</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder={t('admin.colleague_email_placeholder')}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setFieldError(null)
                  }}
                  disabled={submitting}
                  autoFocus
                />
                {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send invite
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Create User Dialog
// ---------------------------------------------------------------------------

interface CreateUserDialogProps {
  open: boolean
  onClose: () => void
  seatLimitReached: boolean
  onCreated: (member: TeamMember) => void
}

function CreateUserDialog({ open, onClose, seatLimitReached, onCreated }: CreateUserDialogProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'employee'>('employee')
  const [submitting, setSubmitting] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)

  function handleClose() {
    setDisplayName('')
    setEmail('')
    setPassword('')
    setRole('employee')
    setFieldError(null)
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFieldError(null)

    if (!displayName.trim()) {
      setFieldError(t('admin.display_name') + ' is required')
      return
    }
    if (!email.trim()) {
      setFieldError(t('admin.email_address') + ' is required')
      return
    }
    if (password.length < 8) {
      setFieldError(t('admin.password_must_be_8'))
      return
    }

    const token = await getAccessToken()
    if (!token) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create',
          display_name: displayName.trim(),
          email: email.trim(),
          password,
          role,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.code === 'SEAT_LIMIT_REACHED') {
          setFieldError(data.error)
        } else {
          setFieldError(data.error ?? 'Failed to create user')
        }
        return
      }

      toast({
        title: t('admin.user_created'),
        description: t('admin.user_created_message', { name: displayName }),
      })

      onCreated(data.member)
      handleClose()
    } catch {
      setFieldError('An unexpected error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('admin.create_user_account')}</DialogTitle>
          <DialogDescription>{t('admin.create_user_description')}</DialogDescription>
        </DialogHeader>

        {seatLimitReached ? (
          <div className="rounded-lg border border-amber-500/50 bg-amber-50 p-4 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
            <p className="font-medium">{t('admin.seat_limit_reached')}</p>
            <p className="mt-1">{t('admin.upgrade_to_add_more')}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="create-name">{t('admin.display_name')}</Label>
                <Input
                  id="create-name"
                  type="text"
                  placeholder={t('admin.display_name_placeholder')}
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value)
                    setFieldError(null)
                  }}
                  disabled={submitting}
                  autoFocus
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="create-email">{t('admin.email_address')}</Label>
                <Input
                  id="create-email"
                  type="email"
                  placeholder={t('admin.email_placeholder')}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setFieldError(null)
                  }}
                  disabled={submitting}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="create-password">{t('admin.temporary_password')}</Label>
                <Input
                  id="create-password"
                  type="password"
                  placeholder={t('admin.password_min_8_chars')}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setFieldError(null)
                  }}
                  disabled={submitting}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="create-role">{t('admin.role')}</Label>
                <Select
                  value={role}
                  onValueChange={(v) => setRole(v as 'admin' | 'employee')}
                  disabled={submitting}
                >
                  <SelectTrigger id="create-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">{t('nav.employee')}</SelectItem>
                    <SelectItem value="admin">{t('nav.admin')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    {t('admin.creating')}
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    {t('admin.create_account')}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
