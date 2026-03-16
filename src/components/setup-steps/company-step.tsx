'use client'

import { useState } from 'react'
import { Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface CompanyStepProps {
  initialName: string
  onNext: (name: string) => Promise<void>
  onSkip: () => void
}

export function CompanyStep({ initialName, onNext, onSkip }: CompanyStepProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(initialName)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleNext() {
    if (!name.trim()) {
      setError(t('setup.company_name_required'))
      return
    }
    setError(null)
    setLoading(true)
    try {
      await onNext(name.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="company-name">{t('setup.company_name_label')}</Label>
        <Input
          id="company-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('setup.company_name_placeholder')}
          autoFocus
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {/* Logo upload — placeholder */}
      <div className="space-y-2">
        <Label>{t('setup.company_logo')}</Label>
        <div className="flex h-24 cursor-not-allowed items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 text-center">
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <Upload className="h-5 w-5" />
            <p className="text-xs">{t('setup.logo_upload_coming')}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t('setup.logo_available_later')}</p>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" size="sm" onClick={onSkip}>
          {t('setup.skip_for_now')}
        </Button>
        <Button onClick={handleNext} disabled={loading}>
          {loading ? t('setup.saving') : t('setup.next')}
        </Button>
      </div>
    </div>
  )
}
