'use client'

import { useTranslation } from 'react-i18next'
import { LegalPage } from '@/components/legal/legal-page'
import { LegalSection } from '@/components/legal/legal-section'

export default function ImpressumPage() {
  const { t } = useTranslation()

  return (
    <LegalPage title={t('legal.impressum_title')}>
      <LegalSection
        heading={t('legal.impressum_company')}
        body={t('legal.impressum_company_text')}
      />
      <LegalSection
        heading={t('legal.impressum_represented')}
        body={t('legal.impressum_represented_text')}
      />
      <LegalSection
        heading={t('legal.impressum_register')}
        body={t('legal.impressum_register_text')}
      />
      <LegalSection heading={t('legal.impressum_vat')} body={t('legal.impressum_vat_text')} />
      <LegalSection
        heading={t('legal.impressum_contact')}
        body={t('legal.impressum_contact_text')}
      />
      <LegalSection
        heading={t('legal.impressum_responsible')}
        body={t('legal.impressum_responsible_text')}
      />
      <LegalSection
        heading={t('legal.impressum_dispute')}
        body={t('legal.impressum_dispute_text')}
      />
    </LegalPage>
  )
}
