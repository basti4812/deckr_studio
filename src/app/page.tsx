'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowRight, Check, Layers, GripVertical, Shield, Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LandingNav } from '@/components/landing-nav'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

// ---------------------------------------------------------------------------
// Intersection Observer hook for scroll animations
// ---------------------------------------------------------------------------

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-fade-in-up')
            entry.target.classList.remove('opacity-0')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )

    const children = el.querySelectorAll('[data-reveal]')
    children.forEach((child) => observer.observe(child))

    return () => observer.disconnect()
  }, [])

  return ref
}

// ---------------------------------------------------------------------------
// Placeholder logos
// ---------------------------------------------------------------------------

function LogoStrip() {
  const names = ['Acme', 'Globex', 'Initech', 'Umbrella', 'Stark']
  return (
    <div className="flex items-center justify-center gap-8 opacity-40">
      {names.map((name) => (
        <span
          key={name}
          className="text-sm font-semibold tracking-wider uppercase text-muted-foreground"
        >
          {name}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LandingPage() {
  const revealRef = useScrollReveal()
  const { t } = useTranslation()

  // Pain points data driven by translations
  const painPoints = [
    {
      title: t('landing.offbrand_title'),
      desc: t('landing.offbrand_desc'),
    },
    {
      title: t('landing.wasted_hours_title'),
      desc: t('landing.wasted_hours_desc'),
    },
    {
      title: t('landing.version_confusion_title'),
      desc: t('landing.version_confusion_desc'),
    },
  ]

  // Features data driven by translations
  const features = [
    {
      icon: Layers,
      title: t('landing.feature_library'),
      desc: t('landing.feature_library_desc'),
    },
    {
      icon: GripVertical,
      title: t('landing.feature_board'),
      desc: t('landing.feature_board_desc'),
    },
    {
      icon: ArrowDown,
      title: t('landing.feature_export'),
      desc: t('landing.feature_export_desc'),
    },
    {
      icon: Shield,
      title: t('landing.feature_ci'),
      desc: t('landing.feature_ci_desc'),
    },
  ]

  // Steps data driven by translations
  const steps = [
    { title: t('landing.step1_title'), desc: t('landing.step1_desc') },
    { title: t('landing.step2_title'), desc: t('landing.step2_desc') },
    { title: t('landing.step3_title'), desc: t('landing.step3_desc') },
  ]

  // Testimonials driven by translations
  const testimonials = [
    {
      quote: t('landing.testimonial1_quote'),
      name: t('landing.testimonial1_name'),
      role: t('landing.testimonial1_role'),
      company: t('landing.testimonial1_company'),
    },
    {
      quote: t('landing.testimonial2_quote'),
      name: t('landing.testimonial2_name'),
      role: t('landing.testimonial2_role'),
      company: t('landing.testimonial2_company'),
    },
    {
      quote: t('landing.testimonial3_quote'),
      name: t('landing.testimonial3_name'),
      role: t('landing.testimonial3_role'),
      company: t('landing.testimonial3_company'),
    },
  ]

  // Pricing tiers driven by translations
  const pricingTiers = [
    {
      name: t('landing.starter'),
      price: '0',
      period: t('landing.per_user_month'),
      description: t('landing.starter_desc'),
      seats: t('landing.starter_seats'),
      features: [
        t('landing.unlimited_slides'),
        t('landing.unlimited_projects'),
        t('landing.pptx_pdf_export'),
        t('landing.email_support'),
      ],
      cta: t('landing.start_free_trial_btn'),
      href: '/register',
      highlighted: false,
    },
    {
      name: t('landing.team'),
      price: '49',
      period: t('landing.per_user_month'),
      description: t('landing.team_desc'),
      seats: t('landing.team_seats'),
      features: [
        t('landing.everything_in_starter'),
        t('landing.external_share_links'),
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
      period: null,
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
      href: 'mailto:hello@onslide.io',
      highlighted: false,
    },
  ]

  return (
    <div ref={revealRef} className="min-h-screen bg-background">
      <LandingNav />

      {/* ================================================================== */}
      {/* SECTION 1 · HERO                                                    */}
      {/* ================================================================== */}
      <section
        className="relative overflow-hidden pt-20 pb-24"
        style={{
          background: 'linear-gradient(180deg, hsl(40 23.1% 97.5%) 0%, hsl(30 34.8% 91%) 100%)',
        }}
      >
        <div className="relative mx-auto max-w-6xl px-6 text-center">
          <h1 className="font-heading text-5xl tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            {t('landing.stop_copying_slides')}
            <br />
            <span className="text-primary">{t('landing.start_presenting')}</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
            {t('landing.main_headline')}
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" className="rounded-lg px-8 text-base" asChild>
              <Link href="/register">
                {t('landing.start_free_trial')} <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              asChild
            >
              <Link href="/demo">
                {t('landing.try_the_demo')} <ArrowDown className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          {/* Social proof */}
          <div className="mt-8 flex flex-col items-center gap-2">
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-primary text-primary" />
              ))}
              <span className="ml-2 text-sm text-muted-foreground">
                {t('landing.social_proof')}
              </span>
            </div>
          </div>

          {/* Hero mockup */}
          <div className="mx-auto mt-16 max-w-4xl animate-float">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-warm-lg">
              {/* Window chrome */}
              <div className="flex h-10 items-center gap-2 border-b border-border px-4">
                <div className="h-3 w-3 rounded-full bg-destructive/40" />
                <div className="h-3 w-3 rounded-full bg-[hsl(var(--warning))]/40" />
                <div className="h-3 w-3 rounded-full bg-[hsl(var(--success))]/40" />
                <div className="ml-4 h-4 w-48 rounded-md bg-muted" />
              </div>
              {/* App preview */}
              <div className="grid grid-cols-4 gap-0">
                {/* Sidebar */}
                <div className="border-r border-border bg-secondary/50 p-4 space-y-3">
                  {['Home', 'Board', 'Projects', 'Profile'].map((item) => (
                    <div key={item} className="flex items-center gap-2 rounded-lg p-2">
                      <div className="h-3.5 w-3.5 rounded bg-muted-foreground/15" />
                      <span className="text-xs text-muted-foreground">{item}</span>
                    </div>
                  ))}
                </div>
                {/* Main canvas */}
                <div className="col-span-3 p-6">
                  <div className="mb-5 h-3 w-36 rounded-md bg-muted" />
                  <div className="grid grid-cols-3 gap-3">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div
                        key={i}
                        className="aspect-video rounded-lg border border-border bg-gradient-to-br from-secondary/80 to-secondary/30"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Logo strip */}
          <div className="mt-12">
            <LogoStrip />
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* SECTION 2 · PROBLEM / PAIN POINTS                                   */}
      {/* ================================================================== */}
      <section className="bg-card py-24">
        <div className="mx-auto max-w-5xl px-6">
          <h2
            data-reveal
            className="opacity-0 font-heading text-3xl text-center tracking-tight text-foreground sm:text-4xl lg:text-5xl"
          >
            {t('landing.powerpoint_chaos_title')}
          </h2>
          <p
            data-reveal
            className="opacity-0 mx-auto mt-4 max-w-2xl text-center text-lg text-muted-foreground"
          >
            {t('landing.pain_points_subtitle')}
          </p>

          <div className="mt-16 grid gap-6 sm:grid-cols-3">
            {painPoints.map((point, i) => (
              <div
                key={i}
                data-reveal
                className="opacity-0 rounded-2xl border border-border bg-background p-8 transition-shadow duration-200 hover:shadow-warm-md"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <h3 className="mb-2 text-lg font-semibold text-foreground">{point.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{point.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* SECTION 3 · FEATURES                                                */}
      {/* ================================================================== */}
      <section className="bg-background py-24">
        <div className="mx-auto max-w-5xl px-6">
          <h2
            data-reveal
            className="opacity-0 font-heading text-3xl text-center tracking-tight text-foreground sm:text-4xl lg:text-5xl"
          >
            {t('landing.everything_team_needs')}
          </h2>
          <p
            data-reveal
            className="opacity-0 mx-auto mt-4 max-w-2xl text-center text-lg text-muted-foreground"
          >
            {t('landing.features_subtitle')}
          </p>

          <div className="mt-16 grid gap-6 sm:grid-cols-2">
            {features.map((feature, i) => {
              const Icon = feature.icon
              return (
                <div
                  key={i}
                  data-reveal
                  className="opacity-0 rounded-2xl border border-border bg-card p-8 transition-shadow duration-200 hover:shadow-warm-md"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-foreground">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* SECTION 4 · HOW IT WORKS                                            */}
      {/* ================================================================== */}
      <section id="how-it-works" className="bg-card py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2
            data-reveal
            className="opacity-0 font-heading text-3xl text-center tracking-tight text-foreground sm:text-4xl lg:text-5xl"
          >
            {t('landing.three_steps')}
          </h2>
          <p
            data-reveal
            className="opacity-0 mx-auto mt-4 max-w-2xl text-center text-lg text-muted-foreground"
          >
            {t('landing.how_it_works_subtitle')}
          </p>

          <div className="mt-16 grid gap-12 sm:grid-cols-3">
            {steps.map((step, index) => (
              <div
                key={index}
                data-reveal
                className="opacity-0 relative flex flex-col items-center text-center"
                style={{ animationDelay: `${index * 150}ms` }}
              >
                {/* Step number */}
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {index + 1}
                  </div>
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* SECTION 5 · TESTIMONIALS                                            */}
      {/* ================================================================== */}
      <section className="bg-background py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2
            data-reveal
            className="opacity-0 font-heading text-3xl text-center tracking-tight text-foreground sm:text-4xl lg:text-5xl"
          >
            {t('landing.testimonials_title')}
          </h2>

          <div className="mt-16 grid gap-6 sm:grid-cols-3">
            {testimonials.map((item, i) => (
              <div
                key={i}
                data-reveal
                className="opacity-0 rounded-2xl border border-border bg-card p-8 transition-shadow duration-200 hover:shadow-warm-md"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                {/* Stars */}
                <div className="mb-4 flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-primary text-primary" />
                  ))}
                </div>
                <p className="mb-6 text-sm text-foreground leading-relaxed italic">
                  &ldquo;{item.quote}&rdquo;
                </p>
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.role}, {item.company}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* SECTION 6 · PRICING                                                 */}
      {/* ================================================================== */}
      <section id="pricing" className="bg-card py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <h2
              data-reveal
              className="opacity-0 font-heading text-3xl tracking-tight text-foreground sm:text-4xl lg:text-5xl"
            >
              {t('landing.pricing_title')}
            </h2>
            <p data-reveal className="opacity-0 mt-4 text-lg text-muted-foreground">
              {t('landing.pricing_subtitle')}
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-3">
            {pricingTiers.map((tier) => (
              <div
                key={tier.name}
                data-reveal
                className={`opacity-0 relative rounded-2xl border p-8 transition-shadow duration-200 hover:shadow-warm-md ${
                  tier.highlighted
                    ? 'border-primary bg-background shadow-warm-md'
                    : 'border-border bg-background'
                }`}
              >
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
                      {t('landing.most_popular')}
                    </span>
                  </div>
                )}
                <h3 className="text-lg font-semibold text-foreground">{tier.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{tier.description}</p>
                <div className="mt-4">
                  {tier.price ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-foreground">&euro;{tier.price}</span>
                      <span className="text-sm text-muted-foreground">{tier.period}</span>
                    </div>
                  ) : (
                    <span className="text-3xl font-bold text-foreground">
                      {t('landing.custom_pricing')}
                    </span>
                  )}
                </div>

                <Separator className="my-6" />

                <ul className="space-y-3">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-foreground">
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  <Button
                    className="w-full rounded-lg"
                    variant={tier.highlighted ? 'default' : 'secondary'}
                    asChild
                  >
                    <Link href={tier.href}>{tier.cta}</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <p data-reveal className="opacity-0 mt-8 text-center text-sm text-muted-foreground">
            {t('landing.all_plans_trial')}
          </p>
        </div>
      </section>

      {/* ================================================================== */}
      {/* SECTION 7 · FINAL CTA                                               */}
      {/* ================================================================== */}
      <section className="bg-primary py-24">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="font-heading text-3xl tracking-tight text-primary-foreground sm:text-4xl lg:text-5xl">
            {t('landing.ready_cta')}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lg text-primary-foreground/80">
            {t('landing.final_cta')}
          </p>
          <div className="mt-10">
            <Button
              size="lg"
              className="rounded-lg bg-white text-foreground px-8 text-base hover:bg-white/90"
              asChild
            >
              <Link href="/register">
                {t('landing.start_trial_cta')} <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-primary-foreground/60">
            {t('landing.free_plan_available')}
          </p>
        </div>
      </section>

      {/* ================================================================== */}
      {/* SECTION 8 · FOOTER                                                  */}
      {/* ================================================================== */}
      <footer className="bg-secondary py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-8 sm:flex-row sm:items-start">
            {/* Logo + tagline */}
            <div>
              <Link href="/" className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold select-none">
                  O
                </div>
                <span className="text-sm font-semibold tracking-tight text-foreground">
                  onslide.io
                </span>
              </Link>
              <p className="mt-2 text-xs text-muted-foreground max-w-[200px]">
                {t('landing.footer_tagline')}
              </p>
            </div>

            {/* Nav links */}
            <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <a href="#how-it-works" className="hover:text-foreground transition-colors">
                {t('landing.how_it_works_nav')}
              </a>
              <a href="#pricing" className="hover:text-foreground transition-colors">
                {t('landing.pricing_nav')}
              </a>
              <Link href="/login" className="hover:text-foreground transition-colors">
                {t('landing.log_in')}
              </Link>
              <Link href="/register" className="hover:text-foreground transition-colors">
                {t('landing.start_free_trial_btn')}
              </Link>
            </nav>

            {/* Legal links */}
            <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                {t('landing.privacy')}
              </Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                {t('landing.terms')}
              </Link>
              <Link href="/impressum" className="hover:text-foreground transition-colors">
                {t('landing.impressum')}
              </Link>
              <Link href="/dpa" className="hover:text-foreground transition-colors">
                {t('landing.dpa')}
              </Link>
              <Link href="/cookies" className="hover:text-foreground transition-colors">
                {t('landing.cookies_link')}
              </Link>
              <Link href="/cancellation" className="hover:text-foreground transition-colors">
                {t('landing.cancellation')}
              </Link>
              <button
                className="hover:text-foreground transition-colors"
                onClick={() => {
                  localStorage.removeItem('onslide_cookie_consent')
                  window.location.reload()
                }}
              >
                {t('landing.cookie_settings')}
              </button>
            </nav>
          </div>

          <Separator className="my-8" />

          <p className="text-center text-xs text-muted-foreground">
            {t('landing.footer_copyright', { year: new Date().getFullYear() })}
          </p>
        </div>
      </footer>
    </div>
  )
}
