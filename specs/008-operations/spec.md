# Feature Specification: Operations and Kete

**Feature Branch**: `008-operations`
**Created**: 2026-09-29
**Status**: Implemented
**Input**: Roadmap phase 6 — "Kete operators run Firmo; Kete Cockpit sees it live."

## User Scenarios & Testing

### User Story 1 — Kete Cockpit sees Firmo live (P1)

1. **Given** an issued document, **Then** a `document.issued` event is written in the same
   transaction — its type and whether it is a correction, never a price, a client or a number —
   and the relay delivers it, signed, to the Cockpit.
2. **Given** a share link created, **Then** a `document.shared` event follows the same way.
3. **Given** a conversation turn that called the model, **Then** an `ai.usage` event carries its
   calls and tokens — counters only.
4. **Given** the manifest (`/.well-known/kete`), **Then** it declares exactly these three types.

### User Story 2 — Only Kete operators enter (P1)

1. **Given** a Compte Kete client, **When** he opens `/operations`, **Then** he is refused.
2. **Given** a member of Kete's organization without a second factor, or not owner or admin,
   **Then** he is refused, and told why.

### User Story 3 — The operator sees what failed (P1)

1. **Given** messages that failed after their attempts, **Then** the operator sees when, on which
   channel, the error code, the attempts and the organization — the sender masked, never a body
   (erased once settled, decision 0001; so no replay: the person was told to try again).

### User Story 4 — An exceptional reading, journaled (P1)

1. **Given** an organization and an issued document's number, **When** the operator gives a
   reason, **Then** he reads its PDF, and the reading is journaled — who, when, which document,
   why — in the same transaction; without a reason, nothing is read.
2. **Given** the journal, **Then** the operator sees the latest readings.

## Requirements

- **FR-001**: Manifest events `document.issued`, `document.shared`, `ai.usage`; recorded with
  `@kete/sdk`'s emitter in the business transaction; the relay runs in the worker when
  `KETE_RECEIVER_URL`, `KETE_KEY_ID` and `KETE_KEY_SECRET` are set.
- **FR-002**: `KETE_OPERATORS_ORGANIZATION_ID`; an operator is its owner or admin with a second
  factor — the Cockpit's rule (kete-core spec 008).
- **FR-003**: Migration 0009: `operator_journal` (RLS: the application role only inserts; reading
  through a definer function), `operator_incidents` (definer, failed messages only, sender masked).
- **FR-004**: Screens `/operations` (incidents, reading, journal), French and English, 375 px.

## Not now

- Configuration at runtime (offered documents, quota, AI limits, durations): constants until a
  measured need.
- Reading a conversation: its messages are erased once handled; the draft is in the document.
- A Compte Kete payment confirmed in the chat by Firmo itself: it needs the Compte Kete to deliver
  its events to Firmo; until then, the confirmation is seen in the space and at the next message.

## Success Criteria

- **SC-001**: `tests/operations.test.ts` proves the events in their transaction, their delivery
  signed to a receiver, the operator rule, the masked incidents and the journaled reading; the
  e2e proves a client is kept out and an operator reads with a reason.
