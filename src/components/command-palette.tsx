'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import {
  BarChart3,
  CreditCard,
  FolderOpen,
  Home,
  Image,
  LayoutDashboard,
  LayoutGrid,
  Layers,
  Plug,
  Activity,
  User,
  Users,
} from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useCurrentUser } from '@/hooks/use-current-user'

interface SearchResults {
  projects: { id: string; name: string; status: string }[]
  slides: { id: string; title: string; status: string; thumbnail_url: string | null }[]
  users: { id: string; display_name: string | null; email: string }[]
}

export function CommandPalette() {
  const { t } = useTranslation()
  const router = useRouter()
  const { isAdmin } = useCurrentUser()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // Cleanup debounce and abort on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults(null)
    }
  }, [open])

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults(null)
      return
    }

    // Abort any in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal: controller.signal,
      })
      if (res.ok) {
        const data = await res.json()
        setResults(data)
      }
    } catch (err) {
      // Ignore abort errors
      if (err instanceof DOMException && err.name === 'AbortError') return
    } finally {
      setLoading(false)
    }
  }, [])

  function handleQueryChange(value: string) {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(value), 300)
  }

  function navigate(path: string) {
    setOpen(false)
    router.push(path)
  }

  // Static navigation items — user routes always visible, admin routes gated
  const userNavItems = [
    { label: t('nav.home'), href: '/home', icon: Home },
    { label: t('nav.board'), href: '/board', icon: LayoutGrid },
    { label: t('nav.projects'), href: '/projects', icon: FolderOpen },
    { label: t('nav.profile'), href: '/profile', icon: User },
  ]

  const adminNavItems = [
    { label: t('nav.dashboard'), href: '/dashboard', icon: LayoutDashboard },
    { label: t('nav.slide_library'), href: '/admin/slides', icon: Image },
    { label: t('nav.template_sets'), href: '/admin/templates', icon: Layers },
    { label: t('nav.team_management'), href: '/admin/team', icon: Users },
    { label: t('nav.analytics'), href: '/admin/analytics', icon: BarChart3 },
    { label: t('nav.activity_log'), href: '/admin/activity', icon: Activity },
    { label: t('nav.integrations'), href: '/admin/integrations', icon: Plug },
    { label: t('nav.billing'), href: '/admin/billing', icon: CreditCard },
  ]

  const navItems = isAdmin ? [...userNavItems, ...adminNavItems] : userNavItems

  const filteredNav =
    query.length > 0
      ? navItems.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
      : navItems

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder={t('search.placeholder')}
        value={query}
        onValueChange={handleQueryChange}
      />
      <CommandList>
        <CommandEmpty>{loading ? t('search.searching') : t('search.no_results')}</CommandEmpty>

        {/* Navigation */}
        {filteredNav.length > 0 && (
          <CommandGroup heading={t('search.navigation')}>
            {filteredNav.map((item) => (
              <CommandItem key={item.href} onSelect={() => navigate(item.href)}>
                <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Projects */}
        {results?.projects && results.projects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t('search.projects')}>
              {results.projects.map((p) => (
                <CommandItem key={p.id} onSelect={() => navigate(`/board?project=${p.id}`)}>
                  <FolderOpen className="mr-2 h-4 w-4 text-muted-foreground" />
                  {p.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Slides (admin only) */}
        {isAdmin && results?.slides && results.slides.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t('search.slides')}>
              {results.slides.map((s) => (
                <CommandItem key={s.id} onSelect={() => navigate('/admin/slides')}>
                  <Image className="mr-2 h-4 w-4 text-muted-foreground" />
                  {s.title}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Team (admin only) */}
        {isAdmin && results?.users && results.users.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t('search.team')}>
              {results.users.map((u) => (
                <CommandItem key={u.id} onSelect={() => navigate('/admin/team')}>
                  <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                  {u.display_name ?? u.email}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
