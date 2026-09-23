import type { Metadata } from "next";
import { PageHeader, Placeholder } from "@/components/page-header";

export const metadata: Metadata = { title: "À traiter" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="À traiter"
        purpose="Ce qui demande une attention maintenant — jamais le corpus entier."
      />
      <Placeholder>
        Liste bornée de trois à six cartes d'échéance, ordonnées par urgence, et
        l'état vide qui doit se lire « rien ne t'attend ». SPEC § 10, brief de
        design problème (a).
      </Placeholder>
    </>
  );
}
