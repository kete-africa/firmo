# Feature Specification: Client space

**Feature Branch**: `005-client-space`
**Created**: 2026-09-29
**Status**: Implemented
**Input**: Roadmap phase 4 — "The tradesman makes the document his, from his phone."

## User Scenarios & Testing

### User Story 1 — Find and finish a document (P1)

1. **Given** his documents, **Then** he sees the draft to continue and the recent ones, at 375 px,
   in French or English.
2. **Given** a draft, **When** he corrects a price, **Then** the total follows (the server's), and
   he issues it after seeing the preview; its number is final.

### User Story 2 — His client opens one document (P1)

1. **Given** an issued document, **When** he shares it, **Then** the link opens that PDF only,
   read-only; its openings are counted without address or fingerprint; a new link or a removal
   ends the previous one; a draft cannot be shared.

### User Story 3 — His presentation, seen for real (P1)

1. **Given** his identity, colour, logo, clauses and numbering, **Then** his next documents carry
   them, and he sees them on the real rendering of a first page.
2. **Given** a disguised file as a logo, **Then** it is refused.

### User Story 4 — Nothing crosses (P1)

1. **Given** another organization's document, **Then** it is not found — page and PDF.
2. **Given** no session, **Then** he is sent to sign in.

## Requirements

- **FR-001**: Screens from the validated references; catalogs French and English.
- **FR-002**: Migration 0005: `document_shares` (RLS) and `open_document_share` (definer).
- **FR-003**: Clauses on by default, numbering validated by the domain, logo made safe, a PNG
  preview from the Typst adapter.
- **FR-004**: Said at first use in the chat: voice notes and photos are never kept.

## Success Criteria

- **SC-001**: `e2e/space.spec.ts` passes at 375 px in both languages; `tests/presentation.test.ts`
  proves clauses, numbering, logo, preview and share links.
