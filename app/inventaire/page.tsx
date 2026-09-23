import type { Metadata } from "next";
import { PageHeader, Placeholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Inventaire" };

export default function Page() {
  return (
    <>
      <PageHeader title="Inventaire" purpose="Ce que le foyer possède." />
      <Placeholder>
        Les fiches, par nature ou par catégorie. L'inventaire est plat : le
        regroupement passe par la nature, la catégorie et les attributs de type
        liste. SPEC § 4.4.
      </Placeholder>
    </>
  );
}
