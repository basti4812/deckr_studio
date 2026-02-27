import type { Metadata } from "next";
import "./globals.css";

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
        {children}
      </body>
    </html>
  );
}
