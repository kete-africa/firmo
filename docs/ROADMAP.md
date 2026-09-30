# Roadmap — Firmo

## Metadata

- **Status**: `candidate`
- **Last updated**: `2026-09-29`
- **Product boundary**: a tradesman's quotes, proformas and invoices, from a voice note, a photo or
  a text on WhatsApp or Telegram — his prices, our presentation.
- **Planning axis**: `DEPENDENCIES_AND_EVIDENCE_NOT_TIME`
- **Deployment policy**: `HUMAN_VALIDATION_BEFORE_DEPLOY`

## Goal

A tradesman sends his sale out loud tonight and gets a quote he accepts to send, without an
intermediary, without an account to create — and Kete sees Firmo live among its apps.

## Execution rules

- Phases are contiguous and close on their **proof**, never on a date.
- Each phase is one Spec Kit feature (`specs/NNN-slug`), branched from `dev`, merged on green CI.
- The reference version (`Jean-claude21/firmo`) is the oracle: a business rule it tested is ported
  with its test, or its absence is recorded in `docs/decisions/`.
- **Isolation is proven in every phase that touches people or data**: two organizations never see
  each other; two numbers on the same phone and browser never share a session; a reply goes only
  to the sender.
- `[agent]` is verified automatically; `[human]` waits for the author.

```mermaid
flowchart LR
  P0[0 · Foundation] --> P1[1 · The document]
  P1 --> P2[2 · Identity]
  K13[kete-core 013<br/>Compte Kete by phone] --> P2
  P2 --> P3[3 · Conversation]
  P3 --> P4[4 · Client space]
  P4 --> P5[5 · Plans and quota]
  P5 --> P6[6 · Operations and Kete]
  P6 --> P7[7 · Staging]
```

---

## Phase 0 — Foundation · `specs/001-foundation` · _closed on the CI of pull request #1_

### Objective

A repository an agent can work in safely, and an app that describes itself.

### Scope

- Constitution, context, Spec Kit, product decisions carried over (`docs/product/`).
- TypeScript strict, lint, formatting, catalogs check, CI; `@kete/*` from GitHub Packages (kete-core 0005).
- Neon project `kete-firmo` (`main`, `dev`, `test`), owner and application roles, Neon Object
  Storage bucket per branch.
- The app: TanStack Start on `@kete/design`, French and English, `/health`, `/.well-known/kete`;
  one image with two roles (web, worker), Typst inside.

### Proof

- `[agent]` CI runs lint, types, formatting, catalogs, tests and the image's health on every pull
  request to `dev`.

---

## Phase 1 — The document · `specs/002-documents` · _delivered_

### Objective

Firmo composes an exact, immutable, professional document from structured lines.

### Scope

- The model: organization profile (header, logo, colour, defaults), clients, clauses, usual items
  (memory, never suggestion), documents (quote, proforma, invoice), sections, lines, ordered
  adjustments (labour, transport, discount, tax), payments on invoices.
- Exact decimal calculations, numbering per type (series, annual or continuous, manual number,
  revisions `/R2`), issuance that burns the number and freezes totals, header and clauses;
  conversion quote → proforma → invoice without retyping; revisions linked to their root.
- The PDF through a rendering port (Typst adapter, the reference template and fonts).
- Every table with its RLS policy in its creating migration.

### Proof

- `[agent]` The reference's calculation, numbering, snapshot and lineage tests pass, ported.
- `[agent]` The nine reference cases render to PDF with the expected totals.
- `[agent]` Two organizations: neither lists, reads nor issues the other's documents (404).

---

## Phase 2 — Identity · `specs/003-identity` · _delivered_

### Dependencies

kete-core 013 (the Compte Kete by phone number, doctrine D-024).

### Objective

Each person who writes to Firmo is one Compte Kete person, one organization, one session.

### Scope

- A messaging identity (channel, sender) resolves to a Compte Kete person by phone number and to
  her organization; created in silence on the first message (WhatsApp: the sender's number;
  Telegram: the contact she shares once, checked against the sender).
- The web: one-time sign-in link requested for that person → Compte Kete → single sign-on into
  Firmo; a link always replaces the previous session; the session is an HTTP-only cookie.
- Number lost or changed: the e-mail added in Mon espace Kete, or a traced operator gesture.

