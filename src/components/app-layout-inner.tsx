'use client'

import { AppSidebar } from '@/components/app-sidebar'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { SubscriptionBanner } from '@/components/subscription-banner'
import { LanguageToggle } from '@/components/language-toggle'
import { MobileNav } from '@/components/mobile-nav'
import { BoardFullscreenProvider, useBoardFullscreen } from '@/providers/fullscreen-provider'
import { CommandPalette } from '@/components/command-palette'
import { useSessionTracker } from '@/hooks/use-session-tracker'

function InnerLayout({ children }: { children: React.ReactNode }) {
  const { isFullscreen } = useBoardFullscreen()
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
          <div className="ml-auto">
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
