import type { Metadata } from "next";
import { PageHeader, Placeholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Recherche" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Recherche"
        purpose="Fiches, échéances, attributs et pièces jointes."
      />
      <Placeholder>
        Une seule recherche sur tout, texte océrisé des factures compris. Une
        pièce jointe non indexée est un tiroir fermé à clé. SPEC § 4.6.
      </Placeholder>
    </>
  );
}
