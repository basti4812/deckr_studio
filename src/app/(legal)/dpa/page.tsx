'use client'

import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LegalPage } from '@/components/legal/legal-page'
import { LegalSection } from '@/components/legal/legal-section'

export default function DpaPage() {
  const { t } = useTranslation()

  return (
    <LegalPage title={t('legal.dpa_title')}>
      <LegalSection heading={t('legal.dpa_intro')} body={t('legal.dpa_intro_text')} />
      <LegalSection heading={t('legal.dpa_scope')} body={t('legal.dpa_scope_text')} />
      <LegalSection heading={t('legal.dpa_toms')} body={t('legal.dpa_toms_text')} />
      <LegalSection heading={t('legal.dpa_subprocessors')} body={t('legal.dpa_subprocessors_text')} />

      {/* Download card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">{t('legal.dpa_download')}</CardTitle>
          <CardDescription>{t('legal.dpa_download_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <a href="/legal/dpa-template.docx" download>
              <Download className="mr-2 h-4 w-4" />
              {t('legal.dpa_download_button')}
            </a>
          </Button>
        </CardContent>
      </Card>
    </LegalPage>
  )
}
