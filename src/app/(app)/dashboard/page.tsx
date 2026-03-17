'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import Link from 'next/link'
import {
  Image,
  FolderOpen,
  Download,
  Users,
  ArrowRight,
  LayoutGrid,
  Plus,
  Activity,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { createBrowserSupabaseClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecentProject {
  id: string
  name: string
  status: string
  updated_at: string
  created_at: string
  created_by: string
}

interface ActivityActor {
  display_name: string | null
  avatar_url: string | null
}

interface ActivityItem {
  id: string
  event_type: string
  resource_type: string
  resource_name: string | null
  created_at: string
  actor: ActivityActor | ActivityActor[] | null
}

interface DashboardData {
  totalSlides: number
  totalProjects: number
  exportsLast30Days: number
  teamMembers: number
  recentProjects: RecentProject[]
  recentActivity: ActivityItem[]
  previousExports: number
  newSlides: number
  previousSlides: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAccessToken(): Promise<string | null> {
  const supabase = createBrowserSupabaseClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then

  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'just now'
}

function eventTypeToAction(eventType: string): string {
  const map: Record<string, string> = {
    'project.created': 'created a project',
    'project.updated': 'updated a project',
    'project.exported': 'exported a project',
    'project.deleted': 'deleted a project',
    'project.archived': 'archived a project',
    'project.duplicated': 'duplicated a project',
    'project.shared': 'shared a project',
    'slide.created': 'uploaded a slide',
    'slide.updated': 'updated a slide',
    'slide.deleted': 'deleted a slide',
    'template_set.created': 'created a template set',
    'template_set.updated': 'updated a template set',
    'template_set.deleted': 'deleted a template set',
    'team.member_invited': 'invited a team member',
    'team.member_removed': 'removed a team member',
    'team.role_changed': 'changed a member role',
    'share_link.created': 'created a share link',
    'share_link.viewed': 'viewed a share link',
  }
  return map[eventType] ?? eventType.replace(/[._]/g, ' ')
}

function projectStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'active':
      return 'default'
    case 'draft':
      return 'secondary'
    case 'archived':
      return 'outline'
    default:
      return 'secondary'
  }
}

function getActorData(actor: ActivityItem['actor']): ActivityActor {
  if (!actor) return { display_name: null, avatar_url: null }
  if (Array.isArray(actor)) return actor[0] ?? { display_name: null, avatar_url: null }
  return actor
}

// ---------------------------------------------------------------------------
// Summary Cards
// ---------------------------------------------------------------------------

function trendPercent(
  current: number,
  previous: number
): { label: string; direction: 'up' | 'down' | 'stable' } {
  if (previous === 0 && current === 0) return { label: '—', direction: 'stable' }
  if (previous === 0) return { label: '+100%', direction: 'up' }
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct > 0) return { label: `+${pct}%`, direction: 'up' }
  if (pct < 0) return { label: `${pct}%`, direction: 'down' }
  return { label: '—', direction: 'stable' }
}

