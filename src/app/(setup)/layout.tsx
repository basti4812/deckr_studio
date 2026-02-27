import { TenantProvider } from '@/providers/tenant-provider'

export default function SetupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <TenantProvider>
      <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-4">
        <div className="mb-8 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold select-none">
            D
          </div>
          <span className="text-lg font-semibold tracking-tight">
            deckr Studio
          </span>
        </div>
        {children}
      </div>
    </TenantProvider>
  )
}
