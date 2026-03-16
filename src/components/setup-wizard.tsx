'use client'

import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '@/hooks/use-current-user'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CompanyStep } from '@/components/setup-steps/company-step'
import { BrandColorStep } from '@/components/setup-steps/brand-color-step'
import { SlidesStep } from '@/components/setup-steps/slides-step'
import { InviteStep } from '@/components/setup-steps/invite-step'

// ---------------------------------------------------------------------------
// Step metadata keys
// ---------------------------------------------------------------------------

const STEP_KEYS = [
  { title: 'setup.setup_company', description: 'setup.setup_company_desc' },
  { title: 'setup.choose_brand_color', description: 'setup.choose_brand_color_desc' },
  { title: 'setup.upload_first_slides', description: 'setup.upload_first_slides_desc' },
  { title: 'setup.invite_team', description: 'setup.invite_team_desc' },
]

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

async function patchTenant(token: string, body: Record<string, unknown>) {
  const res = await fetch('/api/tenant', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'Failed to save')
  }
}

async function getToken(): Promise<string> {
  const supabase = createBrowserSupabaseClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  return session.access_token
}

// ---------------------------------------------------------------------------
// Progress indicator
// ---------------------------------------------------------------------------

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
              i < current
                ? 'bg-primary text-primary-foreground'
                : i === current
                  ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {i + 1}
          </div>
          {i < total - 1 && (
            <div
              className={`h-px w-8 transition-colors ${i < current ? 'bg-primary' : 'bg-muted'}`}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

export function SetupWizard() {
  const { t } = useTranslation()
  const router = useRouter()
  const { tenantName, primaryColor, setupStep } = useCurrentUser()
  const [step, setStep] = useState(setupStep)

  async function goToStep(next: number) {
    setStep(next)
    try {
      const token = await getToken()
      await patchTenant(token, { setup_step: next })
    } catch {
      // Best-effort — UI still advances even if persist fails
    }
  }

  async function complete() {
    try {
      const token = await getToken()
      await patchTenant(token, { setup_complete: true })
    } catch {
      // Best-effort — redirect even if PATCH fails
    }
    router.push('/home')
  }

  const currentStepKeys = STEP_KEYS[step]

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="pb-4">
        <StepIndicator current={step} total={STEP_KEYS.length} />
        <div className="mt-4">
          <CardTitle>{t(currentStepKeys.title)}</CardTitle>
          <CardDescription className="mt-1">{t(currentStepKeys.description)}</CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        {step === 0 && (
          <CompanyStep
            initialName={tenantName ?? ''}
            onNext={async (name) => {
              const token = await getToken()
              await patchTenant(token, { name })
              goToStep(1)
            }}
            onSkip={() => goToStep(1)}
          />
        )}

        {step === 1 && (
          <BrandColorStep
            initialColor={primaryColor ?? '#2B4EFF'}
            onNext={async (color) => {
              const token = await getToken()
              await patchTenant(token, { primary_color: color })
              goToStep(2)
            }}
            onBack={() => goToStep(0)}
            onSkip={() => goToStep(2)}
          />
        )}

        {step === 2 && (
          <SlidesStep
            onNext={() => goToStep(3)}
            onBack={() => goToStep(1)}
            onSkip={() => goToStep(3)}
          />
        )}

        {step === 3 && <InviteStep onComplete={complete} onBack={() => goToStep(2)} />}
      </CardContent>
    </Card>
  )
}
