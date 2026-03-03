'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

// ---------------------------------------------------------------------------
// Cookie consent state
// ---------------------------------------------------------------------------

export const COOKIE_KEY = 'deckr_cookie_consent'

export interface CookiePreferences {
  version: string
  necessary: true
  functional: boolean
  analytics: boolean
  marketing: boolean
}

function defaultPreferences(allAccepted: boolean): CookiePreferences {
  return {
    version: '1',
    necessary: true,
    functional: allAccepted,
    analytics: allAccepted,
    marketing: allAccepted,
  }
}

function getStoredPreferences(): CookiePreferences | null {
  try {
    const raw = localStorage.getItem(COOKIE_KEY)
    if (!raw) return null
    // Support legacy "accepted"/"declined" strings from before upgrade
    if (raw === 'accepted') return defaultPreferences(true)
    if (raw === 'declined') return defaultPreferences(false)
    return JSON.parse(raw) as CookiePreferences
  } catch {
    return null
  }
}

function savePreferences(prefs: CookiePreferences) {
  localStorage.setItem(COOKIE_KEY, JSON.stringify(prefs))
}

// ---------------------------------------------------------------------------
// CookieConsent — banner with Accept All / Reject All / Configure
// ---------------------------------------------------------------------------

export function CookieConsent() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [functional, setFunctional] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [marketing, setMarketing] = useState(false)

  useEffect(() => {
    const prefs = getStoredPreferences()
    if (!prefs) {
      setVisible(true)
    }
  }, [])

  function acceptAll() {
    savePreferences(defaultPreferences(true))
    setVisible(false)
  }

  function rejectAll() {
    savePreferences(defaultPreferences(false))
    setVisible(false)
  }

  function openConfig() {
    // Load current preferences into toggles (default: all off)
    const prefs = getStoredPreferences()
    setFunctional(prefs?.functional ?? false)
    setAnalytics(prefs?.analytics ?? false)
    setMarketing(prefs?.marketing ?? false)
    setConfigOpen(true)
  }

  function saveConfig() {
    savePreferences({
      version: '1',
      necessary: true,
      functional,
      analytics,
      marketing,
    })
    setConfigOpen(false)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <>
      {/* Banner */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background p-4 shadow-lg">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {t('cookies.message')}{' '}
            <Link href="/cookies" className="underline hover:text-foreground">
              {t('cookies.policy')}
            </Link>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={rejectAll}>
              {t('cookies.reject_all')}
            </Button>
            <Button variant="outline" size="sm" onClick={openConfig}>
              {t('cookies.configure')}
            </Button>
            <Button size="sm" onClick={acceptAll}>
              {t('cookies.accept_all')}
            </Button>
          </div>
        </div>
      </div>

      {/* Configure dialog */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('cookies.settings_title')}</DialogTitle>
            <DialogDescription>
              {t('cookies.settings_description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Necessary — always on */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('cookies.necessary')}</p>
                <p className="text-xs text-muted-foreground">{t('cookies.necessary_desc')}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{t('cookies.always_on')}</Badge>
                <Switch checked disabled />
              </div>
            </div>

            <Separator />

            {/* Functional */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('cookies.functional')}</p>
                <p className="text-xs text-muted-foreground">{t('cookies.functional_desc')}</p>
              </div>
              <Switch checked={functional} onCheckedChange={setFunctional} />
            </div>

            <Separator />

            {/* Analytics */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('cookies.analytics')}</p>
                <p className="text-xs text-muted-foreground">{t('cookies.analytics_desc')}</p>
              </div>
              <Switch checked={analytics} onCheckedChange={setAnalytics} />
            </div>

            <Separator />

            {/* Marketing */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('cookies.marketing')}</p>
                <p className="text-xs text-muted-foreground">{t('cookies.marketing_desc')}</p>
              </div>
              <Switch checked={marketing} onCheckedChange={setMarketing} />
            </div>
          </div>

          <DialogFooter>
            <Button onClick={saveConfig} className="w-full sm:w-auto">
              {t('cookies.save_preferences')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
