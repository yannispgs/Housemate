/**
 * En-tête de page : le titre, et la question à laquelle l'écran répond.
 *
 * Le `purpose` n'est pas décoratif — chaque écran de la SPEC § 10 est défini
 * par la question qu'il tranche, et l'afficher évite qu'une vue dérive vers
 * autre chose au fil du temps.
 */
export function PageHeader({
  title,
  purpose,
}: {
  title: string;
  purpose: string;
}) {
  return (
    <header className="mb-6">
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      <p className="mt-1 text-sm text-ink-secondary">{purpose}</p>
    </header>
  );
}

/**
 * Marque-place explicite pour les sections dont le contenu viendra plus tard.
 * Volontairement visible : une zone vide sans explication se confond avec un
 * bug, et l'état vide de l'accueil a un sens très différent (SPEC § 2).
 */
export function Placeholder({ children }: { children: string }) {
  return (
    <p className="rounded-md border border-dashed border-baseline px-4 py-6 text-sm text-ink-muted">
      {children}
    </p>
  );
}
