'use client'

import { FileSliders } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

interface SlidesStepProps {
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}

export function SlidesStep({ onNext, onBack, onSkip }: SlidesStepProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div className="flex h-36 flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 text-center">
        <FileSliders className="mb-2 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-medium text-muted-foreground">
          {t('setup.slides_upload_coming')}
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          {t('setup.slides_upload_later')}
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        {t('setup.slides_intro')}
      </p>

      <div className="flex justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>
            {t('setup.back')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onSkip}>
            {t('setup.skip')}
          </Button>
        </div>
        <Button onClick={onNext}>{t('setup.next')}</Button>
      </div>
    </div>
  )
}
