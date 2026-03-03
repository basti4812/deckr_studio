'use client'

import { useEffect, type ReactNode } from 'react'
import i18n from 'i18next'
import { I18nextProvider, initReactI18next, useTranslation } from 'react-i18next'
import HttpBackend from 'i18next-http-backend'
import { useTenantContext } from '@/providers/tenant-provider'

// ---------------------------------------------------------------------------
// Singleton i18n instance -- initialized once, reused across renders
// ---------------------------------------------------------------------------

let initialized = false

function getI18nInstance() {
  if (!initialized) {
    i18n
      .use(HttpBackend)
      .use(initReactI18next)
      .init({
        backend: {
          loadPath: '/locales/{{lng}}.json',
        },
        fallbackLng: 'en',
        supportedLngs: ['en', 'de'],
        interpolation: {
          escapeValue: false, // React already escapes
        },
        react: {
          useSuspense: false,
        },
      })
    initialized = true
  }
  return i18n
}

// ---------------------------------------------------------------------------
// I18nProvider -- wraps children with I18nextProvider
// ---------------------------------------------------------------------------

interface I18nProviderProps {
  children: ReactNode
  defaultLang?: string
}

export function I18nProvider({ children, defaultLang }: I18nProviderProps) {
  const instance = getI18nInstance()

  useEffect(() => {
    // Detect language: browser locale -> defaultLang prop -> 'en'
    const browserLang =
      typeof window !== 'undefined' ? navigator.language.split('-')[0] : undefined
    const supportedLngs = ['en', 'de']

    const detected =
      (browserLang && supportedLngs.includes(browserLang) ? browserLang : undefined) ??
      (defaultLang && supportedLngs.includes(defaultLang) ? defaultLang : undefined) ??
      'en'

    if (instance.language !== detected) {
      instance.changeLanguage(detected)
    }
  }, [defaultLang, instance])

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>
}

// ---------------------------------------------------------------------------
// I18nLanguageSync -- syncs i18n language with tenant context
// Place this INSIDE TenantProvider in layouts that have it.
// ---------------------------------------------------------------------------

export function I18nLanguageSync() {
  const { preferredLanguage, defaultLanguage } = useTenantContext()
  const { i18n: i18nInstance } = useTranslation()

  useEffect(() => {
    const lang = preferredLanguage || defaultLanguage || 'en'
    if (i18nInstance.language !== lang) {
      i18nInstance.changeLanguage(lang)
    }
  }, [preferredLanguage, defaultLanguage, i18nInstance])

  return null
}
