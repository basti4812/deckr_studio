export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-4">
      {/* Branding */}
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold select-none">
          D
        </div>
        <span className="text-lg font-semibold tracking-tight">
          deckr Studio
        </span>
      </div>

      {/* Page content (card) */}
      {children}

      {/* Footer */}
      <p className="mt-8 text-xs text-muted-foreground">
        © {new Date().getFullYear()} deckr Studio. All rights reserved.
      </p>
    </div>
  )
}
