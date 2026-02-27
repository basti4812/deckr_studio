import Link from 'next/link'
import {
  BookOpen,
  Check,
  FileDown,
  LayoutDashboard,
  ShieldCheck,
  Zap,
} from 'lucide-react'
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

const painPoints = [
  {
    icon: '😩',
    title: 'Off-brand presentations',
    description:
      'Employees use outdated slides, wrong fonts, and inconsistent colors. Every presentation looks different.',
  },
  {
    icon: '⏱️',
    title: 'Wasted hours copying slides',
    description:
      "Assembling a presentation means digging through folders and copying between PowerPoint files. Every. Single. Time.",
  },
  {
    icon: '🤷',
    title: 'Nobody knows which version is current',
    description:
      'Multiple slide versions floating around in email threads, shared drives, and local folders.',
  },
]

const features = [
  {
    icon: BookOpen,
    title: 'Centralized slide library',
    description:
      'One place for all approved slides. Admins manage the library — employees always use the latest, on-brand version.',
  },
  {
    icon: LayoutDashboard,
    title: 'Visual board canvas',
    description:
      'Drag and drop slides into your presentation on an intuitive Miro-style board. No PowerPoint required.',
  },
  {
    icon: FileDown,
    title: 'One-click export',
    description:
      'Export your assembled presentation as a fully formatted PowerPoint or PDF — fonts, colors, and layouts intact.',
  },
  {
    icon: ShieldCheck,
    title: 'Corporate identity protection',
    description:
      'Users can only edit the fields admins unlock. Design, fonts, and layouts are always on-brand.',
  },
]

const steps = [
  {
    number: '1',
    title: 'Admin builds the slide library',
    description:
      'Upload approved slides, organize them into groups, and define which fields employees can customize.',
  },
  {
    number: '2',
    title: 'Employees assemble presentations',
    description:
      'Drag slides onto the board, fill in customer-specific fields, and arrange the perfect presentation.',
  },
  {
    number: '3',
    title: 'Export or present — always on-brand',
    description:
      'Export as PowerPoint or PDF, or present directly from the browser. Every time, perfectly on-brand.',
  },
]

const pricingTiers = [
  {
    name: 'Starter',
    price: '9',
    description: 'Perfect for small teams and growing companies.',
    seats: '1–5 users',
    features: [
      'Unlimited slides',
      'Unlimited projects',
      'PowerPoint & PDF export',
      'External share links',
      'Email support',
    ],
    cta: 'Start free trial',
    href: '/register',
    highlighted: false,
  },
  {
    name: 'Team',
    price: '7',
    description: 'For teams that present every day.',
    seats: '6–20 users',
    features: [
      'Everything in Starter',
      'Template sets',
      'Version history',
      'Slide comments',
      'Priority support',
    ],
    cta: 'Start free trial',
    href: '/register',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: null,
    description: 'For large organizations with custom needs.',
    seats: '21+ users',
    features: [
      'Everything in Team',
      'SSO (Google, Microsoft)',
      'Custom branding',
      'Dedicated onboarding',
      'SLA & invoicing',
    ],
    cta: 'Contact us',
    href: 'mailto:hello@deckr.studio',
    highlighted: false,
  },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LandingPage() {
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
            Stop copying slides.
            <br />
            <span className="text-primary">Start presenting.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg text-gray-400">
            deckr gives your team a centralized, admin-controlled slide library
            so everyone assembles on-brand presentations in minutes — without
            ever opening PowerPoint.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/register">Start your free 14-day trial</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <Link href="/demo">Try the demo</Link>
            </Button>
          </div>

          <p className="mt-4 text-xs text-gray-500">No credit card required.</p>

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
              The PowerPoint chaos ends here
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              Sound familiar? These are the problems deckr was built to solve.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {painPoints.map((point) => (
              <div key={point.title} className="text-center">
                <div className="mb-4 text-4xl">{point.icon}</div>
                <h3 className="mb-2 font-semibold text-gray-900">{point.title}</h3>
                <p className="text-sm text-gray-500">{point.description}</p>
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
              Everything your team needs
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              A complete platform for presentation management — from slide
              library to export.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <Card key={feature.title} className="border-gray-100">
                <CardHeader className="pb-3">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-base">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
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
              Three steps to on-brand presentations
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              Get your team presenting correctly in under a day.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.number} className="relative flex flex-col items-center text-center">
                {index < steps.length - 1 && (
                  <div
                    aria-hidden
                    className="absolute left-[calc(50%+2rem)] top-5 hidden h-px w-[calc(100%-4rem)] bg-gray-200 sm:block"
                  />
                )}
                <Badge className="mb-4 h-10 w-10 rounded-full p-0 flex items-center justify-center text-sm">
                  {step.number}
                </Badge>
                <h3 className="mb-2 font-semibold text-gray-900">{step.title}</h3>
                <p className="text-sm text-gray-500">{step.description}</p>
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
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              Start with a 14-day free trial. No credit card required.
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
                    <Badge>Most popular</Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-lg">{tier.name}</CardTitle>
                  <CardDescription>{tier.description}</CardDescription>
                  <div className="mt-2">
                    {tier.price ? (
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-gray-900">
                          €{tier.price}
                        </span>
                        <span className="text-sm text-gray-500">/user/month</span>
                      </div>
                    ) : (
                      <span className="text-2xl font-bold text-gray-900">
                        Custom
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
            Ready to end the slide chaos?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lg text-gray-400">
            Join the teams that use deckr to create on-brand presentations in
            minutes, not hours.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/register">Start your free trial</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <Link href="/demo">See the demo first</Link>
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
                Log in
              </Link>
              <Link href="/register" className="hover:text-gray-300 transition-colors">
                Start free trial
              </Link>
              <Separator orientation="vertical" className="h-3 bg-gray-700" />
              <Link href="/impressum" className="hover:text-gray-300 transition-colors">
                Impressum
              </Link>
              <Link href="/privacy" className="hover:text-gray-300 transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-gray-300 transition-colors">
                Terms
              </Link>
            </nav>
          </div>

          <p className="mt-6 text-center text-xs text-gray-600">
            © {new Date().getFullYear()} deckr Studio. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
