'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function BetaAccessPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/beta-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (res.ok) {
        router.push('/')
        router.refresh()
      } else {
        setError('Das Passwort ist leider nicht korrekt.')
      }
    } catch {
      setError('Ein Fehler ist aufgetreten. Bitte versuche es erneut.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold select-none">
          O
        </div>
        <span className="text-lg font-semibold tracking-tight text-foreground">onslide.io</span>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Willkommen!</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            Schön, dass du da bist und onslide testen möchtest. Bitte gib das Passwort ein, das du
            erhalten hast.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="password"
                placeholder="Passwort"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
              {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={loading || !password.trim()}>
              {loading ? 'Wird geprüft...' : 'Zugang erhalten'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-muted-foreground text-center max-w-xs">
        onslide befindet sich aktuell in einer geschlossenen Beta-Phase. Du benötigst ein Passwort,
        um die App zu testen.
      </p>
    </div>
  )
}
