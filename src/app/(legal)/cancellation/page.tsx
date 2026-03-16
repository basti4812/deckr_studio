'use client'

import { useTranslation } from 'react-i18next'
import { LegalPage } from '@/components/legal/legal-page'
import { LegalSection } from '@/components/legal/legal-section'

export default function CancellationPage() {
  const { t } = useTranslation()

  return (
    <LegalPage title={t('legal.cancellation_title')}>
      <LegalSection
        heading={t('legal.cancellation_b2b_notice')}
        body={t('legal.cancellation_b2b_notice_text')}
      />
      <LegalSection
        heading={t('legal.cancellation_how_to')}
        body={t('legal.cancellation_how_to_text')}
      />
      <LegalSection
        heading={t('legal.cancellation_form_title')}
        body={t('legal.cancellation_form_text')}
      />
      <LegalSection
        heading={t('legal.cancellation_contact')}
        body={t('legal.cancellation_contact_text')}
      />
    </LegalPage>
  )
}
