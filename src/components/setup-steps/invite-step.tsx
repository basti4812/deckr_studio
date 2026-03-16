'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface InviteStepProps {
  onComplete: () => void
  onBack: () => void
}

export function InviteStep({ onComplete, onBack }: InviteStepProps) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [invites, setInvites] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  function addInvite() {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError(t('setup.invalid_email'))
      return
    }
    if (invites.includes(trimmed)) {
      setError(t('setup.email_already_invited'))
      return
    }
    setInvites([...invites, trimmed])
    setEmail('')
    setError(null)
  }

  function removeInvite(e: string) {
    setInvites(invites.filter((i) => i !== e))
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="invite-email">{t('setup.invite_team_label')}</Label>
        <div className="flex gap-2">
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && addInvite()}
            placeholder={t('setup.invite_email_placeholder')}
          />
          <Button type="button" variant="outline" onClick={addInvite}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {invites.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {invites.map((inv) => (
            <Badge key={inv} variant="secondary" className="gap-1 pr-1">
              {inv}
              <button
                type="button"
                onClick={() => removeInvite(inv)}
                className="ml-1 rounded-full hover:bg-muted"
                aria-label={`Remove ${inv}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {invites.length > 0 && (
        <p className="text-xs text-muted-foreground">{t('setup.invites_coming_soon')}</p>
      )}

      <div className="flex justify-between">
        <Button variant="outline" size="sm" onClick={onBack}>
          {t('setup.back')}
        </Button>
        <Button onClick={onComplete}>{t('setup.complete_setup')}</Button>
      </div>
    </div>
  )
}
