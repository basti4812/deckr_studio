'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Activity, Check, ChevronsUpDown, X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { ALL_EVENT_TYPES, type ActivityEventType } from '@/lib/activity-log'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Actor {
  id: string
  display_name: string | null
  avatar_url: string | null
  email: string | null
}

interface ActivityLogEntry {
  id: string
  event_type: ActivityEventType
  resource_type: string | null
  resource_id: string | null
  resource_name: string | null
  metadata: Record<string, unknown>
  created_at: string
  actor: Actor | null
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

interface TeamMember {
  id: string
  display_name: string | null
  email: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAccessToken(): Promise<string | null> {
  const supabase = createBrowserSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

function getInitials(name: string | null, email: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  if (email) return email.slice(0, 2).toUpperCase()
  return '?'
}

function formatRelative(dateStr: string): string {
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
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatExact(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function eventBadgeClass(eventType: ActivityEventType): string {
  if (eventType.startsWith('slide.')) return 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
  if (eventType.startsWith('template_set.')) return 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
  if (eventType.startsWith('project.')) return 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
  if (eventType.startsWith('user.')) return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
  if (eventType.startsWith('subscription.')) return 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
  if (eventType.startsWith('share_link.')) return 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300'
  return 'bg-muted text-muted-foreground'
}

function eventI18nKey(eventType: ActivityEventType): string {
  return `admin.event_${eventType.replace('.', '_')}`
}

// ---------------------------------------------------------------------------
// EventTypeMultiSelect
// ---------------------------------------------------------------------------

interface EventTypeMultiSelectProps {
  selected: ActivityEventType[]
  onChange: (selected: ActivityEventType[]) => void
}

function EventTypeMultiSelect({ selected, onChange }: EventTypeMultiSelectProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  function toggleType(type: ActivityEventType) {
    if (selected.includes(type)) {
      onChange(selected.filter((s) => s !== type))
    } else {
      onChange([...selected, type])
    }
  }

  const label =
    selected.length === 0
      ? t('admin.activity_all_events')
      : selected.length === 1
        ? t(eventI18nKey(selected[0]))
        : t('admin.activity_n_event_types', { count: selected.length })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-[210px] justify-between font-normal"
        >
          <span className="truncate text-sm">{label}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[210px] p-0" align="start">
        <Command>
          <CommandList>
            <CommandGroup>
              {ALL_EVENT_TYPES.map((et) => (
                <CommandItem
                  key={et}
                  value={et}
                  onSelect={() => toggleType(et)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={selected.includes(et)}
                    onCheckedChange={() => toggleType(et)}
                    className="pointer-events-none"
                  />
                  <span className="text-sm">{t(eventI18nKey(et))}</span>
                  {selected.includes(et) && (
                    <Check className="ml-auto h-3.5 w-3.5 shrink-0" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function ActivityLogPage() {
  const { t } = useTranslation()

  const [selectedEventTypes, setSelectedEventTypes] = useState<ActivityEventType[]>([])
  const [selectedActorId, setSelectedActorId] = useState<string>('')
  const [logs, setLogs] = useState<ActivityLogEntry[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])

  useEffect(() => {
    async function fetchTeam() {
      const token = await getAccessToken()
      if (!token) return
      const res = await fetch('/api/team', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        setTeamMembers(
          (data.members ?? []).map((m: { id: string; display_name: string | null; email: string }) => ({
            id: m.id,
            display_name: m.display_name,
            email: m.email,
          }))
        )
      }
    }
    fetchTeam()
  }, [])

  const fetchLogs = useCallback(async (page: number) => {
    const token = await getAccessToken()
    if (!token) return

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ page: String(page) })
      if (selectedEventTypes.length > 0) params.set('event_types', selectedEventTypes.join(','))
      if (selectedActorId) params.set('actor_id', selectedActorId)

      const res = await fetch(`/api/activity-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to fetch logs')
      }

      const data = await res.json()
      setLogs(data.logs ?? [])
      setPagination(data.pagination ?? { page: 1, pageSize: 20, total: 0, totalPages: 0 })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity log')
    } finally {
      setLoading(false)
    }
  }, [selectedEventTypes, selectedActorId])

  useEffect(() => {
    fetchLogs(1)
  }, [fetchLogs])

  const hasFilters = selectedEventTypes.length > 0 || !!selectedActorId

  return (
    <TooltipProvider>
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('admin.activity_log')}</h1>
        <p className="text-sm text-muted-foreground">{t('admin.activity_log_description')}</p>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <EventTypeMultiSelect
          selected={selectedEventTypes}
          onChange={setSelectedEventTypes}
        />

        <Select
          value={selectedActorId || '__all__'}
          onValueChange={(val) => setSelectedActorId(val === '__all__' ? '' : val)}
        >
          <SelectTrigger className="h-8 w-[180px]">
            <SelectValue placeholder={t('admin.activity_filter_user')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t('admin.activity_all_users')}</SelectItem>
            {teamMembers.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.display_name ?? m.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => { setSelectedEventTypes([]); setSelectedActorId('') }}
          >
            <X className="mr-1.5 h-3.5 w-3.5" />
            {t('admin.activity_clear_filters')}
          </Button>
        )}

        {!loading && pagination.total > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {t('admin.activity_total_entries', { count: pagination.total })}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
          <Button variant="ghost" size="sm" className="ml-2" onClick={() => fetchLogs(pagination.page)}>
            Retry
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">{t('admin.member')}</TableHead>
              <TableHead className="w-[200px]">{t('admin.activity_event')}</TableHead>
              <TableHead>{t('admin.activity_resource')}</TableHead>
              <TableHead className="w-[120px] text-right">{t('admin.activity_time')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-5 w-32 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-14" /></TableCell>
                </TableRow>
              ))
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                    <Activity className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">{t('admin.activity_no_activity')}</p>
                    <p className="text-xs text-muted-foreground/70">{t('admin.activity_no_activity_desc')}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              logs.map((entry) => (
                <ActivityLogRow key={entry.id} entry={entry} />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!loading && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page <= 1}
            onClick={() => fetchLogs(pagination.page - 1)}
          >
            {t('admin.activity_prev')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t('admin.activity_page_of', { page: pagination.page, total: pagination.totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => fetchLogs(pagination.page + 1)}
          >
            {t('admin.activity_next')}
          </Button>
        </div>
      )}
    </TooltipProvider>
  )
}

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

function ActivityLogRow({ entry }: { entry: ActivityLogEntry }) {
  const { t } = useTranslation()
  const actor = entry.actor
  const actorName = actor?.display_name ?? actor?.email ?? t('admin.activity_unknown_user')

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            {actor?.avatar_url && <AvatarImage src={actor.avatar_url} alt={actorName} />}
            <AvatarFallback className="text-xs">
              {getInitials(actor?.display_name ?? null, actor?.email ?? null)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-sm font-medium">{actorName}</span>
        </div>
      </TableCell>

      <TableCell>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${eventBadgeClass(entry.event_type)}`}>
          {t(eventI18nKey(entry.event_type))}
        </span>
      </TableCell>

      <TableCell>
        <span className="truncate text-sm text-muted-foreground">
          {entry.resource_name ?? <span className="italic">{t('admin.activity_deleted')}</span>}
        </span>
      </TableCell>

      <TableCell className="text-right">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default text-xs text-muted-foreground">
              {formatRelative(entry.created_at)}
            </span>
          </TooltipTrigger>
          <TooltipContent side="left">{formatExact(entry.created_at)}</TooltipContent>
        </Tooltip>
      </TableCell>
    </TableRow>
  )
}