function SummaryCards({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  const { t } = useTranslation()

  // Compute trends for slides and exports
  const slidesTrend = data ? trendPercent(data.newSlides, data.previousSlides) : null
  const exportsTrend = data ? trendPercent(data.exportsLast30Days, data.previousExports) : null

  const cards = [
    {
      key: 'slides',
      icon: <Image className="h-5 w-5 text-muted-foreground" aria-hidden="true" />,
      label: t('dashboard.total_slides'),
      value: data?.totalSlides ?? 0,
      trend: slidesTrend,
    },
    {
      key: 'projects',
      icon: <FolderOpen className="h-5 w-5 text-muted-foreground" aria-hidden="true" />,
      label: t('dashboard.total_projects'),
      value: data?.totalProjects ?? 0,
      trend: null,
    },
    {
      key: 'exports',
      icon: <Download className="h-5 w-5 text-muted-foreground" aria-hidden="true" />,
      label: t('dashboard.exports_30d'),
      value: data?.exportsLast30Days ?? 0,
      trend: exportsTrend,
    },
    {
      key: 'team',
      icon: <Users className="h-5 w-5 text-muted-foreground" aria-hidden="true" />,
      label: t('dashboard.team_members'),
      value: data?.teamMembers ?? 0,
      trend: null,
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.key}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.label}
            </CardTitle>
            {card.icon}
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div>
                <p className="text-3xl font-bold tabular-nums">{card.value.toLocaleString()}</p>
                {card.trend && (
                  <p
                    className={`mt-1 text-xs font-medium ${
                      card.trend.direction === 'up'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : card.trend.direction === 'down'
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {card.trend.label}{' '}
                    <span className="font-normal text-muted-foreground">
                      {t('dashboard.vs_previous_30d')}
                    </span>
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Recent Projects Table
// ---------------------------------------------------------------------------

function RecentProjectsTable({
  projects,
  loading,
}: {
  projects: RecentProject[]
  loading: boolean
}) {
  const { t } = useTranslation()

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold">{t('dashboard.recent_projects')}</CardTitle>
        <Button variant="ghost" size="sm" className="gap-1" asChild>
          <Link href="/projects">
            {t('dashboard.view_all_projects')}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <div className="rounded-b-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('dashboard.project_name')}</TableHead>
                <TableHead className="w-[100px]">{t('dashboard.project_status')}</TableHead>
                <TableHead className="w-[130px] text-right">
                  {t('dashboard.last_updated')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-4 w-16" />
                    </TableCell>
                  </TableRow>
                ))
              ) : projects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3}>
                    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                      <FolderOpen className="h-8 w-8 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">{t('dashboard.no_projects')}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                projects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium">
                      <Link href="/projects" className="hover:underline">
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={projectStatusVariant(project.status)}>{project.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {relativeTime(project.updated_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Recent Activity Feed
// ---------------------------------------------------------------------------

function RecentActivityFeed({ activity, loading }: { activity: ActivityItem[]; loading: boolean }) {
  const { t } = useTranslation()

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold">{t('dashboard.recent_activity')}</CardTitle>
        <Button variant="ghost" size="sm" className="gap-1" asChild>
          <Link href="/admin/activity-log">
            {t('dashboard.view_activity_log')}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex-1">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : activity.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Activity className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t('dashboard.no_activity')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activity.map((item) => {
              const actor = getActorData(item.actor)
              const initials = actor.display_name
                ? actor.display_name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)
                : '??'

              return (
                <div key={item.id} className="flex items-start gap-3">
                  <Avatar className="h-8 w-8">
                    {actor.avatar_url && (
                      <AvatarImage src={actor.avatar_url} alt={actor.display_name ?? ''} />
                    )}
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-sm">
                    <p>
                      <span className="font-medium">{actor.display_name ?? 'Unknown'}</span>{' '}
                      <span className="text-muted-foreground">
                        {eventTypeToAction(item.event_type)}
                      </span>
                      {item.resource_name && (
                        <>
                          {' '}
                          <span className="font-medium">{item.resource_name}</span>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{relativeTime(item.created_at)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Quick Actions
// ---------------------------------------------------------------------------

function QuickActions() {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{t('dashboard.quick_actions')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/board">
              <LayoutGrid className="mr-2 h-4 w-4" />
              {t('dashboard.open_board')}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/projects">
              <Plus className="mr-2 h-4 w-4" />
              {t('dashboard.create_project')}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/team">
              <Users className="mr-2 h-4 w-4" />
              {t('dashboard.manage_team')}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

async function fetchDashboardStats(): Promise<DashboardData> {
  const accessToken = await getAccessToken()
  if (!accessToken) throw new Error('Not authenticated')

  const res = await fetch('/api/dashboard/stats', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? 'Failed to load dashboard')
  }

  return res.json()
}

export default function DashboardPage() {
  const { t } = useTranslation()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
  })

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {t('dashboard.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('dashboard.description')}</p>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error.message}
          <Button variant="ghost" size="sm" className="ml-2" onClick={() => refetch()}>
            {t('nav.retry')}
          </Button>
        </div>
      )}

      {/* Summary Cards */}
      <SummaryCards data={data ?? null} loading={isLoading} />

      {/* Two Column Layout: Recent Projects + Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <RecentProjectsTable projects={data?.recentProjects ?? []} loading={isLoading} />
        </div>
        <div className="lg:col-span-2">
          <RecentActivityFeed activity={data?.recentActivity ?? []} loading={isLoading} />
        </div>
      </div>

      {/* Quick Actions */}
      <QuickActions />
    </div>
  )
}
