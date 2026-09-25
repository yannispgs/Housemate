<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# HouseMate

Product spec and design brief are **not in this repository**: the repo is
public, and both are full of real household examples. They live in the Claude
project memory (`spec/SPEC.md`, `spec/brief-design-system.md`); code comments
cite them as « SPEC § n ». `data/` is local-only and ignored by git.
Coding conventions: `docs/CONVENTIONS.md` (inherited from the sibling project
Boardmate, divergences marked).

## The one rule that shapes everything

`src/lib/domain` is **pure**: no Supabase, no Next, no vendor import at all.
It holds the recurrence engine, which runs **in the browser** (an offline
completion recomputes its own series without network) and **on the server**
(derivations, digests, alerts). Written once, tested once. A second
implementation in another language would silently drift and corrupt dates.

Layering: `UI → hooks → repository interface → vendor adapter`.

## Accessibility is in scope here

Unlike Boardmate, the Biome `a11y` category stays **on**. See
`docs/CONVENTIONS.md` §7 for why.
