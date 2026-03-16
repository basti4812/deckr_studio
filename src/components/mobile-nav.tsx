'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, CheckCheck, FolderOpen, Home, Settings, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useCurrentUser } from '@/hooks/use-current-user'
import { NotificationItem, type Notification } from '@/components/notifications/notification-item'

// ---------------------------------------------------------------------------
// MobileNav — fixed bottom navigation bar (hidden on md+)
// ---------------------------------------------------------------------------

export function MobileNav() {
  const { t } = useTranslation()
  const pathname = usePathname()
  const { userId, isAdmin } = useCurrentUser()
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const hasFetched = useRef(false)

  // -------------------------------------------------------------------------
  // Fetch notifications
  // -------------------------------------------------------------------------

  const fetchNotifications = useCallback(async (cursor?: string | null) => {
    const supabase = createBrowserSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    setLoading(true)
    const url = cursor
      ? `/api/notifications?cursor=${encodeURIComponent(cursor)}`
      : '/api/notifications'
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const d = await res.json()
      if (cursor) {
        setNotifications((prev) => [...prev, ...(d.notifications ?? [])])
      } else {
        setNotifications(d.notifications ?? [])
      }
      setUnreadCount(d.unreadCount ?? 0)
      setHasMore(d.hasMore ?? false)
      setNextCursor(d.nextCursor ?? null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (notifOpen) {
      hasFetched.current = true
      fetchNotifications()
    }
  }, [notifOpen, fetchNotifications])

  // Subscribe to new notifications for badge count
  useEffect(() => {
    if (!userId) return
    const supabase = createBrowserSupabaseClient()

    async function getUnreadCount() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/notifications?limit=1', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const d = await res.json()
        setUnreadCount(d.unreadCount ?? 0)
      }
    }
    getUnreadCount()

    const channel = supabase
      .channel('mobile-nav-notifications-badge')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setUnreadCount((c) => c + 1)
          if (hasFetched.current) {
            setNotifications((prev) => [payload.new as Notification, ...prev])
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async function markRead(notificationId: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
    )
    setUnreadCount((c) => Math.max(0, c - 1))
    const supabase = createBrowserSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    await fetch(`/api/notifications/${notificationId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setUnreadCount(0)
    const supabase = createBrowserSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    await fetch('/api/notifications/read-all', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
  }

  // -------------------------------------------------------------------------
  // Nav items
  // -------------------------------------------------------------------------

  const navItems = [
    { href: '/home', icon: Home, labelKey: 'nav.home' },
    { href: '/projects', icon: FolderOpen, labelKey: 'nav.projects' },
    { href: '/profile', icon: User, labelKey: 'nav.profile' },
  ]

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center border-t bg-background md:hidden pb-[env(safe-area-inset-bottom)]">
      {/* Home */}
      <Link
        href="/home"
        className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors min-h-[44px] ${
          isActive('/home') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        }`}
        aria-label={t('nav.home')}
      >
        <Home className="h-5 w-5" />
        <span>{t('nav.home')}</span>
      </Link>

      {/* Projects */}
      <Link
        href="/projects"
        className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors min-h-[44px] ${
          isActive('/projects') || isActive('/board')
            ? 'text-primary'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        aria-label={t('nav.projects')}
      >
        <FolderOpen className="h-5 w-5" />
        <span>{t('nav.projects')}</span>
      </Link>

      {/* Notifications */}
      <Popover open={notifOpen} onOpenChange={setNotifOpen}>
        <PopoverTrigger asChild>
          <button
            className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors min-h-[44px] ${
              notifOpen ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-label={t('notifications.tooltip')}
          >
            <Bell className="h-5 w-5" />
            <span>{t('notifications.tooltip')}</span>
            {unreadCount > 0 && (
              <span className="absolute right-[calc(50%-10px)] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="center" sideOffset={8} className="w-80 p-0">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">{t('notifications.tooltip')}</span>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={markAllRead}>
                <CheckCheck className="h-3.5 w-3.5" />
                {t('notifications.mark_all_read')}
              </Button>
            )}
          </div>
          <ScrollArea className="max-h-72">
            {notifications.length === 0 && !loading ? (
              <div className="flex flex-col items-center justify-center gap-1 py-8">
                <Bell className="h-6 w-6 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">
                  {t('notifications.no_notifications')}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((n) => (
                  <NotificationItem key={n.id} notification={n} onMarkRead={markRead} />
                ))}
              </div>
            )}
            {hasMore && (
              <div className="border-t p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => fetchNotifications(nextCursor)}
                  disabled={loading}
                >
                  {loading ? t('notifications.loading') : t('notifications.load_more')}
                </Button>
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Admin (admins only) */}
      {isAdmin ? (
        <Link
          href="/admin/slides"
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors min-h-[44px] ${
            isActive('/admin') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-label={t('nav.admin_workspace')}
        >
          <Settings className="h-5 w-5" />
          <span>{t('nav.admin_workspace')}</span>
        </Link>
      ) : (
        /* Profile (non-admins) */
        <Link
          href="/profile"
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors min-h-[44px] ${
            isActive('/profile') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-label={t('nav.profile')}
        >
          <User className="h-5 w-5" />
          <span>{t('nav.profile')}</span>
        </Link>
      )}
    </nav>
  )
}
