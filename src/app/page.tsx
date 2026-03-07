'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  ArrowDown,
  ArrowRight,
  Check,
  Clock,
  FolderOpen,
  GripVertical,
  Layers,
  Shield,
  Star,
  Users,
} from 'lucide-react'
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
// Data
// ---------------------------------------------------------------------------

const painPoints = [
  {
    before: 'Digging through old decks for that one slide',
    after: 'Find any slide in 10 seconds',
  },
  {
    before: 'Someone sent an off-brand presentation \u2014 again',
    after: 'Every deck, locked to your brand',
  },
  {
    before: 'Three hours to prep a 20-slide deck',
    after: 'Presentation-ready in minutes',
  },
  {
    before: 'No one knows which version is current',
    after: 'One library. Always up to date.',
  },
]

const steps = [
  {
    icon: Layers,
    title: 'Browse your slide library',
    body: 'All your approved, on-brand slides in one place. Searchable, filterable, always up to date.',
  },
  {
    icon: GripVertical,
    title: 'Drag & drop to build',
    body: 'Assemble your presentation like puzzle pieces. Pick the slides you need, arrange them, done.',
  },
  {
    icon: ArrowDown,
    title: 'Export as PowerPoint',
    body: 'Download a pixel-perfect .pptx file, ready to present. Fonts, colors, logos \u2014 everything exactly right.',
  },
]

const benefits = [
  {
    icon: Shield,
    title: 'Always on brand',
    body: 'Your slides, your colors, your fonts. Locked in \u2014 no matter who builds the deck.',
  },
  {
    icon: Users,
    title: 'Anyone can do it',
    body: 'Sales, HR, management \u2014 anyone on your team can build a great deck without design skills.',
  },
  {
    icon: FolderOpen,
    title: 'One source of truth',
    body: "No more 'which version is current?' Everyone pulls from the same approved library.",
  },
  {
    icon: Clock,
    title: 'Done in minutes',
    body: 'Stop rebuilding presentations from scratch. Your best slides are already waiting for you.',
  },
]

const testimonials = [
  {
    quote:
      'We cut our deck-prep time by 70%. Our sales team used to spend hours on this \u2014 now it\u2019s 15 minutes.',
    name: 'Sarah K.',
    role: 'Head of Marketing',
    company: 'TechCorp GmbH',
  },
  {
    quote:
      'Finally, no more rogue PowerPoints. Every presentation looks like it came from our design team.',
    name: 'Marcus T.',
    role: 'Brand Manager',
    company: 'Vivo Group',
  },
  {
    quote:
      'Our onboarding decks used to take a full day. Now our HR team does it in under 20 minutes.',
    name: 'Julia M.',
    role: 'People & Culture Lead',
    company: 'Nordhaus AG',
  },
]

