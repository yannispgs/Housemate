"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isActive,
  PRIMARY_DESTINATIONS,
  SECONDARY_DESTINATIONS,
} from "@/lib/navigation";

/**
 * Client component : l'état actif dépend du chemin courant, donc du navigateur.
 *
 * Barre basse sur mobile (portrait, pouce, zones sûres), colonne à gauche sur
 * grand écran. Les deux destinations principales restent de même rang dans les
 * deux dispositions — il n'y a pas de sélecteur d'application.
 */
export function MainNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigation principale"
      className="
        fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface
        pb-[env(safe-area-inset-bottom)]
        md:static md:border-t-0 md:border-r md:pb-0
      "
    >
      <ul className="flex md:flex-col md:gap-1 md:p-3">
        {PRIMARY_DESTINATIONS.map(destination => {
          const active = isActive(destination.href, pathname);
          return (
            <li key={destination.href} className="flex-1 md:flex-none">
              <Link
                href={destination.href}
                aria-current={active ? "page" : undefined}
                className={`
                  flex min-h-11 items-center justify-center px-3 py-2 text-sm
                  font-medium md:justify-start md:rounded-md
                  ${
                    active
                      ? "text-ink underline decoration-brand decoration-2 underline-offset-8"
                      : "text-ink-secondary"
                  }
                `}
              >
                {destination.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Les vues secondaires ne se justifient qu'à partir du grand écran :
          sur mobile elles passeront par un menu, pas par la barre basse. */}
      <ul className="hidden md:mt-4 md:flex md:flex-col md:gap-1 md:border-t md:border-border md:p-3 md:pt-4">
        {SECONDARY_DESTINATIONS.map(destination => {
          const active = isActive(destination.href, pathname);
          return (
            <li key={destination.href}>
              <Link
                href={destination.href}
                aria-current={active ? "page" : undefined}
                className={`
                  flex min-h-11 items-center rounded-md px-3 py-2 text-sm
                  ${active ? "text-ink" : "text-ink-secondary"}
                `}
              >
                {destination.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
