# HouseMate

> Un registre de ce que le foyer possède, et de ce que chaque chose lui demandera.

Ce que l'on ne note nulle part : l'engrais des plantes, la fin de garantie de la
télé, le contrôle technique, l'anniversaire d'une personne à qui on offre
vraiment quelque chose. Et son pendant : le numéro de série de la chaudière, la
facture de la perceuse.

Ce n'est **pas** un agenda, **pas** une todo-list, **pas** un gestionnaire de
stock.

## Documents

| Fichier | Contenu |
|---|---|
| `docs/CONVENTIONS.md` | Conventions de code |

La spécification produit, le brief de design et les données (référentiel du
jardin, relevés météo) ne sont **pas publiés** : ils décrivent un foyer réel.
Le code y renvoie sous la forme « SPEC § n ».

## Stack

Next 16 · React 19 · TypeScript strict · Supabase (Postgres, stockage, auth) ·
Tailwind 4 · Biome · Vitest · Playwright · Vercel.

Infrastructure partagée avec le projet frère **Boardmate** ; identité visuelle
délibérément différente.

## Ordre de construction

1. `src/lib/domain` + schéma — récurrences, masques de douze mois, complétion
   rétroactive. Testable sans interface ni base.
2. Le collecteur météo — autonome, alimente les alertes de gel de l'hiver.
3. L'API et la PWA.
4. Le design, par-dessus un produit qui fonctionne déjà.
