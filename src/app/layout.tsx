import type { Metadata } from 'next'
import { DM_Serif_Display, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import { CookieConsent } from '@/components/cookie-consent'
import { I18nProvider } from '@/providers/i18n-provider'

const headingFont = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-heading',
  display: 'swap',
})

const bodyFont = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'onslide Studio – Presentation Management',
  description: 'Create, manage, and present company presentations without ever opening PowerPoint.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${headingFont.variable} ${bodyFont.variable}`}>
      <body className="font-sans antialiased">
        <I18nProvider>
          {children}
          <CookieConsent />
        </I18nProvider>
      </body>
    </html>
  )
}
