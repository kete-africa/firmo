# Firmo — project context

> The single place where this repository's context lives. `AGENTS.md` points here.

## What this repository is

**Firmo**, a Kete app: a tradesman sends a voice note, a photo of his paper or a text on WhatsApp
or Telegram, and gets back a professional quote, proforma or invoice as a PDF — his prices, our
presentation. Rewritten in TypeScript on the Kete architecture (doctrine D-023); the previous
Python version (`Jean-claude21/firmo`, local `../../projects_labs/firmo`) is the reference: its
tests, PDF cases and evaluation sets are the oracle.

## Read before any action

1. `.specify/memory/constitution.md` — the rules of this repository.
2. `docs/product/` — Firmo's product decisions and model (in French, from the reference).
3. The Kete doctrine (`kete-africa/kete`, local `../kete`): `docs/PRINCIPES.md`,
   `docs/ARCHITECTURE_APP.md`, `docs/DECISIONS.md` (D-013, D-016, D-019, D-023, D-024).
4. `docs/ROADMAP.md` — the phases and their proofs.
5. `docs/ARCHITECTURE.md` and `docs/decisions/` — how it is built, and why.

The doctrine and `docs/product/` are in French; everything else here is in English.

## Layout

```
src/features/     one folder per feature: domain · commands · queries · infrastructure · ui
src/routes/       TanStack Start pages (French URLs) and server routes
src/platform/     wiring: env, database, tenancy, adapters, service (manifest, health)
src/worker/       the worker role: inbound messages, deliveries, outbox
db/migrations/    each table created with its RLS policy
messages/         fr.json, en.json — no hard-coded strings
document/         the Typst template, fonts and reference cases
vendor/kete/      @kete/* tarballs from kete-core (kete-core decision 0005)
```

## Branches

```
main       production — the human gesture only
dev        integration — green CI required before merging
NNN-slug   one Spec Kit feature, branched from dev
```

## Forbidden to agents

- Pushing to `main` or `dev` directly, or bypassing a branch protection.
- Writing a vendor name in a domain or application layer.
- Creating a table without its RLS policy in the same migration.
- Writing a secret in a file, a message or a commit; logging a price or a message body.
- Hard-coding a user-visible string.
- Suggesting, correcting or inventing a price in any code path.

## Tooling

- Node 22 · pnpm 11 · TypeScript strict · Typst 0.15 (PDF)
- Spec Kit `v0.16.0`, run through `uvx`, never from a global install (`speckit-*` skills).
- `@kete/*` update: in kete-core, `pnpm packages:pack` (writes `vendor/kete/` here), then
  `pnpm install`.
