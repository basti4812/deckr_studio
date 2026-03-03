'use client'

import { useTranslation } from 'react-i18next'
import { LegalPage } from '@/components/legal/legal-page'
import { LegalSection } from '@/components/legal/legal-section'

export default function PrivacyPage() {
  const { t } = useTranslation()

  return (
    <LegalPage title={t('legal.privacy_title')}>
      <LegalSection heading={t('legal.privacy_intro')} body={t('legal.privacy_intro_text')} />
      <LegalSection heading={t('legal.privacy_controller')} body={t('legal.privacy_controller_text')} />
      <LegalSection heading={t('legal.privacy_dpo')} body={t('legal.privacy_dpo_text')} />
      <LegalSection heading={t('legal.privacy_data_collected')} body={t('legal.privacy_data_collected_text')} />
      <LegalSection heading={t('legal.privacy_legal_basis')} body={t('legal.privacy_legal_basis_text')} />
      <LegalSection heading={t('legal.privacy_retention')} body={t('legal.privacy_retention_text')} />
      <LegalSection heading={t('legal.privacy_rights')} body={t('legal.privacy_rights_text')} />
      <LegalSection heading={t('legal.privacy_third_parties')} body={t('legal.privacy_third_parties_text')} />
      <LegalSection heading={t('legal.privacy_cookies')} body={t('legal.privacy_cookies_text')} />
      <LegalSection heading={t('legal.privacy_changes')} body={t('legal.privacy_changes_text')} />
      <LegalSection heading={t('legal.privacy_complaints')} body={t('legal.privacy_complaints_text')} />
    </LegalPage>
  )
}
