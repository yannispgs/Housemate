import type { Metadata } from "next";
import { PageHeader, Placeholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Historique" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="Historique"
        purpose="Ce qui a été fait, quand, et par qui."
      />
      <Placeholder>
        Le journal des complétions. Répond à la question inverse des échéances :
        « quand ai-je changé le filtre de la VMC ? ». SPEC § 3.3.
      </Placeholder>
    </>
  );
}
