'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const PRESET_COLORS = [
  { label: 'Blue', value: '#2B4EFF' },
  { label: 'Violet', value: '#7C3AED' },
  { label: 'Red', value: '#DC2626' },
  { label: 'Emerald', value: '#059669' },
  { label: 'Amber', value: '#D97706' },
  { label: 'Pink', value: '#DB2777' },
  { label: 'Cyan', value: '#0891B2' },
  { label: 'Indigo', value: '#4338CA' },
]

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/

interface BrandColorStepProps {
  initialColor: string
  onNext: (color: string) => Promise<void>
  onBack: () => void
  onSkip: () => void
}

export function BrandColorStep({ initialColor, onNext, onBack, onSkip }: BrandColorStepProps) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState(initialColor || '#2B4EFF')
  const [customHex, setCustomHex] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeColor = customHex && HEX_REGEX.test(customHex) ? customHex : selected

  async function handleNext() {
    if (!HEX_REGEX.test(activeColor)) {
      setError(t('setup.invalid_hex'))
      return
    }
    setError(null)
    setLoading(true)
    try {
      await onNext(activeColor)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label>{t('setup.choose_primary_color')}</Label>
        <div className="grid grid-cols-4 gap-3">
          {PRESET_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              onClick={() => {
                setSelected(color.value)
                setCustomHex('')
              }}
              className="relative flex h-12 items-center justify-center rounded-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ backgroundColor: color.value }}
              aria-label={color.label}
            >
              {selected === color.value && !customHex && (
                <Check className="h-5 w-5 text-white drop-shadow" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="custom-hex">{t('setup.custom_hex')}</Label>
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 shrink-0 rounded-md border"
            style={{ backgroundColor: activeColor }}
          />
          <Input
            id="custom-hex"
            value={customHex}
            onChange={(e) => setCustomHex(e.target.value)}
            placeholder="#2B4EFF"
            className="font-mono"
            maxLength={7}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="flex justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>
            {t('setup.back')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onSkip}>
            {t('setup.skip')}
          </Button>
        </div>
        <Button onClick={handleNext} disabled={loading}>
          {loading ? t('setup.saving') : t('setup.next')}
        </Button>
      </div>
    </div>
  )
}
