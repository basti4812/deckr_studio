'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart3, Download, Layers, LayoutTemplate, Presentation } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { createBrowserSupabaseClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Summary {
  totalSlides: number
  totalProjects: number
  exportsLast30Days: number
}

interface SlideRow {
  slide_id: string
  title: string
  thumbnail_url: string | null
  status: string
  use_count: number
  last_used_at: string | null
  template_set_count: number
}

interface TemplateRow {
  template_set_id: string
  name: string
  cover_image_url: string | null
  slide_count: number
  times_selected: number
  last_selected_at: string | null
}

interface AnalyticsData {
  summary: Summary
  slides: SlideRow[]
  templateSets: TemplateRow[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAccessToken(): Promise<string | null> {
  const supabase = createBrowserSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateExact(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'mandatory': return 'default'
    case 'active': return 'secondary'
    case 'deprecated': return 'destructive'
    default: return 'outline'
  }
}

function downloadCSV(token: string) {
  fetch('/api/analytics/export', {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((res) => {
      if (!res.ok) throw new Error(`Export failed (${res.status})`)
      return res.blob()
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `slide-analytics-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    })
    .catch((err) => console.error('[analytics] CSV export failed:', err))
}

// ---------------------------------------------------------------------------
// Summary Cards
// ---------------------------------------------------------------------------

function SummaryCards({ summary, loading }: { summary: Summary | null; loading: boolean }) {
  const { t } = useTranslation()

  const cards = [
    {
      key: 'slides',
      icon: <Layers className="h-5 w-5 text-muted-foreground" />,
      label: t('admin.analytics_total_slides'),
      value: summary?.totalSlides ?? 0,
    },
    {
      key: 'projects',
      icon: <Presentation className="h-5 w-5 text-muted-foreground" />,
      label: t('admin.analytics_total_projects'),
      value: summary?.totalProjects ?? 0,
    },
    {
      key: 'exports',
      icon: <BarChart3 className="h-5 w-5 text-muted-foreground" />,
      label: t('admin.analytics_exports_30d'),
      value: summary?.exportsLast30Days ?? 0,
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              <p className="text-3xl font-bold tabular-nums">{card.value.toLocaleString()}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Slides Table
// ---------------------------------------------------------------------------

function SlidesTable({
  slides,
  loading,
  neverUsedOnly,
  onToggleNeverUsed,
  onExportCSV,
}: {
  slides: SlideRow[]
  loading: boolean
  neverUsedOnly: boolean
  onToggleNeverUsed: (v: boolean) => void
  onExportCSV: () => void
}) {
  const { t } = useTranslation()

  const filtered = neverUsedOnly ? slides.filter((s) => s.use_count === 0) : slides

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            id="never-used"
            checked={neverUsedOnly}
            onCheckedChange={onToggleNeverUsed}
          />
          <label htmlFor="never-used" className="cursor-pointer select-none text-sm text-muted-foreground">
            {t('admin.analytics_never_used_only')}
          </label>
        </div>
        <Button variant="outline" size="sm" onClick={onExportCSV} className="gap-2">
          <Download className="h-3.5 w-3.5" />
          {t('admin.analytics_export_csv')}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12" />
              <TableHead>{t('admin.analytics_slide_name')}</TableHead>
              <TableHead className="w-[110px]">{t('admin.status')}</TableHead>
              <TableHead className="w-[110px] text-right">{t('admin.analytics_use_count')}</TableHead>
              <TableHead className="w-[140px] text-right">{t('admin.analytics_last_used')}</TableHead>
              <TableHead className="w-[130px] text-right">{t('admin.analytics_in_template_sets')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-8 w-12 rounded" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-8" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-8" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                    <Layers className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      {neverUsedOnly
                        ? t('admin.analytics_no_never_used')
                        : t('admin.analytics_no_slides')}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((slide) => (
                <TableRow key={slide.slide_id}>
                  <TableCell>
                    {slide.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={slide.thumbnail_url}
                        alt={slide.title}
                        className="h-8 w-12 rounded object-cover"
                      />
                    ) : (
                      <div className="h-8 w-12 rounded bg-muted" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{slide.title}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(slide.status)}>
                      {slide.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {slide.use_count}
                  </TableCell>
                  <TableCell className="text-right">
                    {slide.last_used_at ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-default text-sm text-muted-foreground">
                            {formatDate(slide.last_used_at)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          {formatDateExact(slide.last_used_at)}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-sm text-muted-foreground/60">{t('admin.analytics_never')}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {slide.template_set_count}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Template Sets Table
// ---------------------------------------------------------------------------

function TemplateSetsTable({ templateSets, loading }: { templateSets: TemplateRow[]; loading: boolean }) {
  const { t } = useTranslation()

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12" />
            <TableHead>{t('admin.analytics_template_name')}</TableHead>
            <TableHead className="w-[110px] text-right">{t('admin.analytics_slide_count')}</TableHead>
            <TableHead className="w-[140px] text-right">{t('admin.analytics_times_selected')}</TableHead>
            <TableHead className="w-[150px] text-right">{t('admin.analytics_last_selected')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-8 w-8 rounded-full" /></TableCell>
                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-8" /></TableCell>
                <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-8" /></TableCell>
                <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-20" /></TableCell>
              </TableRow>
            ))
          ) : templateSets.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5}>
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                  <LayoutTemplate className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">{t('admin.analytics_no_template_sets')}</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            templateSets.map((ts) => (
              <TableRow key={ts.template_set_id}>
                <TableCell>
                  <Avatar className="h-8 w-8 rounded">
                    {ts.cover_image_url && (
                      <AvatarImage src={ts.cover_image_url} alt={ts.name} className="object-cover" />
                    )}
                    <AvatarFallback className="rounded text-xs">
                      {ts.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </TableCell>
                <TableCell className="font-medium">{ts.name}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {ts.slide_count}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {ts.times_selected}
                </TableCell>
                <TableCell className="text-right">
                  {ts.last_selected_at ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-default text-sm text-muted-foreground">
                          {formatDate(ts.last_selected_at)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        {formatDateExact(ts.last_selected_at)}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-sm text-muted-foreground/60">{t('admin.analytics_never')}</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const { t } = useTranslation()

  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [neverUsedOnly, setNeverUsedOnly] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const accessToken = await getAccessToken()
    setToken(accessToken)
    if (!accessToken) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/analytics', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Failed to load analytics')
      }

      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  function handleExportCSV() {
    if (token) downloadCSV(token)
  }

  return (
    <TooltipProvider>
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t('admin.analytics')}</h1>
        <p className="text-sm text-muted-foreground">{t('admin.analytics_description')}</p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
          <Button variant="ghost" size="sm" className="ml-2" onClick={fetchData}>
            {t('admin.retry')}
          </Button>
        </div>
      )}

      {/* Summary Cards */}
      <SummaryCards summary={data?.summary ?? null} loading={loading} />

      {/* Tabs */}
      <Tabs defaultValue="slides">
        <TabsList>
          <TabsTrigger value="slides" className="gap-2">
            <Layers className="h-4 w-4" />
            {t('admin.analytics_tab_slides')}
          </TabsTrigger>
          <TabsTrigger value="template-sets" className="gap-2">
            <LayoutTemplate className="h-4 w-4" />
            {t('admin.analytics_tab_templates')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="slides" className="mt-4">
          <SlidesTable
            slides={data?.slides ?? []}
            loading={loading}
            neverUsedOnly={neverUsedOnly}
            onToggleNeverUsed={setNeverUsedOnly}
            onExportCSV={handleExportCSV}
          />
        </TabsContent>

        <TabsContent value="template-sets" className="mt-4">
          <TemplateSetsTable
            templateSets={data?.templateSets ?? []}
            loading={loading}
          />
        </TabsContent>
      </Tabs>
    </TooltipProvider>
  )
}
