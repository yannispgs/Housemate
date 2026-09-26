import type { Metadata, Viewport } from "next";
import { Caprasimo, Figtree } from "next/font/google";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

/*
 * Polices auto-hébergées, PAS le CDN Google.
 *
 * `next/font/google` télécharge les fichiers au moment du BUILD et les sert
 * depuis notre propre domaine. Aucune requête vers Google au runtime.
 *
 * ⚠️ Deux raisons, et la première est une exigence du produit :
 * 1. Le § 13 promet que consultation et complétion marchent hors-ligne. Un
 *    `@import url(fonts.googleapis.com)` se résout au runtime — dans la cave
 *    ou le garage, la police tombe en repli et toute la mise en page bouge.
 * 2. Le CDN reçoit l'IP de chaque membre du foyer à chaque chargement, ce que
 *    le § 7 cherche précisément à éviter.
 *
 * Caprasimo et Figtree sont sous SIL Open Font License : l'hébergement et la
 * redistribution sont permis.
 */
const caprasimo = Caprasimo({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-heading-loaded",
  display: "swap",
});

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-body-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "HouseMate",
    template: "%s · HouseMate",
  },
  description:
    "Un registre de ce que le foyer possède, et de ce que chaque chose lui demandera.",
  applicationName: "HouseMate",
  appleWebApp: {
    capable: true,
    title: "HouseMate",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  // `viewportFit: cover` est nécessaire pour que `env(safe-area-inset-*)`
  // renvoie autre chose que zéro sur iPhone.
  viewportFit: "cover",
  // Valeurs de `--page` dans les deux modes (design system Organic).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#d5d6d8" },
    { media: "(prefers-color-scheme: dark)", color: "#2a2b2e" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${caprasimo.variable} ${figtree.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
