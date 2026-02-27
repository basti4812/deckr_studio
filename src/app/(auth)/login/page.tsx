'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'

import { createBrowserSupabaseClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const LoginSchema = z.object({
  email: z.string().email({ error: 'Please enter a valid email address' }),
  password: z.string().min(1, 'Password is required'),
})

type LoginValues = z.infer<typeof LoginSchema>

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function LoginForm() {
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') ?? ''

  const [serverError, setServerError] = useState<string | null>(null)
  const [emailNotConfirmed, setEmailNotConfirmed] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)

  const form = useForm<LoginValues>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: '', password: '' },
  })

  const isSubmitting = form.formState.isSubmitting

  async function onSubmit(values: LoginValues) {
    setServerError(null)
    setEmailNotConfirmed(false)

    const supabase = createBrowserSupabaseClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    })

    if (error) {
      if (error.message.toLowerCase().includes('email not confirmed')) {
        setEmailNotConfirmed(true)
      } else if (
        error.message.toLowerCase().includes('invalid login credentials')
      ) {
        setServerError('Incorrect email or password. Please try again.')
      } else {
        setServerError(error.message)
      }
      return
    }

    if (!data.session) {
      setServerError('Login failed. Please try again.')
      return
    }

    // Use window.location.href to flush auth state before navigating
    const role = data.session.user.app_metadata?.role ?? 'employee'
    const defaultPath = role === 'admin' ? '/dashboard' : '/home'
    window.location.href = redirectTo || defaultPath
  }

  async function handleResendConfirmation() {
    const email = form.getValues('email')
    if (!email) return

    setResendLoading(true)
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.resend({ type: 'signup', email })
    setResendLoading(false)
    setResendSuccess(true)
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Sign in to your deckr Studio account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Email not confirmed state */}
        {emailNotConfirmed && (
          <Alert>
            <AlertDescription className="space-y-2">
              <p>Please confirm your email address before signing in.</p>
              {resendSuccess ? (
                <p className="text-sm text-muted-foreground">
                  Confirmation email sent. Please check your inbox.
                </p>
              ) : (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-sm"
                  onClick={handleResendConfirmation}
                  disabled={resendLoading}
                >
                  {resendLoading && (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  )}
                  Resend confirmation email
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* General server error */}
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="you@company.com"
                      autoComplete="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Password</FormLabel>
                    <Link
                      href="/forgot-password"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Sign in
            </Button>
          </form>
        </Form>

        {/* SSO placeholder */}
        <div className="relative">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
            or
          </span>
        </div>

        <Button
          variant="outline"
          className="w-full text-muted-foreground"
          disabled
          title="Contact your admin to enable SSO for your organization"
        >
          SSO Login
          <span className="ml-2 rounded bg-muted px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide">
            Coming soon
          </span>
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link
            href="/register"
            className="font-medium text-foreground hover:underline"
          >
            Create one
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
