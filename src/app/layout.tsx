import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { GlobalFlashListener } from "@/components/ui/global-flash-listener";
import { clubBrand } from "@/lib/brand";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-ibm-plex-sans",
});

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
      <body>
        <GlobalFlashListener />
        {children}
      </body>
    </html>
  );
}
