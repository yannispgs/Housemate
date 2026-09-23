/**
 * Carte de navigation — donnée pure, sans dépendance à Next ni à React.
 *
 * SPEC § 10. Deux destinations de même rang, « À traiter » et « Inventaire »,
 * et surtout **pas de sélecteur d'application** : la séparation en deux apps a
 * été envisagée puis écartée (SPEC § 0).
 */

export type Destination = {
  readonly href: string;
  readonly label: string;
  /** Ce à quoi l'écran répond, en une phrase. Sert de description accessible. */
  readonly purpose: string;
};

/**
 * Les deux moitiés du produit. Rang égal : ni l'une ni l'autre n'est « l'app
 * principale ». Problème (b) du brief de design.
 */
export const PRIMARY_DESTINATIONS: readonly Destination[] = [
  {
    href: "/",
    label: "À traiter",
    purpose: "Ce qui demande une attention maintenant",
  },
  {
    href: "/inventaire",
    label: "Inventaire",
    purpose: "Ce que le foyer possède",
  },
];

export const SECONDARY_DESTINATIONS: readonly Destination[] = [
  {
    href: "/a-venir",
    label: "À venir",
    purpose: "Les échéances des prochaines semaines",
  },
  {
    href: "/categories",
    label: "Catégories",
    purpose: "Jardin, garanties, véhicule… fiches et échéances mêlées",
  },
  {
    href: "/personnes",
    label: "Personnes",
    purpose: "Niveaux de relation, préavis, idées cadeaux",
  },
  {
    href: "/historique",
    label: "Historique",
    purpose: "Ce qui a été fait, quand, par qui",
  },
  {
    href: "/foyer",
    label: "Foyer",
    purpose: "Membres, catégories, modèles, notifications, sauvegarde",
  },
];

/** Toujours accessibles, depuis n'importe quel écran. */
export const SEARCH_DESTINATION: Destination = {
  href: "/recherche",
  label: "Recherche",
  purpose: "Fiches, échéances, attributs et pièces jointes",
};

export const ALL_DESTINATIONS: readonly Destination[] = [
  ...PRIMARY_DESTINATIONS,
  ...SECONDARY_DESTINATIONS,
  SEARCH_DESTINATION,
];

/**
 * Une destination est active si le chemin courant lui correspond. La racine est
 * un cas particulier : sans cette exception, « À traiter » resterait actif
 * partout puisque tous les chemins commencent par « / ».
 */
export function isActive(href: string, pathname: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
