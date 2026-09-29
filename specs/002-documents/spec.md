# Feature Specification: The document

**Feature Branch**: `002-documents`
**Created**: 2026-09-29
**Status**: Implemented
**Input**: Roadmap phase 1 — "Firmo composes an exact, immutable, professional document from
structured lines." Business rules: `docs/product/model.md`, `docs/product/decisions.md`.

## User Scenarios & Testing

### User Story 1 — A quote he is proud to send (P1)

**Acceptance Scenarios**:

1. **Given** sections, lines, labour at 25 % and a 30 % deposit, **When** the draft is previewed,
   **Then** the PDF shows the exact totals (reference case 03: 655 000 F CFA) marked as a draft.
2. **Given** the preview he saw, **When** he confirms it, **Then** the quote is issued with the
   next number of its series (`DEV-2026-001`), and its PDF is kept.
3. **Given** a draft changed after the preview, **When** the old confirmation arrives, **Then**
   nothing is issued.

### User Story 2 — What was sent stays as it was sent (P1)

1. **Given** an issued quote, **Then** neither the code nor the database accept a change to it; a
   correction is a revision `DEV-2026-001/R2`.
2. **Given** an issued quote, **When** it is converted, **Then** an invoice draft carries the same
   content, and gets its own series (`FAC-2026-001`).
3. **Given** an issued invoice, **Then** payments are recorded up to the balance due, never beyond.

### User Story 3 — Nothing invented, nothing shared (P1)

1. **Given** a line whose price Firmo could not read, **Then** the draft cannot be issued.
2. **Given** two organizations, **Then** neither lists, reads, changes nor issues the other's
   documents (not found), and their series are independent.

## Requirements

- **FR-001**: Tables with RLS in their creating migration (`db/migrations/0002_documents.sql`).
- **FR-002**: Pure domain ported from the reference, with its tests: money, calculations,
  numbering, snapshots.
- **FR-003**: A rendering port and its Typst adapter, the reference template bundle checked against
  its manifest; the same input renders the same bytes.
- **FR-004**: Issued PDFs kept in object storage; the organization's usual items remembered at
  issuance (memory, never suggestion).

## Success Criteria

- **SC-001**: The ten reference cases converge and render.
- **SC-002**: Isolation and immutability proven on the Neon `test` branch as the application role.
