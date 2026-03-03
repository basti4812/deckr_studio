'use client'

import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Info } from 'lucide-react'

// ---------------------------------------------------------------------------
// LegalPage — shared wrapper for all legal pages. Shows title, updated date,
// a placeholder notice alert, and renders children (LegalSections).
// ---------------------------------------------------------------------------

interface LegalPageProps {
  title: string
  children: React.ReactNode
}

export function LegalPage({ title, children }: LegalPageProps) {
  const { t } = useTranslation()

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900">{title}</h1>
      <p className="mt-1 text-sm text-gray-400">{t('legal.last_updated')}</p>

      <Alert className="mt-6 border-yellow-300 bg-yellow-50">
        <Info className="h-4 w-4 text-yellow-700" />
        <AlertDescription className="text-sm text-yellow-800">
          {t('legal.placeholder_notice')}
        </AlertDescription>
      </Alert>

      <div className="mt-8 space-y-8">
        {children}
      </div>
    </article>
  )
}
