import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Sans } from "next/font/google";
import type { ReactNode } from "react";
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
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className={`${dmSans.variable} ${ibmPlexSans.variable}`} lang="en">
      <body>{children}</body>
    </html>
  );
}
