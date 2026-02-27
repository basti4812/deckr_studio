import { Construction } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface PlaceholderPageProps {
  title: string
  description: string
  projId?: string
}

export function PlaceholderPage({
  title,
  description,
  projId,
}: PlaceholderPageProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        {projId && (
          <Badge variant="outline" className="text-xs font-mono">
            {projId}
          </Badge>
        )}
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Construction className="h-8 w-8 text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              This feature is coming soon
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Implementation will be added in a future sprint
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
