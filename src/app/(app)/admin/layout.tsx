'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from '@/hooks/use-current-user'
import { Skeleton } from '@/components/ui/skeleton'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { isAdmin, loading } = useCurrentUser()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace('/home')
    }
  }, [isAdmin, loading, router])

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-4 w-72" />
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  return <>{children}</>
}
