'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Clock } from 'lucide-react'
import { useCurrentUser } from '@/hooks/use-current-user'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { getTrialDaysRemaining } from '@/lib/subscription-helpers'
import type { Subscription } from '@/lib/subscription-helpers'

interface SubscriptionResponse {
  subscription: Subscription
}

export function SubscriptionBanner() {
  const { isAdmin, loading: userLoading } = useCurrentUser()
  const [subscription, setSubscription] = useState<Subscription | null>(null)

  useEffect(() => {
    if (userLoading) return

    async function load() {
      const supabase = createBrowserSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch('/api/subscription', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => null)

      if (!res?.ok) return
      const data: SubscriptionResponse = await res.json()
      if (data?.subscription) setSubscription(data.subscription)
    }

    load()
  }, [userLoading])

  if (!subscription) return null

  // Trial countdown / expired banner
  if (subscription.status === 'trialing') {
    const daysRemaining = getTrialDaysRemaining(subscription)
    if (daysRemaining === null) return null

    if (daysRemaining <= 0) {
      return (
        <div className="flex items-center justify-between gap-4 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Your free trial has ended. Subscribe to continue using deckr.</span>
          </div>
          {isAdmin && (
            <Link
              href="/admin/billing"
              className="shrink-0 font-medium underline underline-offset-2 hover:no-underline"
            >
              Subscribe now
            </Link>
          )}
        </div>
      )
    }

    return (
      <div className="flex items-center justify-between gap-4 border-b bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 shrink-0" />
          <span>
            <strong>{daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</strong> left in your free trial
          </span>
        </div>
        {isAdmin && (
          <Link
            href="/admin/billing"
            className="shrink-0 font-medium underline underline-offset-2 hover:no-underline"
          >
            Subscribe now
          </Link>
        )}
      </div>
    )
  }

  // Past-due warning banner
  if (subscription.status === 'past_due') {
    return (
      <div className="flex items-center justify-between gap-4 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Your last payment failed. Update your payment method to avoid service interruption.
          </span>
        </div>
        {isAdmin && (
          <Link
            href="/admin/billing"
            className="shrink-0 font-medium underline underline-offset-2 hover:no-underline"
          >
            Fix billing
          </Link>
        )}
      </div>
    )
  }

  return null
}
