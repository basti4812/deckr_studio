import { TenantProvider } from '@/providers/tenant-provider'
import { I18nLanguageSync } from '@/providers/i18n-provider'
import { QueryProvider } from '@/providers/query-provider'
import { AppLayoutInner } from '@/components/app-layout-inner'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantProvider>
      <QueryProvider>
        <I18nLanguageSync />
        <AppLayoutInner>{children}</AppLayoutInner>
      </QueryProvider>
    </TenantProvider>
  )
}
