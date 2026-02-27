'use client'

import { FileSliders } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SlidesStepProps {
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}

export function SlidesStep({ onNext, onBack, onSkip }: SlidesStepProps) {
  return (
    <div className="space-y-6">
      <div className="flex h-36 flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 text-center">
        <FileSliders className="mb-2 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-medium text-muted-foreground">
          Slide upload coming in a future step
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          You can upload slides later from the Slide Library in your admin workspace.
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        Once you have uploaded your first slides, your team can start assembling
        on-brand presentations right away.
      </p>

      <div className="flex justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>
            Back
          </Button>
          <Button variant="ghost" size="sm" onClick={onSkip}>
            Skip
          </Button>
        </div>
        <Button onClick={onNext}>Next</Button>
      </div>
    </div>
  )
}
