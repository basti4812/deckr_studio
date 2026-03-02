import Link from 'next/link'
import { ArrowLeft, Construction } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function DowngradePage() {
  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2" asChild>
          <Link href="/admin/billing">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Billing
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Downgrade Plan
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Switch to a lower plan with fewer features and seats.
        </p>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Construction className="h-8 w-8 text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Payment provider integration coming soon
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Plan downgrades will be available once the payment provider is
              connected.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