### Proof

- `[agent]` Two numbers on the same browser: opening B's link after A's shows B, never A.
- `[agent]` A Telegram contact that is not the sender's own is refused.

---

## Phase 3 — Conversation · `specs/004-conversation` · _delivered; one human proof pending_

### Objective

A voice note, a photo or a text becomes a reading, then a draft, then an issued PDF — in the chat.

### Scope

- A messaging port with WhatsApp and Telegram adapters (verified webhooks), a durable inbox and a
  worker; replies only to the sender; WhatsApp's 24-hour window respected (templates outside it).
- An AI port with an OpenAI adapter: transcription, reading of a photo, and one agent turn per
  message acting through guarded tools (decision 0002); the reading is shown before composing;
  nothing invented, prices never touched.
- The first-document question (the name it leaves under); preview, issuance, PDF sent in the
  chat; usual items remembered; commands (open my space, subscribe, help).
- The reference's conversation journeys and evaluation sets, run against a fake model in CI and
  against the real one on demand. A new field bench of real dictations comes later.

### Proof

- `[agent]` The reference journeys pass; two senders in parallel never see each other's drafts.
- `[human]` The author completes a real quote on Telegram.

---

## Phase 4 — Client space · `specs/005-client-space` · _delivered_

### Objective

The tradesman makes the document his, from his phone.

### Scope

- Home, documents, the draft editor, presentation (header, logo, colour, clauses, numbering),
  purpose-built at 375 px from the validated reference screens, French and English.
- A share link per document for his client: the PDF, read-only, revocable; its opening is counted
  (Firmo's usage indicator), without IP or fingerprint.
- Said at first use: voice notes and photos are never kept — only what was heard or read (phase 3
  already erases message bodies once handled).

### Proof

- `[agent]` End to end at 375 px, in both languages; a share link opens one document, never a
  list, and stops after revocation.

---

## Phase 4.1 — Three document types · `specs/006-document-types` · _delivered_

### Objective

A quote, a proforma and an invoice are three documents with three purposes — never one document
under three titles.

### Scope

- Each type prints what it is for: a quote proposes (validity, deposit, "bon pour accord"); a
  proforma announces the invoice for the client's procedures (validity, deposit, no accounting
  value, "bon pour commande"); an invoice claims payment (no validity nor requested deposit,
  payments and balance, "pour acquit").
- Each type lives its own life (`domain/lifecycle.ts`, migration 0007): a quote is accepted,
  refused or left unanswered; a proforma is ordered or refused; an invoice is paid or cancelled,
  never accepted nor revised. Conversion goes forward only.
- The console and the chat say it: expired, ordered, to pay, paid; a quote by default in the chat.

### Proof

- `[agent]` Lifecycle and printing per type (unit); refusals held by the code and the database
  (integration).

---

## Phase 4.2 — One structured turn per message · `specs/010-structured-turn` · _delivered_

### Objective

Firmo understands the first time, answers fast, and keeps each person's conversation apart.

### Scope

- One model call per message with one structured output (draft, reply, action); the code keeps
  the state, runs the actions with their rules and writes every amount (decision 0003, which
  supersedes 0002: no more tools editing the draft, ids or re-reading of numbers).
- Memory per sender: the last 10 exchanges as she saw them, afresh with each document.

### Proof

- `[agent]` Scripted journeys, memory and isolation (`tests/conversation.test.ts`).
- `[agent]` The author's staging conversation and three others, word for word, with the real
  model (`pnpm eval:conversation`).

---

## Phase 4.3 — A guided conversation · `specs/011-guided-chat` · _delivered_

### Objective

He checks at a glance, taps instead of typing, and Firmo remembers for him.

### Scope

- Every level of the total in the conversation and on the PDF (template v5); what each
  percentage is taken on.
- Buttons at the three moments (a complete draft, the preview, an issued document), run without
  the model; « annule »; « en train d'écrire »; a first example.
- He forwards the PDF to his client himself; Firmo never writes to his client.
- How his clients pay him, asked once, printed on his invoices; his client book from his own
  documents; his latest documents as a list.
- Waiting for the author's ok: reusing his past prices, automatic reminders.

### Proof

