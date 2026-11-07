import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { GlobalFlashListener } from "@/components/ui/global-flash-listener";
import { NavigationProgressBar } from "@/components/ui/navigation-progress-bar";
import { clubBrand } from "@/lib/brand";
import { SITE_ORIGIN } from "@/lib/site.mjs";
import "./globals.css";

const dmSans = localFont({
  src: [
    {
      path: "../fonts/dm-sans-latin.woff2",
      weight: "100 1000",
      style: "normal",
    },
  ],
  variable: "--font-dm-sans",
  display: "swap",
});

const ibmPlexSans = localFont({
  src: [
    {
      path: "../fonts/ibm-plex-sans-latin.woff2",
      weight: "100 700",
      style: "normal",
    },
  ],
  variable: "--font-ibm-plex-sans",
  display: "swap",
});

const fraunces = localFont({
  src: [
    {
      path: "../fonts/fraunces-latin.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-fraunces",
  display: "swap",
});

// Must equal .app-sticky-header's background in globals.css; the viewport test reads that rule back.
export const viewport: Viewport = {
  themeColor: "#f7f6f2",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: clubBrand.name,
  description: clubBrand.description,
  openGraph: {
    title: clubBrand.name,
    description: clubBrand.description,
    url: SITE_ORIGIN,
    siteName: clubBrand.name,
    images: [
      {
        url: "/landing/og-share.jpg",
        width: 1024,
        height: 571,
        alt: clubBrand.name,
      },
    ],
    locale: "en_NG",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: clubBrand.name,
    description: clubBrand.description,
    images: ["/landing/og-share.jpg"],
  },
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
      { url: clubBrand.logoSrc, type: "image/png" },
    ],
    apple: "/apple-icon.png",
    shortcut: "/favicon.ico",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      className={`${dmSans.variable} ${ibmPlexSans.variable} ${fraunces.variable}`}
      lang="en"
    >
      <body className="antialiased">
        <NavigationProgressBar />
        <GlobalFlashListener />
        {children}
      </body>
    </html>
  );
}
