import type { Metadata } from "next";
import { PageHeader, Placeholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Foyer" };

export default function Page() {
  return (
    <>
      <PageHeader title="Foyer" purpose="Les réglages communs." />
      <Placeholder>
        Membres, catégories, modèles de fiches, réglages de notification,
        sauvegarde et restauration de contrôle. SPEC § 14.
      </Placeholder>
    </>
  );
}