- `[agent]` `tests/conversation.test.ts`, `tests/channels.test.ts`, `tests/presentation.test.ts`.
- `[agent]` The validated simulation, with the real model: `author-percentages`,
  `invoice-asks-payment`, `remembers`, `undo`, `buttons-when-complete`.

---

## Phase 5 — Plans and quota · `specs/007-plans` · _delivered_

### Objective

Firmo is paid through the Compte Kete, and never gives more than what was bought.

### Scope

- Three final documents offered; then the Firmo offer of the Compte Kete (Chariow through the
  payment port, in the Compte Kete): thirty documents per rolling thirty days while it is active,
  counted and consumed under the organization's issuance lock; drafts, previews and corrections
  consume nothing (`src/features/plans/README.md`).
- The Compte Kete says only until when the Firmo access runs (kete-core spec 014); beyond the
  offered documents, without its answer, issuance fails closed.
- "Abonnement" in the space and in the chat (a one-time link) opens where he stands and the way
  to the Compte Kete's subscriptions; a refused issuance stays proposed — once subscribed, "oui"
  issues it.
- The AI cost of each turn and of the document it worked on, measured (`ai_usage`); reported to
  the operators and the Cockpit in phase 6.

### Proof

- `[agent]` With a fake Compte Kete: offered documents, subscription, quota, refusal beyond it,
  failure closed (`tests/plans.test.ts`); the adapter against its contract (`tests/account.test.ts`).
- `[agent]` Two issuances racing for the last document: exactly one succeeds.
- `[agent]` The chat sends the way to subscribe and keeps the proposal; the model's cost is
  counted per turn and document (`tests/conversation.test.ts`); the space at 375 px (e2e).

---

## Phase 6 — Operations and Kete · `specs/008-operations` · _delivered_

### Objective

Kete operators run Firmo; Kete Cockpit sees it live.

### Scope

- The operator space `/operations` (Kete's owners and admins with a second factor — the Cockpit's
  rule): failed messages, sender masked, never a body; an exceptional reading of an issued
  document with a reason, journaled in the transaction that finds it; the journal
  (`src/features/operations/README.md`).
- Firmo's manifest events through the outbox — `document.issued`, `document.shared`, `ai.usage` —
  facts and counters only, never a price, a client or a number; the relay runs in the worker once
  Firmo is registered in Kete Cockpit.
- Left out, and why (`specs/008-operations`): replaying a failed message (its body is erased,
  decision 0001), reading a conversation (same), configuration at runtime (constants until a
  measured need), a Compte Kete payment confirmed in the chat by Firmo itself (it needs the
  Compte Kete to deliver its events to Firmo — see "Later").

### Proof

- `[agent]` A Compte Kete client is kept out of the operator space; every reading is journaled
  (`tests/operations.test.ts`, e2e).
- `[agent]` An issued document arrives at a receiver as a signed event, once
  (`tests/operations.test.ts`, with `@kete/sdk`'s receiver).
- `[human]` Firmo registered in the staging Cockpit, its events seen there (phase 7).

---

## Phase 7 — Staging · `specs/009-staging` · _running; the author's gestures pending_

### Objective

Firmo runs on staging, with its real channels.

### Scope

- Coolify application `firmo-staging` (web and worker in one process), Neon `dev` migrated,
  storage, secrets at runtime only and the packages token as a build secret; `docs/OPERATIONS.md`.
- The Compte Kete client (`kete:people`) and the operators' organization, set by kete-core's
  `staging:operator` in the same gesture as the Cockpit's.
- The Cockpit registration, the Firmo offer, and the Telegram and WhatsApp webhooks: the author's
  gestures, listed in `docs/OPERATIONS.md` — the messaging channels still serve the previous
  Firmo, and moving them is the author's call.

### Proof

- `[agent]` `/health` healthy and `/.well-known/kete` says `staging`; the Cockpit reads it.
- `[human]` The author validates the client, payment and messaging journeys before any
  production.

---

## Later, when a real need appears

A field bench of real dictations (transcription measured on real workshops) · several numbers for
one business (the son who helps) · automatic library of works · activity certificates and tender
files · accounting export · recharges between periods · a Compte Kete payment confirmed in the
chat by Firmo itself (the Compte Kete delivering its events to Firmo) · configuration of the plans
and limits at runtime.
