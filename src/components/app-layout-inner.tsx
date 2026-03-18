'use client'

import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AppSidebar } from '@/components/app-sidebar'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { SubscriptionBanner } from '@/components/subscription-banner'
import { LanguageToggle } from '@/components/language-toggle'
import { ThemeToggle } from '@/components/theme-toggle'
import { MobileNav } from '@/components/mobile-nav'
import { BoardFullscreenProvider, useBoardFullscreen } from '@/providers/fullscreen-provider'
import { CommandPalette } from '@/components/command-palette'
import { useSessionTracker } from '@/hooks/use-session-tracker'

function InnerLayout({ children }: { children: React.ReactNode }) {
  const { isFullscreen } = useBoardFullscreen()
  const { t } = useTranslation()
  useSessionTracker()

  if (isFullscreen) {
    return (
      <div className="flex h-screen flex-col">
        <main className="flex flex-1 flex-col overflow-hidden p-2">{children}</main>
      </div>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1 hidden md:flex" />
          <Separator orientation="vertical" className="mr-2 h-4 hidden md:flex" />
          <button
            onClick={() => document.dispatchEvent(new Event('open-command-palette'))}
            className="hidden md:flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Search className="h-3.5 w-3.5" />
            <span>{t('search.placeholder')}</span>
            <kbd className="ml-2 pointer-events-none hidden select-none rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-block">
              ⌘K
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <LanguageToggle />
          </div>
        </header>
        <SubscriptionBanner />
        <main className="flex flex-1 flex-col gap-4 p-6 pb-20 md:pb-6">{children}</main>
      </SidebarInset>
      <MobileNav />
      <CommandPalette />
    </SidebarProvider>
  )
}

export function AppLayoutInner({ children }: { children: React.ReactNode }) {
  return (
    <BoardFullscreenProvider>
      <InnerLayout>{children}</InnerLayout>
    </BoardFullscreenProvider>
  )
}
