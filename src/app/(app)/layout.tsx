import { TenantProvider } from '@/providers/tenant-provider'
import { I18nLanguageSync } from '@/providers/i18n-provider'
import { AppSidebar } from '@/components/app-sidebar'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { SubscriptionBanner } from '@/components/subscription-banner'
import { LanguageToggle } from '@/components/language-toggle'
import { MobileNav } from '@/components/mobile-nav'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <TenantProvider>
      <I18nLanguageSync />
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
      </SidebarProvider>
    </TenantProvider>
  )
}
