# Feature Specification: A guided conversation

**Feature Branch**: `012-guided-chat`
**Created**: 2026-09-30
**Status**: Implemented (lots 1, 2 and 3)
**Input**: The author's test on staging (percentages without their amounts, no buttons) and the
conversation he validated: « Continue ». Reusing past prices and automatic reminders wait for
his ok.

## User Scenarios & Testing

### Lot 1 — Check at a glance, tap instead of typing (P1)

1. **Given** a complete draft, **Then** the summary shows each line's amount, the items subtotal,
   each adjustment with what it is taken on and its amount, the total excluding tax, the tax
   amount and the total including tax.
2. **Given** a complete draft whose issuer is known, **Then** buttons offer « Voir l'aperçu »,
   « Document final », « Modifier »; a pressed button runs at once, without the model.
3. **Given** an issued document, **Then** Firmo reminds him to forward the PDF to his client
   himself, and offers « En facture » (for a quote or a proforma) and « Nouveau devis ».
4. **Given** « annule », **Then** the draft goes back to its version before the last change.
5. **Given** a message, **Then** « en train d'écrire » shows while Firmo works.
6. **Given** a first message with nothing to price, **Then** Firmo presents itself with an example.

### Lot 2 — Being paid (P1)

1. **Given** his first invoice, **Then** Firmo asks once how his clients pay him (a mobile money
   number) and prints it on his invoices.

### Lot 3 — Firmo remembers for him (P2)

1. **Given** a known client, **Then** its phone and address come back from his client book.
2. **Given** « mes derniers documents », **Then** a list opens; a chosen document comes back as
   its PDF.

## Requirements

- **FR-001**: The summary from the documents feature's calculation (`totalsOf`), every level.
- **FR-002**: Button ids handled by the code (`press`); the channels' reply buttons (WhatsApp:
  three, twenty characters) and Telegram's inline keyboard.
- **FR-003**: Migration 0010: `previous_draft`; the model's action `undo_last_change`.
- **FR-004**: The channels' typing: WhatsApp's typing indicator, Telegram's chat action.
- **FR-005**: Firmo never writes to his client: he forwards the PDF himself.

## Success Criteria

- **SC-001**: `tests/conversation.test.ts` (levels, buttons, issuance from buttons without the
  model, undo, welcome, typing) and `tests/channels.test.ts` pass.
- **SC-002**: `pnpm eval:conversation`: the author's percentages, « sur tout », « annule » and
  the buttons pass with the real model.
