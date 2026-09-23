import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfb" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a19" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
