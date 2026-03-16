'use client'

import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { useCurrentUser } from '@/hooks/use-current-user'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function SubscriptionBlockedPage() {
  const { isAdmin } = useCurrentUser()

  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>Your trial has ended</CardTitle>
          <CardDescription>
            Your free trial period has expired or your subscription has been cancelled. Subscribe to
            continue using onslide Studio.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isAdmin ? (
            <>
              <Button asChild className="w-full">
                <Link href="/admin/billing">Go to Billing</Link>
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Choose a plan to restore full access for your team.
              </p>
            </>
          ) : (
            <>
              <p className="text-center text-sm text-muted-foreground">
                Please ask your account admin to renew the subscription.
              </p>
              <Button variant="outline" asChild className="w-full">
                <Link href="/profile">Go to Profile</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
