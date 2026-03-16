'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Globe, Menu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'

export function LandingNav() {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      setLoggedIn(!!session)
    })
  }, [])

  const currentLang = i18n.language?.startsWith('de') ? 'de' : 'en'
  const toggleLang = () => {
    i18n.changeLanguage(currentLang === 'de' ? 'en' : 'de')
  }

  const navLinks = [
    { label: t('landing.how_it_works_nav'), href: '#how-it-works' },
    { label: t('landing.pricing_nav'), href: '#pricing' },
    { label: t('landing.faq_nav'), href: '#faq' },
  ]

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold select-none">
            O
          </div>
          <span className="text-sm font-semibold tracking-tight text-foreground">onslide.io</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Desktop actions */}
        <div className="hidden items-center gap-3 md:flex">
          {/* Language switcher */}
          <button
            onClick={toggleLang}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            title={t('landing.language_switch')}
          >
            <Globe className="h-4 w-4" />
            <span className="text-xs font-medium uppercase">{currentLang}</span>
          </button>

          {loggedIn ? (
            <Button size="sm" className="rounded-lg" asChild>
              <Link href="/home">{t('landing.open_app')}</Link>
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="text-muted-foreground hover:text-foreground"
              >
                <Link href="/login">{t('landing.log_in')}</Link>
              </Button>
              <Button size="sm" className="rounded-lg" asChild>
                <Link href="/register">{t('landing.start_free_trial_btn')}</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden text-muted-foreground hover:text-foreground"
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 bg-background border-border">
            <div className="flex flex-col gap-6 pt-6">
              <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold select-none">
                  O
                </div>
                <span className="text-sm font-semibold tracking-tight text-foreground">
                  onslide.io
                </span>
              </Link>
              <nav className="flex flex-col gap-4">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
              <div className="flex flex-col gap-3 border-t border-border pt-4">
                {/* Language switcher (mobile) */}
                <button
                  onClick={toggleLang}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Globe className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase">{currentLang}</span>
                  <span className="text-xs text-muted-foreground">
                    — {currentLang === 'de' ? 'English' : 'Deutsch'}
                  </span>
                </button>

                {loggedIn ? (
                  <Button className="rounded-lg" asChild>
                    <Link href="/home" onClick={() => setOpen(false)}>
                      {t('landing.open_app')}
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      asChild
                      className="justify-start text-muted-foreground hover:text-foreground"
                    >
                      <Link href="/login" onClick={() => setOpen(false)}>
                        {t('landing.log_in')}
                      </Link>
                    </Button>
                    <Button className="rounded-lg" asChild>
                      <Link href="/register" onClick={() => setOpen(false)}>
                        {t('landing.start_free_trial_btn')}
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
