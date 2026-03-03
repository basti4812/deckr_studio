'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  Link,
  Loader2,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { createBrowserSupabaseClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShareLink {
  id: string
  token: string
  expires_at: string | null
  view_count: number
  created_at: string
  status: 'active' | 'expired'
}

interface AccessRecord {
  id: string
  accessed_at: string
}

interface AccessData {
  accesses: AccessRecord[]
  total: number
  loading: boolean
  loaded: boolean
  showAll: boolean
}

interface ShareLinksTabProps {
  projectId: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function expiryLabel(expiresAt: string | null): string {
  if (!expiresAt) return 'Never expires'
  const d = new Date(expiresAt)
  if (d < new Date()) return 'Expired'
  return `Expires ${formatDate(expiresAt)}`
}

function viewCountLabel(count: number): string {
  if (count === 0) return 'Not viewed yet'
  if (count === 1) return 'Viewed 1 time'
  return `Viewed ${count} times`
}

// ---------------------------------------------------------------------------
// AccessHistory sub-component
// ---------------------------------------------------------------------------

function AccessHistory({
  projectId,
  link,
}: {
  projectId: string
  link: ShareLink
}) {
  const [data, setData] = useState<AccessData>({
    accesses: [],
    total: 0,
    loading: false,
    loaded: false,
    showAll: false,
  })
  const [open, setOpen] = useState(false)

  const fetchAccesses = useCallback(
    async (limit?: number) => {
      setData((prev) => ({ ...prev, loading: true }))
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        setData((prev) => ({ ...prev, loading: false }))
        return
      }

      const params = new URLSearchParams()
      if (limit) params.set('limit', String(limit))

      const res = await fetch(
        `/api/projects/${projectId}/share-links/${link.id}/accesses?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      )

      if (res.ok) {
        const d = await res.json()
        setData({
          accesses: d.accesses ?? [],
          total: d.total ?? 0,
          loading: false,
          loaded: true,
          showAll: (limit ?? 0) > 20,
        })
      } else {
        setData((prev) => ({ ...prev, loading: false, loaded: true }))
      }
    },
    [projectId, link.id]
  )

  // Load accesses on demand when expanded
  useEffect(() => {
    if (open && !data.loaded && !data.loading) {
      fetchAccesses(20)
    }
  }, [open, data.loaded, data.loading, fetchAccesses])

  function handleShowAll() {
    fetchAccesses(500)
  }

  if (link.view_count === 0) {
    return null
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-full justify-between px-2 text-xs text-muted-foreground hover:text-foreground"
          aria-label={`${viewCountLabel(link.view_count)}. Toggle access history.`}
        >
          <span className="flex items-center gap-1.5">
            <Eye className="h-3 w-3" />
            {viewCountLabel(link.view_count)}
          </span>
          {open ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1.5 rounded-md border bg-muted/30 p-2">
          {data.loading && !data.loaded ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : data.accesses.length === 0 && data.loaded ? (
            <p className="py-2 text-center text-xs text-muted-foreground">
              No access records found.
            </p>
          ) : (
            <>
              <ul className="space-y-0.5" aria-label="Access history">
                {data.accesses.map((access) => (
                  <li
                    key={access.id}
                    className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted/50"
                  >
                    <Clock className="h-3 w-3 shrink-0" />
                    <span>{formatDateTime(access.accessed_at)}</span>
                  </li>
                ))}
              </ul>

              {/* Show all button */}
              {!data.showAll && data.total > 20 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1.5 h-6 w-full text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleShowAll}
                  disabled={data.loading}
                >
                  {data.loading ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : null}
                  Show all {data.total} accesses
                </Button>
              )}

              {/* Loading indicator for "show all" */}
              {data.loading && data.loaded && (
                <div className="flex items-center justify-center py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                </div>
              )}
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ShareLinksTab({ projectId }: ShareLinksTabProps) {
  const [links, setLinks] = useState<ShareLink[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expiryOption, setExpiryOption] = useState<string>('7d')

  // Fetch links
  const fetchLinks = useCallback(async () => {
    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const res = await fetch(`/api/projects/${projectId}/share-links`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const d = await res.json()
      setLinks(d.links ?? [])
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    fetchLinks()
  }, [fetchLinks])

  // Create link
  async function handleCreate() {
    setCreating(true)
    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setCreating(false); return }

    const res = await fetch(`/api/projects/${projectId}/share-links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ expires_in: expiryOption }),
    })

    if (res.ok) {
      await fetchLinks()
    }
    setCreating(false)
  }

  // Delete link
  async function handleDelete(linkId: string) {
    setDeletingId(linkId)
    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setDeletingId(null); return }

    await fetch(`/api/projects/${projectId}/share-links/${linkId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    await fetchLinks()
    setDeletingId(null)
  }

  // Copy link URL
  function handleCopy(link: ShareLink) {
    const url = `${window.location.origin}/view/${link.token}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(link.id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      {/* Create link section */}
      <div className="space-y-3">
        <p className="text-sm font-medium">Create a public link</p>
        <div className="flex items-center gap-2">
          <Select value={expiryOption} onValueChange={setExpiryOption}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1d">1 day</SelectItem>
              <SelectItem value="7d">7 days</SelectItem>
              <SelectItem value="30d">30 days</SelectItem>
              <SelectItem value="never">No expiry</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleCreate} disabled={creating} size="sm">
            {creating ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Link className="mr-1.5 h-3.5 w-3.5" />
            )}
            Create link
          </Button>
        </div>
      </div>

      <Separator />

      {/* Links list */}
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground mb-2">
          Share links
        </p>

        {links.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No share links yet. Create one above.
          </p>
        ) : (
          <div className="space-y-2">
            {links.map((link) => (
              <div
                key={link.id}
                className="rounded-md border p-3 space-y-2"
              >
                {/* URL row */}
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate text-xs text-muted-foreground">
                    {typeof window !== 'undefined'
                      ? `${window.location.origin}/view/${link.token}`
                      : `/view/${link.token}`}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => handleCopy(link)}
                    title="Copy link"
                  >
                    {copiedId === link.id ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <a
                    href={`/view/${link.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Open link">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    Created {formatDate(link.created_at)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {expiryLabel(link.expires_at)}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {viewCountLabel(link.view_count)}
                  </Badge>
                  <Badge
                    variant={link.status === 'active' ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {link.status === 'active' ? 'Active' : 'Expired'}
                  </Badge>
                  <div className="flex-1" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(link.id)}
                    disabled={deletingId === link.id}
                    title="Revoke link"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Access history (expandable) */}
                <AccessHistory projectId={projectId} link={link} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
