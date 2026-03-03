'use client'

import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  CreditCard,
  RefreshCw,
  Share2,
  UserPlus,
  Clock,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Notification {
  id: string
  type: string
  message: string
  resource_type: string | null
  resource_id: string | null
  is_read: boolean
  created_at: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const iconMap: Record<string, React.ElementType> = {
  project_shared: Share2,
  team_member_joined: UserPlus,
  payment_failed: CreditCard,
  slide_deprecated: AlertTriangle,
  slide_updated: RefreshCw,
  trial_ending_7d: Clock,
  trial_ending_1d: Clock,
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function getNavigationPath(resourceType: string | null, resourceId: string | null): string | null {
  if (!resourceType || !resourceId) {
    if (resourceType === 'billing') return '/admin/billing'
    return null
  }
  if (resourceType === 'project') return `/board?project=${resourceId}`
  if (resourceType === 'slide') return '/board'
  if (resourceType === 'billing') return '/admin/billing'
  return null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface NotificationItemProps {
  notification: Notification
  onMarkRead: (id: string) => void
}

export function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  const router = useRouter()
  const Icon = iconMap[notification.type] ?? Share2

  function handleClick() {
    if (!notification.is_read) onMarkRead(notification.id)
    const path = getNavigationPath(notification.resource_type, notification.resource_id)
    if (path) router.push(path)
  }

  return (
    <button
      onClick={handleClick}
      className={`w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors ${
        notification.is_read ? 'opacity-60' : ''
      }`}
    >
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs leading-relaxed">{notification.message}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {relativeTime(notification.created_at)}
        </p>
      </div>
      {!notification.is_read && (
        <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
      )}
    </button>
  )
}
