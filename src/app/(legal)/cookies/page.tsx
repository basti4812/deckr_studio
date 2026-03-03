'use client'

import { useTranslation } from 'react-i18next'
import { LegalPage } from '@/components/legal/legal-page'
import { LegalSection } from '@/components/legal/legal-section'

export default function CookiePolicyPage() {
  const { t } = useTranslation()

  return (
    <LegalPage title={t('legal.cookie_policy_title')}>
      <LegalSection heading={t('legal.cookie_intro')} body={t('legal.cookie_intro_text')} />
      <LegalSection heading={t('legal.cookie_how_we_use')} body={t('legal.cookie_how_we_use_text')} />
      <LegalSection heading={t('legal.cookie_necessary_title')} body={t('legal.cookie_necessary_text')} />
      <LegalSection heading={t('legal.cookie_functional_title')} body={t('legal.cookie_functional_text')} />
      <LegalSection heading={t('legal.cookie_analytics_title')} body={t('legal.cookie_analytics_text')} />
      <LegalSection heading={t('legal.cookie_marketing_title')} body={t('legal.cookie_marketing_text')} />
      <LegalSection heading={t('legal.cookie_manage')} body={t('legal.cookie_manage_text')} />
      <LegalSection heading={t('legal.cookie_changes')} body={t('legal.cookie_changes_text')} />
    </LegalPage>
  )
}
