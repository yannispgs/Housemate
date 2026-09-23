import type { Metadata } from "next";
import { PageHeader, Placeholder } from "@/components/page-header";

export const metadata: Metadata = { title: "Fiche" };

/**
 * Next 16 : `params` est asynchrone, il faut l'attendre.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <PageHeader
        title="Fiche"
        purpose="Ce qu'on sait de cet objet, et ce qu'il réclamera."
      />
      <Placeholder>
        {`Attributs typés, échéances liées, historique de complétion, pièces jointes et frise annuelle de douze mois. Répond à « la télé est-elle encore sous garantie ? » sans passer par les échéances. Identifiant : ${id}.`}
      </Placeholder>
    </>
  );
}