const pricingTiers = [
  {
    name: 'Starter',
    price: '0',
    period: '/ month',
    description: 'Small teams getting started',
    features: [
      'Up to 3 users',
      '1 slide library',
      '50 slides',
      'PowerPoint export',
    ],
    cta: 'Get started free',
    href: '/register',
    highlighted: false,
  },
  {
    name: 'Team',
    price: '49',
    period: '/ month',
    description: 'Growing marketing & sales teams',
    features: [
      'Up to 15 users',
      'Unlimited libraries',
      'Unlimited slides',
      'Analytics',
      'Priority support',
    ],
    cta: 'Start free trial',
    href: '/register',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: null,
    period: null,
    description: 'Large organizations & agencies',
    features: [
      'Unlimited users',
      'SSO & permissions',
      'Custom branding',
      'Dedicated onboarding',
      'SLA',
    ],
    cta: 'Talk to us',
    href: 'mailto:hello@deckr.studio',
    highlighted: false,
  },
]

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

  return (
    <div ref={revealRef} className="min-h-screen bg-background">
      <LandingNav />

      {/* ================================================================== */}
      {/* SECTION 1 · HERO                                                    */}
      {/* ================================================================== */}
      <section
        className="relative overflow-hidden pt-20 pb-24"
        style={{
          background:
            'linear-gradient(180deg, hsl(40 23.1% 97.5%) 0%, hsl(30 34.8% 91%) 100%)',
        }}
      >
        <div className="relative mx-auto max-w-6xl px-6 text-center">
          <h1 className="font-heading text-5xl tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            Your whole team.
            <br />
            <span className="text-primary">Always on brand.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
            Build perfect presentations from your approved slide library &mdash;
            in minutes, not hours. No designer needed.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" className="rounded-lg px-8 text-base" asChild>
              <Link href="/register">
                Start for free <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={() =>
                document
                  .getElementById('how-it-works')
                  ?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              See how it works <ArrowDown className="ml-2 h-4 w-4" />
            </Button>
          </div>

          {/* Social proof */}
          <div className="mt-8 flex flex-col items-center gap-2">
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className="h-4 w-4 fill-primary text-primary"
                />
              ))}
              <span className="ml-2 text-sm text-muted-foreground">
                Trusted by 500+ marketing and sales teams
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
                    <div
                      key={item}
                      className="flex items-center gap-2 rounded-lg p-2"
                    >
                      <div className="h-3.5 w-3.5 rounded bg-muted-foreground/15" />
                      <span className="text-xs text-muted-foreground">
                        {item}
                      </span>
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
      {/* SECTION 2 · PROBLEM → SOLUTION                                      */}
      {/* ================================================================== */}
      <section className="bg-card py-24">
        <div className="mx-auto max-w-5xl px-6">
          <h2
            data-reveal
            className="opacity-0 font-heading text-3xl text-center tracking-tight text-foreground sm:text-4xl lg:text-5xl"
          >
            Sound familiar?
          </h2>

          <div className="mt-16 space-y-6">
            {painPoints.map((point, i) => (
              <div
                key={i}
                data-reveal
                className="opacity-0 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 md:gap-8 items-center"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                {/* Before */}
                <div className="text-right md:text-right">
                  <p className="text-muted-foreground line-through decoration-destructive/40 text-base md:text-lg">
                    {point.before}
                  </p>
                </div>

                {/* Arrow */}
                <div className="hidden md:flex items-center justify-center">
                  <ArrowRight className="h-5 w-5 text-primary" />
                </div>

                {/* After */}
                <div>
                  <p className="text-foreground font-semibold text-base md:text-lg">
                    {point.after}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* SECTION 3 · HOW IT WORKS                                            */}
      {/* ================================================================== */}
      <section id="how-it-works" className="bg-background py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2
            data-reveal
            className="opacity-0 font-heading text-3xl text-center tracking-tight text-foreground sm:text-4xl lg:text-5xl"
          >
            Three steps to a perfect deck
          </h2>

          <div className="mt-16 grid gap-12 sm:grid-cols-3">
            {steps.map((step, index) => {
              const Icon = step.icon
              return (
                <div
                  key={step.title}
                  data-reveal
                  className="opacity-0 relative flex flex-col items-center text-center"
                  style={{ animationDelay: `${index * 150}ms` }}
                >
                  {/* Icon */}
                  <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  {/* Step number */}
                  <div className="mb-3 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {index + 1}
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                    {step.body}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* SECTION 4 · BENEFITS                                                */}
      {/* ================================================================== */}
      <section className="bg-card py-24">
        <div className="mx-auto max-w-5xl px-6">
          <h2
            data-reveal
            className="opacity-0 font-heading text-3xl text-center tracking-tight text-foreground sm:text-4xl lg:text-5xl"
          >
            Built for teams who care about their brand
          </h2>

          <div className="mt-16 grid gap-6 sm:grid-cols-2">
            {benefits.map((benefit, i) => {
              const Icon = benefit.icon
              return (
                <div
                  key={benefit.title}
                  data-reveal
                  className="opacity-0 rounded-2xl border border-border bg-background p-8 transition-shadow duration-200 hover:shadow-warm-md"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-foreground">
                    {benefit.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {benefit.body}
                  </p>
                </div>
              )
            })}
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
            Teams that never go off-brand again
          </h2>

          <div className="mt-16 grid gap-6 sm:grid-cols-3">
            {testimonials.map((t, i) => (
              <div
                key={t.name}
                data-reveal
                className="opacity-0 rounded-2xl border border-border bg-card p-8 transition-shadow duration-200 hover:shadow-warm-md"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                {/* Stars */}
                <div className="mb-4 flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star
                      key={j}
                      className="h-4 w-4 fill-primary text-primary"
                    />
                  ))}
                </div>
                <p className="mb-6 text-sm text-foreground leading-relaxed italic">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {t.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.role}, {t.company}
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
              Simple pricing. No surprises.
            </h2>
            <p
              data-reveal
              className="opacity-0 mt-4 text-lg text-muted-foreground"
            >
              Start free. Upgrade when your team grows.
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
                      Most Popular
                    </span>
                  </div>
                )}
                <h3 className="text-lg font-semibold text-foreground">
                  {tier.name}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {tier.description}
                </p>
                <div className="mt-4">
                  {tier.price ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-foreground">
                        &euro;{tier.price}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {tier.period}
                      </span>
                    </div>
                  ) : (
                    <span className="text-3xl font-bold text-foreground">
                      Custom
                    </span>
                  )}
                </div>

                <Separator className="my-6" />

                <ul className="space-y-3">
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2.5 text-sm text-foreground"
                    >
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

          <p
            data-reveal
            className="opacity-0 mt-8 text-center text-sm text-muted-foreground"
          >
            All plans include a 14-day free trial. No credit card required.
          </p>
        </div>
      </section>

      {/* ================================================================== */}
      {/* SECTION 7 · FINAL CTA                                               */}
      {/* ================================================================== */}
      <section className="bg-primary py-24">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="font-heading text-3xl tracking-tight text-primary-foreground sm:text-4xl lg:text-5xl">
            Your next presentation is one click away.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lg text-primary-foreground/80">
            Join 500+ teams who stopped wasting time on slides.
          </p>
          <div className="mt-10">
            <Button
              size="lg"
              className="rounded-lg bg-white text-foreground px-8 text-base hover:bg-white/90"
              asChild
            >
              <Link href="/register">
                Start for free &mdash; no credit card needed{' '}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-primary-foreground/60">
            Free plan available &middot; Setup in under 5 minutes &middot;
            Cancel anytime
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
                  D
                </div>
                <span className="text-sm font-semibold tracking-tight text-foreground">
                  deckr
                </span>
              </Link>
              <p className="mt-2 text-xs text-muted-foreground max-w-[200px]">
                Brand-consistent presentations. Every time.
              </p>
            </div>

            {/* Nav links */}
            <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <a
                href="#how-it-works"
                className="hover:text-foreground transition-colors"
              >
                Product
              </a>
              <a
                href="#pricing"
                className="hover:text-foreground transition-colors"
              >
                Pricing
              </a>
              <Link
                href="/login"
                className="hover:text-foreground transition-colors"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="hover:text-foreground transition-colors"
              >
                Start free trial
              </Link>
            </nav>

            {/* Legal links */}
            <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <Link
                href="/privacy"
                className="hover:text-foreground transition-colors"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="hover:text-foreground transition-colors"
              >
                Terms
              </Link>
              <Link
                href="/impressum"
                className="hover:text-foreground transition-colors"
              >
                Imprint
              </Link>
              <Link
                href="/dpa"
                className="hover:text-foreground transition-colors"
              >
                DPA
              </Link>
              <Link
                href="/cookies"
                className="hover:text-foreground transition-colors"
              >
                Cookies
              </Link>
              <button
                className="hover:text-foreground transition-colors"
                onClick={() => {
                  localStorage.removeItem('deckr_cookie_consent')
                  window.location.reload()
                }}
              >
                Cookie Settings
              </button>
            </nav>
          </div>

          <Separator className="my-8" />

          <p className="text-center text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} deckr. Made with &hearts; for
            brand-conscious teams.
          </p>
        </div>
      </footer>
    </div>
  )
}
