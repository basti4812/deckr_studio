// ---------------------------------------------------------------------------
// Subscription types and helpers (server-side safe)
// ---------------------------------------------------------------------------

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled'

export interface Subscription {
  id: string
  tenant_id: string
  status: SubscriptionStatus
  pricing_tier: string | null
  licensed_seats: number | null
  billing_cycle: 'monthly' | 'annual' | null
  trial_ends_at: string | null
  next_renewal_date: string | null
  payment_provider_customer_id: string | null
  payment_provider_price_id: string | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// isSubscriptionBlocked
// Returns true when the subscription has expired or been cancelled.
// A missing subscription record is treated as expired (safe default).
// ---------------------------------------------------------------------------

export function isSubscriptionBlocked(
  subscription: Pick<Subscription, 'status' | 'trial_ends_at'> | null
): boolean {
  if (!subscription) return true
  if (subscription.status === 'cancelled') return true
  if (
    subscription.status === 'trialing' &&
    subscription.trial_ends_at !== null &&
    new Date(subscription.trial_ends_at) < new Date()
  ) {
    return true
  }
  return false
}

// ---------------------------------------------------------------------------
// getTrialDaysRemaining
// Returns days left in trial (rounded up), or null if not in trial.
// Returns 0 if trial has already expired.
// ---------------------------------------------------------------------------

export function getTrialDaysRemaining(
  subscription: Pick<Subscription, 'status' | 'trial_ends_at'> | null
): number | null {
  if (!subscription || subscription.status !== 'trialing') return null
  if (!subscription.trial_ends_at) return null
  const diffMs = new Date(subscription.trial_ends_at).getTime() - Date.now()
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

// ---------------------------------------------------------------------------
// isSeatLimitReached
// Returns true when licensed_seats is set and current user count >= limit.
// Returns false if licensed_seats is null (no seat cap).
// ---------------------------------------------------------------------------

export function isSeatLimitReached(
  subscription: Pick<Subscription, 'licensed_seats'> | null,
  currentUserCount: number
): boolean {
  if (!subscription || subscription.licensed_seats === null) return false
  return currentUserCount >= subscription.licensed_seats
}
