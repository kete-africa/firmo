# Feature Specification: Plans and quota

**Feature Branch**: `007-plans`
**Created**: 2026-09-29
**Status**: Implemented
**Input**: Roadmap phase 5 — "Firmo is paid through the Compte Kete, and never gives more than what
was bought."

## User Scenarios & Testing

### User Story 1 — Three documents offered (P1)

1. **Given** a new organization, **Then** it issues three final documents without paying; drafts,
   previews and corrections (`/R2`) never count.
2. **Given** the three used and no active offer, **When** he confirms an issuance, **Then** it is
   refused, the code sends the way to subscribe, and the proposal stays pending.

### User Story 2 — The Firmo offer (P1)

1. **Given** an active Firmo access in the Compte Kete, **Then** he issues thirty documents per
   rolling thirty days; the offered documents are never counted in that period.
2. **Given** the thirty issued in the period, **Then** the next issuance is refused.
3. **Given** the Compte Kete not answering beyond the offered documents, **Then** issuance is
   refused ("fails closed"), and he is told to try again.

### User Story 3 — The last document (P1)

1. **Given** one document left, **When** two issuances race for it, **Then** exactly one succeeds.

### User Story 4 — Where he stands (P2)

1. **Given** his space, **Then** "Abonnement" shows the offered documents left, or the offer's end
   and the documents left in the period, and opens the Compte Kete's subscriptions.
2. **Given** the chat, **Then** `open_space` with `subscription` sends a one-time link to it.

### User Story 5 — What the model cost (P2)

1. **Given** a conversation turn, **Then** its model calls and tokens are recorded, with the
   document it worked on — counts only, never a message.

## Requirements

- **FR-001**: `src/features/plans`: the rule (`domain.ts`), the gate the documents ask at each first
  issuance, the standing for the space; the port `SubscriptionDirectory`.
- **FR-002**: The documents lock the organization's issuances (`pg_advisory_xact_lock`) and count
  first issuances under the lock; the gate's verdict `plan_required`, `quota_reached` or
  `plans_unavailable` refuses the issuance.
- **FR-003**: The Compte Kete adapter reads `GET /api/apps/access` (kete-core spec 014) with the
  app's `client_credentials` token.
- **FR-004**: Migration 0008: `ai_usage` (RLS in the creating migration), the first-issuances
  index.
- **FR-005**: Catalogs French and English: the space page and the chat's refusals.

## Success Criteria

- **SC-001**: `tests/plans.test.ts`, `tests/account.test.ts`, `src/features/plans/__tests__`, the
  plans block of `tests/conversation.test.ts` and the subscription e2e pass.

## Later

- A payment confirmed in the Compte Kete reaches Firmo, which confirms it in the chat by itself
  (phase 6, with the account events).
