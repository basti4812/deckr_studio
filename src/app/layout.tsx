import type { Metadata } from "next";
import "./globals.css";
import { CookieConsent } from "@/components/cookie-consent";
import { I18nProvider } from "@/providers/i18n-provider";

export const metadata: Metadata = {
  title: "deckr – Presentation Management",
  description: "Create, manage, and present company presentations without ever opening PowerPoint.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <I18nProvider>
          {children}
        </I18nProvider>
        <CookieConsent />
      </body>
    </html>
  );
}
