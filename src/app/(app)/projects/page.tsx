'use client'

import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Archive, ChevronDown, Plus, Search, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentUser } from '@/hooks/use-current-user'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { ProjectCard, type Project } from '@/components/projects/project-card'
import { CreateProjectDialog } from '@/components/projects/create-project-dialog'

async function fetchAllProjects(): Promise<{
  projects: Project[]
  shared: Project[]
  archived: Project[]
}> {
  const supabase = createBrowserSupabaseClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const token = session.access_token

  const [ownedRes, sharedRes, archivedRes] = await Promise.all([
    fetch('/api/projects', { headers: { Authorization: `Bearer ${token}` } }),
    fetch('/api/projects/shared', { headers: { Authorization: `Bearer ${token}` } }),
    fetch('/api/projects/archived', { headers: { Authorization: `Bearer ${token}` } }),
  ])

  const owned = ownedRes.ok ? ((await ownedRes.json()) as { projects: Project[] }).projects : []
  const shared = sharedRes.ok ? ((await sharedRes.json()) as { projects: Project[] }).projects : []
  const archived = archivedRes.ok
    ? ((await archivedRes.json()) as { projects: Project[] }).projects
    : []

  return { projects: owned, shared, archived }
}

export default function ProjectsPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { loading: userLoading } = useCurrentUser()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('new') === 'true'
  })
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [search, setSearch] = useState('')

  const { data, isLoading: loading } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchAllProjects,
    enabled: !userLoading,
  })

  const projects = data?.projects ?? []
  const sharedProjects = data?.shared ?? []
  const archivedProjects = data?.archived ?? []

  function invalidateProjects() {
    queryClient.invalidateQueries({ queryKey: ['projects'] })
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

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
    if (res.ok) invalidateProjects()
  }

  async function handleDelete(id: string) {
    const token = await getToken()
    const res = await fetch(`/api/projects/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) invalidateProjects()
  }

  async function handleLeave(projectId: string) {
    const token = await getToken()
    const res = await fetch(`/api/projects/${projectId}/shares/leave`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) invalidateProjects()
  }

  async function handleDuplicate(projectId: string) {
    const token = await getToken()
    const res = await fetch(`/api/projects/${projectId}/duplicate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const d = await res.json()
      toast.success(t('projects.project_duplicated'))
      invalidateProjects()
      router.push(`/board?project=${d.project.id}`)
    } else {
      const d = await res.json().catch(() => ({ error: t('projects.failed_duplicate') }))
      toast.error(d.error ?? t('projects.failed_duplicate'))
    }
  }

  async function handleArchive(id: string) {
    const token = await getToken()
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'archived' }),
    })
    if (res.ok) {
      invalidateProjects()
      toast.success(t('projects.project_archived'))
    } else {
      const d = await res.json().catch(() => ({ error: t('projects.failed_archive') }))
      toast.error(d.error ?? t('projects.failed_archive'))
    }
  }

  async function handleRestore(id: string) {
    const token = await getToken()
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'active' }),
    })
    if (res.ok) {
      invalidateProjects()
      toast.success(t('projects.project_restored'))
    } else {
      const d = await res.json().catch(() => ({ error: t('projects.failed_restore') }))
      toast.error(d.error ?? t('projects.failed_restore'))
    }
  }

  async function handleDeletePermanently(id: string) {
    const token = await getToken()
    const res = await fetch(`/api/projects/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      invalidateProjects()
      toast.success(t('projects.permanently_deleted'))
    } else {
      const d = await res.json().catch(() => ({ error: t('projects.failed_delete') }))
      toast.error(d.error ?? t('projects.failed_delete'))
    }
  }

  // ---------------------------------------------------------------------------
  // Search filter
  // ---------------------------------------------------------------------------

  const q = search.toLowerCase().trim()
  const filteredProjects = q ? projects.filter((p) => p.name?.toLowerCase().includes(q)) : projects
  const filteredShared = q
    ? sharedProjects.filter((p) => p.name?.toLowerCase().includes(q))
    : sharedProjects
  const filteredArchived = q
    ? archivedProjects.filter((p) => p.name?.toLowerCase().includes(q))
    : archivedProjects

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {t('projects.title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('projects.description')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('home.new_project')}
        </Button>
      </div>

      {/* Search bar */}
      {!loading &&
        (projects.length > 0 || sharedProjects.length > 0 || archivedProjects.length > 0) && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('projects.search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        )}

      {/* My Projects */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : filteredProjects.length === 0 && !q ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            {t('projects.no_projects_yet')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t('projects.create_first_project')}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('home.new_project')}
          </Button>
        </div>
      ) : filteredProjects.length === 0 && q ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">{t('projects.no_search_results')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              isOwner
              onRename={handleRename}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onArchive={handleArchive}
            />
          ))}
        </div>
      )}

      {/* Shared with me */}
      {!loading && filteredShared.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold tracking-tight">{t('projects.shared_with_me')}</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredShared.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isOwner={false}
                onLeave={handleLeave}
                onDuplicate={handleDuplicate}
              />
            ))}
          </div>
        </div>
      )}

      {/* Archived projects */}
      {!loading && filteredArchived.length > 0 && (
        <Collapsible open={archiveOpen} onOpenChange={setArchiveOpen} className="mt-10">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 mb-4 group cursor-pointer">
              <Archive className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold tracking-tight">{t('projects.archived')}</h2>
              <Badge variant="secondary" className="text-xs">
                {filteredArchived.length}
              </Badge>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${archiveOpen ? 'rotate-180' : ''}`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredArchived.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  variant="archived"
                  isOwner
                  onRestore={handleRestore}
                  onDeletePermanently={handleDeletePermanently}
                />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}
