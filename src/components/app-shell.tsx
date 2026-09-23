import Link from "next/link";
import type { ReactNode } from "react";
import { MainNav } from "@/components/main-nav";
import { SEARCH_DESTINATION } from "@/lib/navigation";

/**
 * Coquille de l'application : en-tête, navigation, contenu.
 *
 * Server component — rien ici ne dépend du navigateur. Seule `MainNav` est
 * cliente, parce qu'elle lit le chemin courant.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[14rem_1fr]">
      <MainNav />

      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-3">
          <Link href="/" className="text-base font-semibold text-ink">
            House<span className="text-brand">Mate</span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href={SEARCH_DESTINATION.href}
              className="flex min-h-11 items-center px-3 text-sm text-ink-secondary"
            >
              {SEARCH_DESTINATION.label}
            </Link>
            {/* Capture rapide : accessible depuis n'importe quel écran, en
                quelques secondes. SPEC § 8. */}
            <button
              type="button"
              className="flex min-h-11 items-center rounded-md border border-border px-3 text-sm font-medium text-ink"
            >
              Ajouter
            </button>
          </div>
        </header>

        {/* pb-20 laisse la place à la barre basse sur mobile. */}
        <main className="flex-1 px-4 pt-5 pb-20 md:pb-8">{children}</main>
      </div>
    </div>
  );
}
