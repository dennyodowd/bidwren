import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import "./globals.css";

/**
 * IBM Plex Sans and Mono, per the design tokens.
 *
 * Mono is load-bearing rather than decorative: countdowns, dates, NAICS codes,
 * solicitation numbers, tags and column headers all use it, and it is tabular by default
 * so numeric columns align without extra work.
 */
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bidwren",
  description:
    "Daily monitoring of US federal contract opportunities posted to SAM.gov.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
