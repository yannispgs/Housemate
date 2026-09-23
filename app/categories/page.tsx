import type { Metadata } from "next";
import { PageHeader, Placeholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Catégories" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Catégories"
        purpose="Jardin, bricolage, garanties, administratif, santé, véhicule, occasions."
      />
      <Placeholder>
        Une catégorie mêle fiches et échéances — c'est le liant transversal du
        produit. Les pastilles sont monochromes : l'identité vient du mot, pas
        d'un code couleur. SPEC § 5.4, brief § 4.8.
      </Placeholder>
    </>
  );
}
