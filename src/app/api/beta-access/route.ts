import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { checkIpRateLimit } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  // SEC-4: Rate limit by IP — 10 attempts per 15 minutes
  const limited = await checkIpRateLimit(request, 'beta-access', 10, 15 * 60 * 1000)
  if (limited) return limited

  const betaPassword = process.env.BETA_ACCESS_PASSWORD
  if (!betaPassword) {
    return NextResponse.json({ error: 'Beta access not configured' }, { status: 500 })
  }

  let body: { password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // SEC-4: Use timing-safe comparison to prevent timing attacks
  if (!body.password) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  try {
    const expectedBuf = Buffer.from(betaPassword)
    const providedBuf = Buffer.from(body.password)
    if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set('onslide_beta_access', 'granted', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 90, // 90 days
    path: '/',
  })

  return response
}
