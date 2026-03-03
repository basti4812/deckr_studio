'use client'

import Link from 'next/link'
import {
  BookOpen,
  Check,
  FileDown,
  LayoutDashboard,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LandingNav } from '@/components/landing-nav'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const painPointIcons = ['😩', '⏱️', '🤷']
const painPointKeys = [
  { title: 'landing.offbrand_title', desc: 'landing.offbrand_desc' },
  { title: 'landing.wasted_hours_title', desc: 'landing.wasted_hours_desc' },
  { title: 'landing.version_confusion_title', desc: 'landing.version_confusion_desc' },
]

const featureIcons = [BookOpen, LayoutDashboard, FileDown, ShieldCheck]
const featureKeys = [
  { title: 'landing.feature_library', desc: 'landing.feature_library_desc' },
  { title: 'landing.feature_board', desc: 'landing.feature_board_desc' },
  { title: 'landing.feature_export', desc: 'landing.feature_export_desc' },
  { title: 'landing.feature_ci', desc: 'landing.feature_ci_desc' },
]

const stepKeys = [
  { title: 'landing.step1_title', desc: 'landing.step1_desc' },
  { title: 'landing.step2_title', desc: 'landing.step2_desc' },
  { title: 'landing.step3_title', desc: 'landing.step3_desc' },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LandingPage() {
  const { t } = useTranslation()

  const pricingTiers = [
    {
      name: t('landing.starter'),
      price: '9',
      description: t('landing.starter_desc'),
      seats: t('landing.starter_seats'),
      features: [
        t('landing.unlimited_slides'),
        t('landing.unlimited_projects'),
        t('landing.pptx_pdf_export'),
        t('landing.external_share_links'),
        t('landing.email_support'),
      ],
      cta: t('landing.start_free_trial_btn'),
      href: '/register',
      highlighted: false,
    },
    {
      name: t('landing.team'),
      price: '7',
      description: t('landing.team_desc'),
      seats: t('landing.team_seats'),
      features: [
        t('landing.everything_in_starter'),
        t('landing.template_sets'),
        t('landing.version_history'),
        t('landing.slide_comments'),
        t('landing.priority_support'),
      ],
      cta: t('landing.start_free_trial_btn'),
      href: '/register',
      highlighted: true,
    },
    {
      name: t('landing.enterprise'),
      price: null,
      description: t('landing.enterprise_desc'),
      seats: t('landing.enterprise_seats'),
      features: [
        t('landing.everything_in_team'),
        t('landing.sso'),
        t('landing.custom_branding'),
        t('landing.dedicated_onboarding'),
        t('landing.sla_invoicing'),
      ],
      cta: t('landing.contact_us'),
      href: 'mailto:hello@deckr.studio',
      highlighted: false,
    },
  ]

  return (
    <div className="min-h-screen bg-white">
      <LandingNav />

      {/* ------------------------------------------------------------------ */}
      {/* Hero — dark                                                         */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative overflow-hidden bg-gray-950 pb-24 pt-20">
        {/* Background gradient */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -top-40 flex justify-center"
        >
          <div className="h-[600px] w-[800px] rounded-full bg-primary/20 blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 text-center">
          <Badge variant="secondary" className="mb-6 bg-white/10 text-gray-300 hover:bg-white/10">
            Presentation management for B2B teams
          </Badge>

          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            {t('landing.stop_copying_slides')}
            <br />
            <span className="text-primary">{t('landing.start_presenting')}</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg text-gray-400">
            {t('landing.main_headline')}
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/register">{t('landing.start_free_trial')}</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <Link href="/demo">{t('landing.try_the_demo')}</Link>
            </Button>
          </div>

          <p className="mt-4 text-xs text-gray-500">{t('landing.no_credit_card')}</p>

          {/* App preview placeholder */}
          <div className="mx-auto mt-16 max-w-4xl overflow-hidden rounded-xl border border-white/10 bg-gray-900 shadow-2xl">
            <div className="flex h-8 items-center gap-2 border-b border-white/10 px-4">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
              <div className="ml-4 h-4 w-48 rounded bg-white/5" />
            </div>
            <div className="grid grid-cols-4 gap-0">
              {/* Sidebar */}
              <div className="border-r border-white/10 p-4 space-y-2">
                {['Home', 'Board', 'Projects', 'Profile'].map((item) => (
                  <div key={item} className="flex items-center gap-2 rounded-md p-1.5">
                    <div className="h-3 w-3 rounded bg-white/10" />
                    <div className="h-2.5 w-16 rounded bg-white/10 text-xs text-gray-500">{item}</div>
                  </div>
                ))}
              </div>
              {/* Main canvas */}
              <div className="col-span-3 p-6">
                <div className="mb-4 h-3 w-32 rounded bg-white/10" />
                <div className="grid grid-cols-3 gap-3">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-video rounded-md border border-white/10 bg-gradient-to-br from-white/5 to-white/0"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Pain Points — muted                                                 */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              {t('landing.powerpoint_chaos_title')}
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              {t('landing.pain_points_subtitle')}
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {painPointKeys.map((point, i) => (
              <div key={point.title} className="text-center">
                <div className="mb-4 text-4xl">{painPointIcons[i]}</div>
                <h3 className="mb-2 font-semibold text-gray-900">{t(point.title)}</h3>
                <p className="text-sm text-gray-500">{t(point.desc)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Features — white                                                    */}
      {/* ------------------------------------------------------------------ */}
      <section id="features" className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              {t('landing.everything_team_needs')}
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              {t('landing.features_subtitle')}
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {featureKeys.map((feature, i) => {
              const Icon = featureIcons[i]
              return (
                <Card key={feature.title} className="border-gray-100">
                  <CardHeader className="pb-3">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-base">{t(feature.title)}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-sm leading-relaxed">
                      {t(feature.desc)}
                    </CardDescription>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* How It Works — muted                                                */}
      {/* ------------------------------------------------------------------ */}
      <section id="how-it-works" className="bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              {t('landing.three_steps')}
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              {t('landing.how_it_works_subtitle')}
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {stepKeys.map((step, index) => (
              <div key={step.title} className="relative flex flex-col items-center text-center">
                {index < stepKeys.length - 1 && (
                  <div
                    aria-hidden
                    className="absolute left-[calc(50%+2rem)] top-5 hidden h-px w-[calc(100%-4rem)] bg-gray-200 sm:block"
                  />
                )}
                <Badge className="mb-4 h-10 w-10 rounded-full p-0 flex items-center justify-center text-sm">
                  {index + 1}
                </Badge>
                <h3 className="mb-2 font-semibold text-gray-900">{t(step.title)}</h3>
                <p className="text-sm text-gray-500">{t(step.desc)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Pricing — white                                                     */}
      {/* ------------------------------------------------------------------ */}
      <section id="pricing" className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              {t('landing.pricing_title')}
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              {t('landing.pricing_subtitle')}
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            {pricingTiers.map((tier) => (
              <Card
                key={tier.name}
                className={
                  tier.highlighted
                    ? 'relative border-primary shadow-lg shadow-primary/10'
                    : 'border-gray-100'
                }
              >
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge>{t('landing.most_popular')}</Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-lg">{tier.name}</CardTitle>
                  <CardDescription>{tier.description}</CardDescription>
                  <div className="mt-2">
                    {tier.price ? (
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-gray-900">
                          &euro;{tier.price}
                        </span>
                        <span className="text-sm text-gray-500">{t('landing.per_user_month')}</span>
                      </div>
                    ) : (
                      <span className="text-2xl font-bold text-gray-900">
                        {t('landing.custom_pricing')}
                      </span>
                    )}
                    <p className="mt-1 text-xs text-gray-400">{tier.seats}</p>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                        <Check className="h-4 w-4 shrink-0 text-primary" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant={tier.highlighted ? 'default' : 'outline'}
                    asChild
                  >
                    <Link href={tier.href}>{tier.cta}</Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Final CTA — dark                                                    */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-gray-950 py-20">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <Zap className="mx-auto mb-4 h-10 w-10 text-primary" />
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {t('landing.ready_cta')}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lg text-gray-400">
            {t('landing.final_cta')}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/register">{t('landing.start_trial_cta')}</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <Link href="/demo">{t('landing.see_demo_first')}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Footer — dark                                                       */}
      {/* ------------------------------------------------------------------ */}
      <footer className="border-t border-white/10 bg-gray-950 py-10">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold select-none">
                D
              </div>
              <span className="text-sm font-semibold tracking-tight text-white">
                deckr Studio
              </span>
            </Link>

            <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500">
              <Link href="/login" className="hover:text-gray-300 transition-colors">
                {t('landing.log_in')}
              </Link>
              <Link href="/register" className="hover:text-gray-300 transition-colors">
                {t('landing.start_free_trial_btn')}
              </Link>
              <Separator orientation="vertical" className="h-3 bg-gray-700" />
              <Link href="/impressum" className="hover:text-gray-300 transition-colors">
                {t('landing.impressum')}
              </Link>
              <Link href="/privacy" className="hover:text-gray-300 transition-colors">
                {t('landing.privacy')}
              </Link>
              <Link href="/terms" className="hover:text-gray-300 transition-colors">
                {t('landing.terms')}
              </Link>
            </nav>
          </div>

          <p className="mt-6 text-center text-xs text-gray-600">
            {t('landing.footer_copyright', { year: new Date().getFullYear() })}
          </p>
        </div>
      </footer>
    </div>
  )
}
