import { TenantProvider } from '@/providers/tenant-provider'
import { I18nLanguageSync } from '@/providers/i18n-provider'
import { AppLayoutInner } from '@/components/app-layout-inner'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantProvider>
      <I18nLanguageSync />
      <AppLayoutInner>{children}</AppLayoutInner>
    </TenantProvider>
  )
}
