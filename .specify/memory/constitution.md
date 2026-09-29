# Firmo — Constitution

> Derived from the Kete doctrine (repository `kete-africa/kete`: `docs/PRINCIPES.md`,
> `docs/CONCEPTION.md`, `docs/ARCHITECTURE_APP.md`, `docs/DECISIONS.md` — D-023 and D-024 above
> all) and from Firmo's own product decisions (`docs/product/`). It governs the Spec Kit cycle
> (specify → clarify → plan → tasks → analyze → implement → converge). Every agent complies with
> it. Delivery principles win over technical elegance.

## Core Principles

### I. The price is his, the presentation is ours — NON-NEGOTIABLE

Firmo never suggests, corrects, rounds or invents a price, a quantity or a margin. It only shapes
language, structure, alignment and layout. What Firmo read is shown back **before** a document is
composed, and nothing is ever sent to the tradesman's client without his having seen and
validated it.

### II. Value before configuration

The first message produces value. No sign-up, no password, no form: the messaging identity is
the account (D-024). The only question before a first document is the name it leaves under;
everything else is pulled by desire afterwards.

### III. One person, one session, one organization — NON-NEGOTIABLE

The organization is the hard boundary; every business table carries `organization_id` and is
created **with its RLS policy in the same migration**. The application connects with a role that
cannot bypass RLS. The organization is always derived from a verified proof (a messaging sender,
a Compte Kete session), never read from a request body or a URL. A reply goes only to the sender
of the message it answers. Opening a link always replaces the previous web session. A document of
another organization is **not found** (404), never forbidden.

### IV. Issued means immutable

A number is burnt only at issuance, per document type. An issued document — its totals, header
and clauses — never changes; a correction is a new, linked revision. Totals are computed while a
document is a draft and frozen at issuance, with exact decimal arithmetic.

### V. Generic first, no vendor in the core

Business code talks to **ports**: messaging, AI, storage, payments, events. WhatsApp, Telegram,
OpenAI, Neon, Chariow and Typst live only in adapters. No vendor name in a domain or application
layer (doctrine D-014).

### VI. Kete does what Kete does

Identity, organizations, subscriptions and payments belong to the Compte Kete; the view across
apps belongs to Kete Cockpit (D-013, D-019). Firmo keeps only what is Firmo's: documents, the
conversation, its quota rule and its business operator gestures.

### VII. Simple and working, proven

Ship the simplest version that really helps a tradesman send his quote tonight. A phase is done
only when its written proof is obtained. No invented figure, testimonial or claim.

## Additional Constraints

- **TypeScript strict** (D-016): TanStack Start, Zod, Drizzle with Postgres (Neon), pg-boss,
  Tailwind 4 with `@kete/design`, Paraglide, Vitest and Playwright, ESLint and Prettier.
- **Language** (D-020): code and technical documentation in English; screens and chat messages in
  French, and in English through catalogs; no user-visible string hard-coded.
- **Features are vertical slices** (D-015) with a single public entry point (`index.ts`).
- **The tradesman's prices are the most sensitive data of the system**: never in analytics, logs
  or events; an operator reads them only exceptionally, with a reason, and the read is journaled.
- **No secret in the repository**, a message or a log. `.env.example` documents every variable.
- **Documentation with diagrams, in the same pull request** (D-017).

## Development Workflow

- **Branches** (D-018): `main` (production, human-only), `dev` (integration, green CI required),
  `NNN-slug` (one Spec Kit feature, from `dev`).
- **Neon branches** follow Git: `main`, `dev`, `test` for CI. Migrations are versioned, applied
  with the owner role, and additive.
- **Before each task**, the five questions: the one thing to ship; the simplest version that
  really helps; for the user or for us; what would we keep if we shipped in three hours; will the
  person waiting be helped by what ships today.

## Governance

This constitution supersedes habits. An amendment is a pull request that states what changes and
why, and updates the dependent templates. Firmo's product decisions (`docs/product/`) are the
source for business rules; where they conflict with the Kete doctrine, the doctrine wins and the
conflict is recorded in `docs/decisions/`.

**Version**: 1.0.0 | **Ratified**: 2026-09-29 | **Last Amended**: 2026-09-29
