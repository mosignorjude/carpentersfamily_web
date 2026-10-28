import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { GlobalFlashListener } from "@/components/ui/global-flash-listener";
import { NavigationProgressBar } from "@/components/ui/navigation-progress-bar";
import { clubBrand } from "@/lib/brand";
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

// Must equal .app-sticky-header's background in globals.css; the viewport test reads that rule back.
export const viewport: Viewport = {
  themeColor: "#f7f6f2",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: clubBrand.name,
  description: clubBrand.description,
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
    <html className={`${dmSans.variable} ${ibmPlexSans.variable}`} lang="en">
      <body className="antialiased">
        <NavigationProgressBar />
        <GlobalFlashListener />
        {children}
      </body>
    </html>
  );
}
