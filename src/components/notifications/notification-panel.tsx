'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { NotificationItem, type Notification } from './notification-item'

// ---------------------------------------------------------------------------
// NotificationPanel — bell icon + popover list
// ---------------------------------------------------------------------------

interface NotificationPanelProps {
  userId: string | null
}

export function NotificationPanel({ userId }: NotificationPanelProps) {
  const [open, setOpen] = useState(false)
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
    const { data: { session } } = await supabase.auth.getSession()
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

  // Fetch every time the panel opens
  useEffect(() => {
    if (open) {
      hasFetched.current = true
      fetchNotifications()
    }
  }, [open, fetchNotifications])

  // -------------------------------------------------------------------------
  // Supabase Realtime subscription for unread count
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!userId) return

    const supabase = createBrowserSupabaseClient()

    // Fetch initial unread count
    async function getUnreadCount() {
      const { data: { session } } = await supabase.auth.getSession()
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

    // Subscribe to new notifications via Realtime
    const channel = supabase
      .channel('notifications-badge')
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
          // If the panel is open, prepend the new notification
          if (hasFetched.current) {
            setNotifications((prev) => [payload.new as Notification, ...prev])
          }
        },
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
      prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n)),
    )
    setUnreadCount((c) => Math.max(0, c - 1))

    const supabase = createBrowserSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    await fetch('/api/notifications/read-all', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <SidebarMenuItem>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <SidebarMenuButton tooltip="Notifications" className="relative">
            <Bell className="h-4 w-4" />
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </SidebarMenuButton>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="end"
          sideOffset={8}
          className="w-80 p-0"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={markAllRead}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </Button>
            )}
          </div>

          {/* List */}
          <ScrollArea className="max-h-80">
            {notifications.length === 0 && !loading ? (
              <div className="flex flex-col items-center justify-center gap-1 py-8">
                <Bell className="h-6 w-6 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onMarkRead={markRead}
                  />
                ))}
              </div>
            )}

            {/* Load more */}
            {hasMore && (
              <div className="border-t p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => fetchNotifications(nextCursor)}
                  disabled={loading}
                >
                  {loading ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </SidebarMenuItem>
  )
}
