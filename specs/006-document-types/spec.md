# Feature Specification: Three document types

**Feature Branch**: `006-document-types`
**Created**: 2026-09-29
**Status**: Implemented
**Input**: "On garde les 3 et fais-les proprement" — a quote, a proforma and an invoice, each for
what it is.

## User Scenarios & Testing

### User Story 1 — Each document says what it is (P1)

1. **Given** a quote, **Then** it prints its validity, the requested deposit and "bon pour accord".
2. **Given** a proforma, **Then** it prints its validity, the requested deposit, "bon pour
   commande" and that it has no accounting value.
3. **Given** an invoice, **Then** it prints neither validity nor requested deposit, but the
   payments, the balance and "pour acquit"; without tax, its total reads "net à payer".

### User Story 2 — Each document lives its own life (P1)

1. **Given** an issued quote, **Then** it can be accepted, refused, left without an answer, or
   cancelled; one left without an answer can still be accepted or refused.
2. **Given** an issued proforma, **Then** it can be ordered, refused or cancelled.
3. **Given** an issued invoice, **Then** it can only be cancelled: never accepted, never revised —
   a correction is a cancellation and a new invoice.
4. **Given** a refused or cancelled document, **Then** it is never converted; conversion goes
   forward only (quote → proforma or invoice, proforma → invoice).
5. **Given** a quote or proforma past its validity without an answer, **Then** it shows as expired.

### User Story 3 — The chat defaults to a quote (P2)

1. **Given** a new priced request, **Then** the draft is a quote unless the person says proforma
   or invoice; an issued quote becomes a proforma or an invoice by conversion.

## Requirements

- **FR-001**: `domain/lifecycle.ts` is the single rule (answers, conversion, revision, validity);
  the use cases, the console menu and the labels read it.
- **FR-002**: Migration 0007 holds the same answers per type in the database trigger.
- **FR-003**: `domain/presentation.ts` prints per type; the validity date is computed, never stored.
- **FR-004**: Catalogs French and English for the new states and answers.

## Success Criteria

- **SC-001**: `document-types.test.ts` (unit) and the "three types" block of
  `tests/documents.test.ts` (integration) pass.
