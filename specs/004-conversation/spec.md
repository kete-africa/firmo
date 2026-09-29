# Feature Specification: Conversation

**Feature Branch**: `004-conversation`
**Created**: 2026-09-29
**Status**: Implemented
**Input**: Roadmap phase 3 — "A voice note, a photo or a text becomes a reading, then a draft,
then an issued PDF — in the chat." Improved over the reference (decision 0002).

## User Scenarios & Testing

### User Story 1 — A sale said becomes a quote he sends tonight (P1)

1. **Given** a voice note, a photo or a text with a sale, **Then** Firmo shows what it read —
   lines, quantities, prices and the code's total — before composing anything.
2. **Given** a correction in natural words ("la tôle c'est 35 000"), **Then** the draft and its
   total change.
3. **Given** a first document, **Then** the only question before its preview is the name it
   leaves under.
4. **Given** a complete draft, **When** he asks for it, **Then** he gets the exact preview and a
   question with buttons; **When** he says yes, **Then** the PDF is issued with its number.

### User Story 2 — Nothing invented, nothing crossed (P1)

1. **Given** a price not said in the message, **Then** it never enters the draft.
2. **Given** a model reply stating an amount the code did not compute, **Then** it is replaced.
3. **Given** no "yes", **Then** nothing is issued.
4. **Given** two senders at once, **Then** each gets only his replies and keeps his own draft.
5. **Given** a Telegram user, **Then** Firmo asks once for her own number.

### User Story 3 — Reliable delivery (P1)

1. **Given** a channel retrying a webhook, **Then** the message is handled once.
2. **Given** a failure, **Then** it is retried; after the last attempt the sender is told her
   draft is kept. Bodies are erased once handled.

## Requirements

- **FR-001**: Channel port; WhatsApp (Meta signature) and Telegram (secret token, private chats)
  adapters; webhooks store and answer at once.
- **FR-002**: Inbox table with definer functions only (decision 0001); in-process worker.
- **FR-003**: Model port; OpenAI adapter (transcription, photo reading, tool loop, `store: false`).
- **FR-004**: Tools and guards (decision 0002); code-written summaries; reply guard.
- **FR-005**: Chat copy from the catalogs, French and English.

## Success Criteria

- **SC-001**: Journeys and guards pass with a scripted model; the channels only accept what they
  can prove; the inbox handles once, in order, and erases.
- **SC-002**: The reference's four dialogues pass with the real model (`pnpm eval:conversation`).
- **SC-003** _(human)_: the author completes a real quote on Telegram (phase 7).
