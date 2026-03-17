'use client'

import { useTranslation } from 'react-i18next'

type ViewerErrorType = 'not-found' | 'expired' | 'no-slides' | 'slides-unavailable'

export function ViewerError({ type }: { type: ViewerErrorType }) {
  const { t } = useTranslation()

  const config: Record<ViewerErrorType, { title: string; description: string }> = {
    'not-found': {
      title: t('viewer.link_not_found'),
      description: t('viewer.link_not_found_desc'),
    },
    expired: {
      title: t('viewer.link_expired'),
      description: t('viewer.link_expired_desc'),
    },
    'no-slides': {
      title: t('viewer.no_slides'),
      description: t('viewer.no_slides_desc'),
    },
    'slides-unavailable': {
      title: t('viewer.slides_unavailable'),
      description: t('viewer.slides_unavailable_desc'),
    },
  }

  const { title, description } = config[type]

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-3 px-6">
        <h1 className="font-heading text-2xl font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">{description}</p>
      </div>
    </div>
  )
}
