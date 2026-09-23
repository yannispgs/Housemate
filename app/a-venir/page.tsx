import type { Metadata } from "next";
import { PageHeader, Placeholder } from "@/components/page-header";

export const metadata: Metadata = { title: "À venir" };

export default function Page() {
  return (
    <>
      <PageHeader
        title="À venir"
        purpose="Les échéances des prochaines semaines."
      />
      <Placeholder>
        Vue chronologique, secondaire. Contrairement à « À traiter », elle
        montre aussi ce qui ne réclame encore rien.
      </Placeholder>
    </>
  );
}
