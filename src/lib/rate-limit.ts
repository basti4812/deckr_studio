import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

interface RateLimitResult {
  current_count: number
  is_limited: boolean
  retry_after_sec: number
}

/**
 * Supabase-backed rate limiter — persists across serverless cold starts.
 * Uses an atomic RPC function to avoid race conditions.
 * Returns a 429 NextResponse if the user has exceeded the limit, otherwise null.
 */
export async function checkRateLimit(
  userId: string,
  endpoint: string,
  maxRequests: number,
  windowMs: number,
): Promise<NextResponse | null> {
  const supabase = createServiceClient()

  const { data, error } = await supabase.rpc('increment_rate_limit', {
    p_user_id: userId,
    p_endpoint: endpoint,
    p_max_requests: maxRequests,
    p_window_ms: windowMs,
  }).single() as { data: RateLimitResult | null; error: unknown }

  if (error || !data) {
    // If the RPC fails, allow the request through rather than blocking
    console.error('Rate limit RPC error:', error)
    return null
  }

  if (data.is_limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(data.retry_after_sec) } },
    )
  }

  return null
}

/**
 * Supabase-backed IP rate limiter — for unauthenticated endpoints like registration.
 * Uses an atomic RPC function to avoid race conditions.
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

  const { data, error } = await supabase.rpc('increment_ip_rate_limit', {
    p_ip: ip,
    p_endpoint: endpoint,
    p_max_requests: maxRequests,
    p_window_ms: windowMs,
  }).single() as { data: RateLimitResult | null; error: unknown }

  if (error || !data) {
    console.error('IP rate limit RPC error:', error)
    return null
  }

  if (data.is_limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(data.retry_after_sec) } },
    )
  }

  return null
}
