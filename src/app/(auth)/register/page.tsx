'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const RegisterSchema = z
  .object({
    email: z.string().email({ error: 'Please enter a valid email address' }),
    companyName: z.string().min(1, 'Company name is required').max(255, 'Company name is too long'),
    displayName: z.string().min(1, 'Your name is required').max(255, 'Name is too long'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    preferredLanguage: z.enum(['de', 'en']),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords don't match",
        path: ['confirmPassword'],
      })
    }
  })

type RegisterValues = z.infer<typeof RegisterSchema>

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RegisterPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const form = useForm<RegisterValues>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: {
      email: '',
      companyName: '',
      displayName: '',
      password: '',
      confirmPassword: '',
      preferredLanguage: 'en',
    },
  })

  const isSubmitting = form.formState.isSubmitting

  async function onSubmit(values: RegisterValues) {
    setServerError(null)

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          tenantName: values.companyName,
          displayName: values.displayName,
          preferredLanguage: values.preferredLanguage,
        }),
      })

      let data: { error?: string; emailConfirmed?: boolean } = {}
      try {
        data = await response.json()
      } catch {
        // Server returned non-JSON (e.g. 500 HTML error page)
      }

      if (!response.ok) {
        setServerError(data.error ?? t('auth.registration_failed'))
        return
      }

      if (data.emailConfirmed) {
        router.push('/login?registered=true')
        return
      }

      setSuccess(true)
    } catch {
      setServerError(t('auth.registration_failed'))
    }
  }

  if (success) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>{t('auth.check_email')}</CardTitle>
          <CardDescription>
            {t('auth.confirmation_link_sent')}{' '}
            <span className="font-medium text-foreground">{form.getValues('email')}</span>.{' '}
            {t('auth.click_to_activate')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            {t('auth.already_confirmed')}{' '}
            <Link href="/login" className="font-medium text-foreground hover:underline">
              {t('auth.sign_in')}
            </Link>
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t('auth.register_title')}</CardTitle>
        <CardDescription>{t('auth.register_description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('auth.company_name')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('auth.company_name_placeholder')}
                      autoComplete="organization"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('auth.your_name')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('auth.your_name_placeholder')}
                      autoComplete="name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('auth.work_email')}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder={t('auth.work_email_placeholder')}
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
                  <FormLabel>{t('auth.password_label')}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder={t('auth.password_placeholder')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('auth.confirm_password')}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="preferredLanguage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('auth.preferred_language')}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="en">{t('auth.english')}</SelectItem>
                      <SelectItem value="de">{t('auth.deutsch')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? t('auth.creating_workspace') : t('auth.create_workspace')}
            </Button>
          </form>
        </Form>

        <p className="text-center text-sm text-muted-foreground">
          {t('auth.already_have_account')}{' '}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            {t('auth.sign_in')}
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
