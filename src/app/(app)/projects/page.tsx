'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ChevronDown, Plus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentUser } from '@/hooks/use-current-user'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { ProjectCard, type Project } from '@/components/projects/project-card'
import { CreateProjectDialog } from '@/components/projects/create-project-dialog'

export default function ProjectsPage() {
  const router = useRouter()
  const { loading: userLoading } = useCurrentUser()
  const [projects, setProjects] = useState<Project[]>([])
  const [sharedProjects, setSharedProjects] = useState<Project[]>([])
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------

  const fetchProjects = useCallback(async () => {
    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const token = session.access_token

    const [ownedRes, sharedRes, archivedRes] = await Promise.all([
      fetch('/api/projects', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/projects/shared', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/projects/archived', { headers: { Authorization: `Bearer ${token}` } }),
    ])

    if (ownedRes.ok) {
      const d = await ownedRes.json()
      setProjects(d.projects ?? [])
    }
    if (sharedRes.ok) {
      const d = await sharedRes.json()
      setSharedProjects(d.projects ?? [])
    }
    if (archivedRes.ok) {
      const d = await archivedRes.json()
      setArchivedProjects(d.projects ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { if (!userLoading) fetchProjects() }, [userLoading, fetchProjects])

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function getToken() {
    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
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
    if (res.ok) {
      setProjects((prev) => prev.filter((p) => p.id !== id))
    }
  }

  async function handleLeave(projectId: string) {
    const token = await getToken()
    const res = await fetch(`/api/projects/${projectId}/shares/leave`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      setSharedProjects((prev) => prev.filter((p) => p.id !== projectId))
    }
  }

  async function handleDuplicate(projectId: string) {
    const token = await getToken()
    const res = await fetch(`/api/projects/${projectId}/duplicate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const d = await res.json()
      toast.success('Project duplicated')
      router.push(`/board?project=${d.project.id}`)
    } else {
      const d = await res.json().catch(() => ({ error: 'Failed to duplicate project' }))
      toast.error(d.error ?? 'Failed to duplicate project')
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
      const d = await res.json()
      setProjects((prev) => prev.filter((p) => p.id !== id))
      setArchivedProjects((prev) => [d.project, ...prev])
      toast.success('Project archived')
    } else {
      const d = await res.json().catch(() => ({ error: 'Failed to archive project' }))
      toast.error(d.error ?? 'Failed to archive project')
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
      const d = await res.json()
      setArchivedProjects((prev) => prev.filter((p) => p.id !== id))
      setProjects((prev) => [d.project, ...prev])
      toast.success('Project restored')
    } else {
      const d = await res.json().catch(() => ({ error: 'Failed to restore project' }))
      toast.error(d.error ?? 'Failed to restore project')
    }
  }

  async function handleDeletePermanently(id: string) {
    const token = await getToken()
    const res = await fetch(`/api/projects/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      setArchivedProjects((prev) => prev.filter((p) => p.id !== id))
      toast.success('Project permanently deleted')
    } else {
      const d = await res.json().catch(() => ({ error: 'Failed to delete project' }))
      toast.error(d.error ?? 'Failed to delete project')
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All your presentation projects — create, manage, and export.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New project
        </Button>
      </div>

      {/* My Projects */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
          <p className="text-sm font-medium text-muted-foreground">No projects yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create your first project to start assembling presentations.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New project
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
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
      {!loading && sharedProjects.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold tracking-tight">Shared with me</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sharedProjects.map((project) => (
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
      {!loading && archivedProjects.length > 0 && (
        <Collapsible open={archiveOpen} onOpenChange={setArchiveOpen} className="mt-10">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 mb-4 group cursor-pointer">
              <Archive className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold tracking-tight">Archived</h2>
              <Badge variant="secondary" className="text-xs">
                {archivedProjects.length}
              </Badge>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${archiveOpen ? 'rotate-180' : ''}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {archivedProjects.map((project) => (
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
