import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * Supabase-backed rate limiter — persists across serverless cold starts.
 * Returns a 429 NextResponse if the user has exceeded the limit, otherwise null.
 */
export async function checkRateLimit(
  userId: string,
  endpoint: string,
  maxRequests: number,
  windowMs: number,
): Promise<NextResponse | null> {
  const supabase = createServiceClient()
  const now = new Date()

  const { data } = await supabase
    .from('rate_limits')
    .select('count, reset_at')
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .maybeSingle()

  const windowActive = data !== null && new Date(data.reset_at) > now

  if (windowActive && data.count >= maxRequests) {
    const retryAfterSec = Math.ceil(
      (new Date(data.reset_at).getTime() - now.getTime()) / 1000,
    )
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    )
  }

  if (windowActive) {
    await supabase
      .from('rate_limits')
      .update({ count: data.count + 1 })
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
  } else {
    const resetAt = new Date(now.getTime() + windowMs).toISOString()
    await supabase
      .from('rate_limits')
      .upsert({ user_id: userId, endpoint, count: 1, reset_at: resetAt })
  }

  return null
}

/**
 * Supabase-backed IP rate limiter — for unauthenticated endpoints like registration.
 * Returns a 429 NextResponse if the IP has exceeded the limit, otherwise null.
 */
export async function checkIpRateLimit(
  request: NextRequest,
  endpoint: string,
  maxRequests: number,
  windowMs: number,
): Promise<NextResponse | null> {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'

  const supabase = createServiceClient()
  const now = new Date()

  const { data } = await supabase
    .from('ip_rate_limits')
    .select('count, reset_at')
    .eq('ip', ip)
    .eq('endpoint', endpoint)
    .maybeSingle()

  const windowActive = data !== null && new Date(data.reset_at) > now

  if (windowActive && data.count >= maxRequests) {
    const retryAfterSec = Math.ceil(
      (new Date(data.reset_at).getTime() - now.getTime()) / 1000,
    )
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    )
  }

  if (windowActive) {
    await supabase
      .from('ip_rate_limits')
      .update({ count: data.count + 1 })
      .eq('ip', ip)
      .eq('endpoint', endpoint)
  } else {
    const resetAt = new Date(now.getTime() + windowMs).toISOString()
    await supabase
      .from('ip_rate_limits')
      .upsert({ ip, endpoint, count: 1, reset_at: resetAt })
  }

  return null
}
