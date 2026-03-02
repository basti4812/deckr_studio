'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  CreditCard,
  Download,
  FileText,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import type { Subscription } from '@/lib/subscription-helpers'
import { getTrialDaysRemaining } from '@/lib/subscription-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SeatUsage {
  used: number
  licensed: number | null
}

interface Invoice {
  id: string
  tenant_id: string
  stripe_invoice_id: string | null
  amount_cents: number
  currency: string
  status: 'paid' | 'pending' | 'failed'
  invoice_date: string
  pdf_url: string | null
  created_at: string
}

interface BillingContact {
  billing_company_name: string
  billing_address_street: string
  billing_address_city: string
  billing_address_postal_code: string
  billing_address_country: string
  billing_vat_id: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAccessToken(): Promise<string | null> {
  const supabase = createBrowserSupabaseClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

function formatCurrency(amountCents: number, currency: string = 'eur'): string {
  const amount = amountCents / 100
  try {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '\u2014'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

function SubscriptionStatusBadge({
  status,
}: {
  status: Subscription['status']
}) {
  switch (status) {
    case 'active':
      return (
        <Badge
          variant="outline"
          className="border-green-500/50 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
        >
          Active
        </Badge>
      )
    case 'trialing':
      return (
        <Badge
          variant="outline"
          className="border-blue-500/50 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
        >
          Trialing
        </Badge>
      )
    case 'past_due':
      return (
        <Badge
          variant="outline"
          className="border-amber-500/50 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
        >
          Past Due
        </Badge>
      )
    case 'cancelled':
      return (
        <Badge
          variant="outline"
          className="border-red-500/50 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
        >
          Cancelled
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function InvoiceStatusBadge({
  status,
}: {
  status: 'paid' | 'pending' | 'failed'
}) {
  switch (status) {
    case 'paid':
      return (
        <Badge
          variant="outline"
          className="border-green-500/50 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
        >
          Paid
        </Badge>
      )
    case 'pending':
      return (
        <Badge
          variant="outline"
          className="border-amber-500/50 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
        >
          Pending
        </Badge>
      )
    case 'failed':
      return (
        <Badge
          variant="outline"
          className="border-red-500/50 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
        >
          Failed
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function BillingPage() {
  const { toast } = useToast()

  // Data state
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [seatUsage, setSeatUsage] = useState<SeatUsage>({
    used: 0,
    licensed: null,
  })
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [billingContact, setBillingContact] = useState<BillingContact>({
    billing_company_name: '',
    billing_address_street: '',
    billing_address_city: '',
    billing_address_postal_code: '',
    billing_address_country: '',
    billing_vat_id: '',
  })

  // Loading states
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingContact, setSavingContact] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    const token = await getAccessToken()
    if (!token) return

    setLoading(true)
    setError(null)

    try {
      // Fetch subscription, tenant, and invoices in parallel
      const [subRes, tenantRes, invoiceRes] = await Promise.all([
        fetch('/api/subscription', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/tenant', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/invoices', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      if (!subRes.ok) {
        throw new Error('Failed to load subscription data')
      }
      if (!tenantRes.ok) {
        throw new Error('Failed to load tenant data')
      }

      const subData = await subRes.json()
      setSubscription(subData.subscription)
      setSeatUsage(subData.seatUsage ?? { used: 0, licensed: null })

      const tenantData = await tenantRes.json()
      const tenant = tenantData.user?.tenant ?? {}
      setBillingContact({
        billing_company_name: tenant.billing_company_name ?? '',
        billing_address_street: tenant.billing_address_street ?? '',
        billing_address_city: tenant.billing_address_city ?? '',
        billing_address_postal_code: tenant.billing_address_postal_code ?? '',
        billing_address_country: tenant.billing_address_country ?? '',
        billing_vat_id: tenant.billing_vat_id ?? '',
      })

      // Invoices endpoint may not exist yet (created in backend phase)
      if (invoiceRes.ok) {
        const invoiceData = await invoiceRes.json()
        setInvoices(invoiceData.invoices ?? [])
      } else {
        setInvoices([])
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load billing data'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ---------------------------------------------------------------------------
  // Save billing contact
  // ---------------------------------------------------------------------------

  async function handleSaveBillingContact(e: React.FormEvent) {
    e.preventDefault()
    const token = await getAccessToken()
    if (!token) return

    setSavingContact(true)
    try {
      const res = await fetch('/api/tenant/billing', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(billingContact),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to save billing contact')
      }

      toast({
        title: 'Billing contact saved',
        description: 'Your billing details have been updated successfully.',
      })
    } catch (err) {
      toast({
        title: 'Error',
        description:
          err instanceof Error ? err.message : 'Failed to save billing contact',
        variant: 'destructive',
      })
    } finally {
      setSavingContact(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Cancel subscription
  // ---------------------------------------------------------------------------

  async function handleCancelSubscription() {
    const token = await getAccessToken()
    if (!token) return

    setCancelling(true)
    try {
      const res = await fetch('/api/billing/cancel', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to request cancellation')
      }

      toast({
        title: 'Cancellation requested',
        description:
          'Our team will be in touch shortly to process your cancellation.',
      })
    } catch (err) {
      toast({
        title: 'Error',
        description:
          err instanceof Error
            ? err.message
            : 'Failed to request cancellation',
        variant: 'destructive',
      })
    } finally {
      setCancelling(false)
      setCancelDialogOpen(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const planName = subscription?.pricing_tier ?? 'Custom plan'
  const billingCycle = subscription?.billing_cycle ?? null
  const pricePerUser = subscription?.price_per_user_cents ?? null
  const nextRenewal = subscription?.next_renewal_date ?? null
  const trialDaysRemaining = getTrialDaysRemaining(subscription)
  const isTrialExpired =
    subscription?.status === 'trialing' && trialDaysRemaining === 0

  // Seat usage percentage
  const seatPercentage =
    seatUsage.licensed !== null && seatUsage.licensed > 0
      ? Math.round((seatUsage.used / seatUsage.licensed) * 100)
      : 0

  // Progress bar color
  const progressBarClass =
    seatUsage.licensed !== null
      ? seatPercentage >= 100
        ? '[&>div]:bg-red-500'
        : seatPercentage >= 80
          ? '[&>div]:bg-amber-500'
          : ''
      : ''

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-96" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
        <Skeleton className="h-80" />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  if (error) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your subscription, seats, payment method, and view invoices.
          </p>
        </div>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={fetchData}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your subscription, seats, payment method, and view invoices
            for your organization.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ----------------------------------------------------------------- */}
          {/* Plan Overview Card */}
          {/* ----------------------------------------------------------------- */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Plan Overview</CardTitle>
                {subscription && (
                  <SubscriptionStatusBadge status={subscription.status} />
                )}
              </div>
              <CardDescription>
                Your current subscription details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Trial Banner */}
              {subscription?.status === 'trialing' && (
                <div
                  className={`rounded-lg p-3 text-sm ${
                    isTrialExpired
                      ? 'border border-red-500/50 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                      : 'border border-blue-500/50 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0" />
                    {isTrialExpired ? (
                      <span className="font-medium">
                        Trial expired
                      </span>
                    ) : (
                      <span>
                        <strong>{trialDaysRemaining}</strong> day
                        {trialDaysRemaining !== 1 ? 's' : ''} remaining in your
                        free trial
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Plan details */}
              <div className="grid gap-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-medium">{planName}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Price per user</span>
                  <span className="font-medium">
                    {pricePerUser !== null
                      ? `${formatCurrency(pricePerUser)} / user / ${billingCycle === 'annual' ? 'year' : 'month'}`
                      : '\u2014'}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Billing cycle</span>
                  <span className="font-medium capitalize">
                    {billingCycle ?? '\u2014'}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Next renewal</span>
                  <span className="font-medium">{formatDate(nextRenewal)}</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/admin/billing/upgrade">
                    <ArrowUpCircle className="mr-2 h-4 w-4" />
                    Upgrade plan
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/admin/billing/downgrade">
                    <ArrowDownCircle className="mr-2 h-4 w-4" />
                    Downgrade plan
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setCancelDialogOpen(true)}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancel subscription
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ----------------------------------------------------------------- */}
          {/* Seat Usage Card */}
          {/* ----------------------------------------------------------------- */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Seat Usage</CardTitle>
              <CardDescription>
                Active user seats in your organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {seatUsage.licensed !== null ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm text-muted-foreground">
                      <span className="text-2xl font-semibold text-foreground">
                        {seatUsage.used}
                      </span>{' '}
                      of {seatUsage.licensed} seats used
                    </p>
                    <span className="text-sm font-medium text-muted-foreground">
                      {seatPercentage}%
                    </span>
                  </div>
                  <Progress
                    value={Math.min(seatPercentage, 100)}
                    className={`h-3 ${progressBarClass}`}
                    aria-label={`${seatUsage.used} of ${seatUsage.licensed} seats used`}
                  />
                  {seatPercentage >= 100 && (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      All seats are in use. Upgrade your plan to add more team
                      members.
                    </p>
                  )}
                  {seatPercentage >= 80 && seatPercentage < 100 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      You are approaching your seat limit. Consider upgrading
                      your plan.
                    </p>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border border-dashed p-6">
                  <div className="text-center w-full">
                    <p className="text-sm text-muted-foreground">
                      <span className="text-2xl font-semibold text-foreground">
                        {seatUsage.used}
                      </span>{' '}
                      active seat{seatUsage.used !== 1 ? 's' : ''}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Unlimited seats on your current plan
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Invoice List */}
        {/* ----------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invoices</CardTitle>
            <CardDescription>
              Your billing history and downloadable invoices
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                <FileText className="h-8 w-8 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium text-muted-foreground">
                  No invoices yet
                </p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground/70">
                  Your first invoice will appear after your first billing cycle.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">
                        <span className="sr-only">Download</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="text-sm">
                          {formatDate(invoice.invoice_date)}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {formatCurrency(
                            invoice.amount_cents,
                            invoice.currency
                          )}
                        </TableCell>
                        <TableCell>
                          <InvoiceStatusBadge status={invoice.status} />
                        </TableCell>
                        <TableCell>
                          {invoice.pdf_url &&
                          /^https?:\/\//.test(invoice.pdf_url) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                            >
                              <a
                                href={invoice.pdf_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Download invoice from ${formatDate(invoice.invoice_date)}`}
                              >
                                <Download className="mr-2 h-4 w-4" />
                                PDF
                              </a>
                            </Button>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled
                                    aria-label="PDF not available"
                                  >
                                    <Download className="mr-2 h-4 w-4" />
                                    PDF
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                PDF will be available once your payment provider
                                is connected
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ----------------------------------------------------------------- */}
        {/* Payment Method Card */}
        {/* ----------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payment Method</CardTitle>
            <CardDescription>
              Your payment method for subscription charges
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 rounded-lg border border-dashed p-6">
              <CreditCard className="h-8 w-8 text-muted-foreground/50" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  No payment method connected yet
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground/70">
                  A payment method will be added when your payment provider is
                  configured.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ----------------------------------------------------------------- */}
        {/* Billing Contact Form */}
        {/* ----------------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Billing Contact</CardTitle>
            <CardDescription>
              Company and address details for your invoices
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveBillingContact}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="billing-company">Company name</Label>
                  <Input
                    id="billing-company"
                    type="text"
                    placeholder="Acme Inc."
                    maxLength={255}
                    value={billingContact.billing_company_name}
                    onChange={(e) =>
                      setBillingContact((prev) => ({
                        ...prev,
                        billing_company_name: e.target.value,
                      }))
                    }
                    disabled={savingContact}
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="billing-street">Street address</Label>
                  <Input
                    id="billing-street"
                    type="text"
                    placeholder="123 Main Street"
                    maxLength={500}
                    value={billingContact.billing_address_street}
                    onChange={(e) =>
                      setBillingContact((prev) => ({
                        ...prev,
                        billing_address_street: e.target.value,
                      }))
                    }
                    disabled={savingContact}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="billing-city">City</Label>
                  <Input
                    id="billing-city"
                    type="text"
                    placeholder="Berlin"
                    maxLength={255}
                    value={billingContact.billing_address_city}
                    onChange={(e) =>
                      setBillingContact((prev) => ({
                        ...prev,
                        billing_address_city: e.target.value,
                      }))
                    }
                    disabled={savingContact}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="billing-postal">Postal code</Label>
                  <Input
                    id="billing-postal"
                    type="text"
                    placeholder="10115"
                    maxLength={20}
                    value={billingContact.billing_address_postal_code}
                    onChange={(e) =>
                      setBillingContact((prev) => ({
                        ...prev,
                        billing_address_postal_code: e.target.value,
                      }))
                    }
                    disabled={savingContact}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="billing-country">Country</Label>
                  <Input
                    id="billing-country"
                    type="text"
                    placeholder="Germany"
                    maxLength={100}
                    value={billingContact.billing_address_country}
                    onChange={(e) =>
                      setBillingContact((prev) => ({
                        ...prev,
                        billing_address_country: e.target.value,
                      }))
                    }
                    disabled={savingContact}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="billing-vat">VAT ID</Label>
                  <Input
                    id="billing-vat"
                    type="text"
                    placeholder="DE123456789"
                    maxLength={50}
                    value={billingContact.billing_vat_id}
                    onChange={(e) =>
                      setBillingContact((prev) => ({
                        ...prev,
                        billing_vat_id: e.target.value,
                      }))
                    }
                    disabled={savingContact}
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <Button type="submit" disabled={savingContact}>
                  {savingContact ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save billing contact'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* ----------------------------------------------------------------- */}
        {/* Cancel Subscription Dialog */}
        {/* ----------------------------------------------------------------- */}
        <AlertDialog
          open={cancelDialogOpen}
          onOpenChange={(open) => !cancelling && setCancelDialogOpen(open)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel {planName}?</AlertDialogTitle>
              <AlertDialogDescription>
                If you cancel your subscription, your team will lose access to
                deckr at the end of the current billing period. Your data will be
                preserved for 30 days.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancelling}>
                Keep subscription
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCancelSubscription}
                disabled={cancelling}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {cancelling ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Requesting...
                  </>
                ) : (
                  <>
                    <XCircle className="mr-2 h-4 w-4" />
                    Request cancellation
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  )
}
