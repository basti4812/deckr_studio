'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Menu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet'

export function LandingNav() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      setLoggedIn(!!session)
    })
  }, [])

  const navLinks = [
    { label: t('landing.features_nav'), href: '#features' },
    { label: t('landing.how_it_works_nav'), href: '#how-it-works' },
    { label: t('landing.pricing_nav'), href: '#pricing' },
  ]

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-gray-950/95 backdrop-blur supports-[backdrop-filter]:bg-gray-950/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold select-none">
            D
          </div>
          <span className="text-sm font-semibold tracking-tight text-white">
            deckr Studio
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-gray-400 transition-colors hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Desktop actions */}
        <div className="hidden items-center gap-3 md:flex">
          {loggedIn ? (
            <Button size="sm" asChild>
              <Link href="/home">{t('landing.open_app')}</Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild className="text-gray-300 hover:text-white hover:bg-white/10">
                <Link href="/login">{t('landing.log_in')}</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/register">{t('landing.start_free_trial_btn')}</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden text-gray-300 hover:text-white hover:bg-white/10">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 bg-gray-950 border-white/10">
            <div className="flex flex-col gap-6 pt-6">
              <Link
                href="/"
                className="flex items-center gap-2"
                onClick={() => setOpen(false)}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold select-none">
                  D
                </div>
                <span className="text-sm font-semibold tracking-tight text-white">
                  deckr Studio
                </span>
              </Link>
              <nav className="flex flex-col gap-4">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="text-sm text-gray-400 transition-colors hover:text-white"
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
              <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
                {loggedIn ? (
                  <Button asChild>
                    <Link href="/home" onClick={() => setOpen(false)}>{t('landing.open_app')}</Link>
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" asChild className="justify-start text-gray-300 hover:text-white hover:bg-white/10">
                      <Link href="/login" onClick={() => setOpen(false)}>{t('landing.log_in')}</Link>
                    </Button>
                    <Button asChild>
                      <Link href="/register" onClick={() => setOpen(false)}>{t('landing.start_free_trial_btn')}</Link>
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
