'use client'

import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { LandingNav } from '@/components/landing-nav'
import { LanguageToggle } from '@/components/language-toggle'
import { Separator } from '@/components/ui/separator'

// ---------------------------------------------------------------------------
// Legal pages layout — LandingNav + content + footer with all legal links
// ---------------------------------------------------------------------------

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <LandingNav />

      {/* Language toggle bar */}
      <div className="mx-auto flex w-full max-w-3xl items-center justify-end px-6 pt-6">
        <LanguageToggle />
      </div>

      {/* Page content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t bg-secondary py-10">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold select-none">
                O
              </div>
              <span className="text-sm font-semibold tracking-tight text-foreground">
                onslide Studio
              </span>
            </Link>

            <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <Link href="/impressum" className="hover:text-foreground transition-colors">
                {t('landing.impressum')}
              </Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                {t('landing.privacy')}
              </Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                {t('landing.terms')}
              </Link>
              <Link href="/cookies" className="hover:text-foreground transition-colors">
                {t('landing.cookies_link')}
              </Link>
              <Link href="/dpa" className="hover:text-foreground transition-colors">
                {t('landing.dpa')}
              </Link>
              <Link href="/cancellation" className="hover:text-foreground transition-colors">
                {t('landing.cancellation')}
              </Link>
              <Separator orientation="vertical" className="h-3 bg-border" />
              <button
                className="hover:text-foreground transition-colors"
                onClick={() => {
                  localStorage.removeItem('onslide_cookie_consent')
                  window.location.reload()
                }}
              >
                {t('legal.cookie_settings')}
              </button>
            </nav>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            {t('landing.footer_copyright', { year: new Date().getFullYear() })}
          </p>
        </div>
      </footer>
    </div>
  )
}
