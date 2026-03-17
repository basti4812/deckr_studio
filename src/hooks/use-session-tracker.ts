'use client'

import { useEffect, useRef } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase'

const SESSION_KEY = 'onslide_session_id'
const UPDATE_INTERVAL = 5 * 60_000 // 5 minutes

function getDeviceInfo(): string {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'Android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS'
  if (/Mac/i.test(ua)) return 'macOS'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Linux/i.test(ua)) return 'Linux'
  return 'Unknown device'
}

function getBrowserInfo(): string {
  const ua = navigator.userAgent
  if (/Edg\//i.test(ua)) return 'Edge'
  if (/Chrome\//i.test(ua)) return 'Chrome'
  if (/Firefox\//i.test(ua)) return 'Firefox'
  if (/Safari\//i.test(ua)) return 'Safari'
  return 'Browser'
}

export function useSessionTracker() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let mounted = true

    async function trackSession() {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session || !mounted) return

      const existingSessionId = sessionStorage.getItem(SESSION_KEY)
      const deviceInfo = `${getDeviceInfo()} · ${getBrowserInfo()}`

      if (existingSessionId) {
        // Update existing session
        await supabase
          .from('user_sessions')
          .update({ last_active_at: new Date().toISOString(), device_info: deviceInfo })
          .eq('id', existingSessionId)
          .eq('user_id', session.user.id)
      } else {
        // Create new session
        const { data } = await supabase
          .from('user_sessions')
          .insert({
            user_id: session.user.id,
            tenant_id: (session.user.user_metadata as { tenant_id?: string })?.tenant_id ?? '',
            device_info: deviceInfo,
          })
          .select('id')
          .single()

        if (data?.id) {
          sessionStorage.setItem(SESSION_KEY, data.id)
        }
      }
    }

    trackSession()

    // Update last_active_at every 5 minutes
    intervalRef.current = setInterval(trackSession, UPDATE_INTERVAL)

    return () => {
      mounted = false
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])
}
