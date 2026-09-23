import type { Metadata } from "next";
import { PageHeader, Placeholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Personnes" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Personnes"
        purpose="Qui compte, et ce qu'on leur doit d'attention."
      />
      <Placeholder>
        Niveaux de relation, préavis associés, carnet d'idées cadeaux. Une fiche
        personne n'est pas un compte : un proche a une fiche et aucun accès.
        SPEC § 4.1.
      </Placeholder>
    </>
  );
}
