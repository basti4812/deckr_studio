'use client'

import { useTranslation } from 'react-i18next'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'

const LANGUAGES = [
  { code: 'de', label: 'DE' },
  { code: 'en', label: 'EN' },
] as const

export function LanguageToggle() {
  const { i18n } = useTranslation()
  const currentLang = i18n.language

  async function handleLanguageChange(lang: string) {
    // 1. Immediate UI switch
    i18n.changeLanguage(lang)

    // 2. Persist to backend if user is authenticated
    try {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session) {
        await fetch('/api/profile', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ preferred_language: lang }),
        })
      }
      // If no session (public page), language is changed locally only
    } catch {
      // Persistence failed silently -- the local language change still applies
    }
  }

  return (
    <div className="flex gap-1" role="group" aria-label="Language selection">
      {LANGUAGES.map(({ code, label }) => (
        <Button
          key={code}
          size="sm"
          variant={currentLang === code ? 'default' : 'ghost'}
          className="h-7 px-2 text-xs font-medium"
          onClick={() => handleLanguageChange(code)}
          aria-pressed={currentLang === code}
          aria-label={`Switch language to ${label}`}
        >
          {label}
        </Button>
      ))}
    </div>
  )
}
