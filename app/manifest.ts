import type { MetadataRoute } from "next";

/**
 * Manifeste PWA. L'usage principal est une app installée sur l'écran d'accueil
 * d'un iPhone — c'est aussi la condition pour recevoir des notifications push
 * sur iOS (SPEC § 12.5, alertes `critique`).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HouseMate",
    short_name: "HouseMate",
    description:
      "Un registre de ce que le foyer possède, et de ce que chaque chose lui demandera.",
    lang: "fr",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fcfcfb",
    theme_color: "#fcfcfb",
    icons: [],
  };
}
