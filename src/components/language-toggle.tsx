'use client'

import { useTranslation } from 'react-i18next'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'

const LANGUAGES = [
  { code: 'de', label: 'DE' },
  { code: 'en', label: 'EN' },
] as const

async function persistLanguage(lang: string) {
  try {
    const supabase = createBrowserSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    fetch('/api/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ preferred_language: lang }),
    })
  } catch {
    // Persistence failed silently
  }
}

export function LanguageToggle() {
  const { i18n } = useTranslation()
  const currentLang = i18n.language

  function handleLanguageChange(lang: string) {
    // Immediate UI switch
    i18n.changeLanguage(lang)

    // Persist to backend in background (fire-and-forget)
    persistLanguage(lang)
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
