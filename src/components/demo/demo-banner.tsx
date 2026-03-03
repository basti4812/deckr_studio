'use client'

import Link from 'next/link'
import { Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export function DemoBanner() {
  const { t } = useTranslation()

  return (
    <div
      role="banner"
      aria-label="Demo notice"
      className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b bg-primary/5 px-4 py-2.5 text-center backdrop-blur supports-[backdrop-filter]:bg-primary/5"
    >
      <div className="flex items-center gap-2 text-sm text-foreground/80">
        <Info className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span>{t('demo.banner_text')}</span>
      </div>
      <Button size="sm" asChild>
        <Link href="/register">{t('demo.create_free_account')}</Link>
      </Button>
    </div>
  )
}
