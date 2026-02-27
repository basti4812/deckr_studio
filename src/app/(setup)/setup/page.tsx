'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from '@/hooks/use-current-user'
import { SetupWizard } from '@/components/setup-wizard'

export default function SetupPage() {
  const router = useRouter()
  const { isAdmin, setupComplete, loading } = useCurrentUser()

  useEffect(() => {
    if (loading) return

    // Non-admins go to home
    if (!isAdmin) {
      router.replace('/home')
      return
    }

    // Already completed setup (persisted in DB)
    if (setupComplete) {
      router.replace('/dashboard')
    }
  }, [isAdmin, setupComplete, loading, router])

  if (loading) return null
  if (!isAdmin) return null

  return <SetupWizard />
}
