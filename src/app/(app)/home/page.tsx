'use client'

import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, FolderPlus, LayoutGrid, Presentation, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentUser } from '@/hooks/use-current-user'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { ProjectCard, type Project } from '@/components/projects/project-card'
import { CreateProjectDialog } from '@/components/projects/create-project-dialog'

export default function HomePage() {
  const { t } = useTranslation()
  const { loading: userLoading } = useCurrentUser()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)

  const fetchProjects = useCallback(async () => {
    const supabase = createBrowserSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch('/api/projects', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const d = await res.json()
      setProjects((d.projects ?? []).slice(0, 6))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!userLoading) fetchProjects()
  }, [userLoading, fetchProjects])

  async function getToken() {
    const supabase = createBrowserSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function handleRename(id: string, name: string) {
    const token = await getToken()
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      const d = await res.json()
      setProjects((prev) => prev.map((p) => (p.id === id ? d.project : p)))
    }
  }

  async function handleDelete(id: string) {
    const token = await getToken()
    const res = await fetch(`/api/projects/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) setProjects((prev) => prev.filter((p) => p.id !== id))
  }

  return (
    <>
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{t('home.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('home.description')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('home.new_project')}
        </Button>
      </div>

      {/* Recent projects section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t('home.recent_projects')}</h2>
          {projects.length > 0 && (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/projects" className="gap-1.5">
                {t('home.view_all')}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-dashed p-8 text-center">
              <h3 className="text-base font-semibold">{t('home.getting_started')}</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
                {t('home.getting_started_desc')}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Link href="/board" className="block">
                <Card className="group cursor-pointer transition-shadow hover:shadow-md">
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <LayoutGrid className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{t('home.step_explore_board')}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('home.step_explore_board_desc')}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
              <Card
                className="group cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => setCreateOpen(true)}
              >
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <FolderPlus className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t('home.step_create_project')}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('home.step_create_project_desc')}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Link href="/demo" className="block">
                <Card className="group cursor-pointer transition-shadow hover:shadow-md">
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Presentation className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{t('home.step_try_demo')}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('home.step_try_demo_desc')}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onRename={handleRename}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}
