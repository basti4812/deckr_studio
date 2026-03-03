'use client'

import { useTranslation } from 'react-i18next'
import { LegalPage } from '@/components/legal/legal-page'
import { LegalSection } from '@/components/legal/legal-section'

export default function TermsPage() {
  const { t } = useTranslation()

  return (
    <LegalPage title={t('legal.terms_title')}>
      <LegalSection heading={t('legal.terms_scope')} body={t('legal.terms_scope_text')} />
      <LegalSection heading={t('legal.terms_subscription')} body={t('legal.terms_subscription_text')} />
      <LegalSection heading={t('legal.terms_cancellation')} body={t('legal.terms_cancellation_text')} />
      <LegalSection heading={t('legal.terms_obligations')} body={t('legal.terms_obligations_text')} />
      <LegalSection heading={t('legal.terms_prohibited')} body={t('legal.terms_prohibited_text')} />
      <LegalSection heading={t('legal.terms_liability')} body={t('legal.terms_liability_text')} />
      <LegalSection heading={t('legal.terms_ip')} body={t('legal.terms_ip_text')} />
      <LegalSection heading={t('legal.terms_data_processing')} body={t('legal.terms_data_processing_text')} />
      <LegalSection heading={t('legal.terms_governing_law')} body={t('legal.terms_governing_law_text')} />
      <LegalSection heading={t('legal.terms_changes')} body={t('legal.terms_changes_text')} />
    </LegalPage>
  )
}
