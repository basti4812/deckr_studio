'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TenantData {
  id: string
  name: string
  logo_url: string | null
  primary_color: string | null
  default_language: string
  sso_provider: string | null
  crm_provider: string | null
  setup_complete: boolean
  setup_step: number
  created_at: string
}

interface UserData {
  id: string
  role: 'admin' | 'employee'
  display_name: string | null
  avatar_url: string | null
  preferred_language: string
  is_active: boolean
  tenant: TenantData
}

interface TenantContextValue {
  // Tenant fields
  tenantId: string | null
  tenantName: string | null
  logoUrl: string | null
  primaryColor: string | null
  defaultLanguage: string | null
  crmProvider: string | null
  setupComplete: boolean
  setupStep: number

  // User fields
  userId: string | null
  role: 'admin' | 'employee' | null
  displayName: string | null
  avatarUrl: string | null
  preferredLanguage: string | null
  isAdmin: boolean

  // State
  loading: boolean
  error: string | null

  // Actions
  refresh: () => Promise<void>
  updatePreferredLanguage: (lang: string) => void
}

export const TenantContext = createContext<TenantContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function TenantProvider({ children }: { children: ReactNode }) {
  const [userData, setUserData] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTenantData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Get the current session
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        setUserData(null)
        return
      }

      const response = await fetch('/api/tenant', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? 'Failed to load tenant data')
      }

      const { user } = (await response.json()) as { user: UserData }
      setUserData(user)

      // Apply tenant primary color as CSS custom property
      if (user.tenant.primary_color) {
        document.documentElement.style.setProperty(
          '--tenant-primary-color',
          user.tenant.primary_color
        )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load tenant data'
      setError(message)
      setUserData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTenantData()

    // Re-fetch when auth state changes (login/logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        fetchTenantData()
      } else {
        setUserData(null)
        setLoading(false)
        document.documentElement.style.removeProperty('--tenant-primary-color')
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [fetchTenantData])

  const updatePreferredLanguage = useCallback((lang: string) => {
    setUserData((prev) => (prev ? { ...prev, preferred_language: lang } : prev))
  }, [])

  const value: TenantContextValue = {
    tenantId: userData?.tenant.id ?? null,
    tenantName: userData?.tenant.name ?? null,
    logoUrl: userData?.tenant.logo_url ?? null,
    primaryColor: userData?.tenant.primary_color ?? null,
    defaultLanguage: userData?.tenant.default_language ?? null,
    crmProvider: userData?.tenant.crm_provider ?? null,
    setupComplete: userData?.tenant.setup_complete ?? false,
    setupStep: userData?.tenant.setup_step ?? 0,

    userId: userData?.id ?? null,
    role: userData?.role ?? null,
    displayName: userData?.display_name ?? null,
    avatarUrl: userData?.avatar_url ?? null,
    preferredLanguage: userData?.preferred_language ?? null,
    isAdmin: userData?.role === 'admin',

    loading,
    error,
    refresh: fetchTenantData,
    updatePreferredLanguage,
  }

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

// ---------------------------------------------------------------------------
// Hook (internal, used by useCurrentUser)
// ---------------------------------------------------------------------------

export function useTenantContext(): TenantContextValue {
  const context = useContext(TenantContext)
  if (!context) {
    throw new Error('useTenantContext must be used within a TenantProvider')
  }
  return context
}
