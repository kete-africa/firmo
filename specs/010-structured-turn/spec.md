# Feature Specification: One structured turn per message

**Feature Branch**: `010-structured-turn`
**Created**: 2026-09-30
**Status**: Implemented
**Input**: The author's test on staging: « un tube annellé à 140000, chacun dans un groupe »
looped on the quantity and the price. « L'IA a la mémoire ; pourquoi parser ? Un tel système doit
être plus vite et simple. » Decision 0003.

## User Scenarios & Testing

### User Story 1 — Understood the first time (P1)

1. **Given** « Ajoute un tube annellé à 140000. J'aimerais que chacun soit dans un groupe »,
   **Then** the draft has two groups and the line 1 × 140 000, without any question.
2. **Given** numbers in words, answers spread over several messages, a correction or a removal,
   **Then** the draft follows, and the summary shows it.
3. **Given** a price not said, **Then** it stays « à préciser » next to the known quantity, and it
   is the one question asked.

### User Story 2 — Fast and simple (P1)

1. **Given** a message, **Then** the model is called once; its instructions and schema are the
   same on every call.

### User Story 3 — Each person's own memory (P1)

1. **Given** two senders at once, **Then** each model call reads only its sender's exchanges.
2. **Given** an issued or a new document, **Then** the exchanges start afresh; a sign-in link is
   never kept in memory.

### User Story 4 — Nothing final without her (P1)

1. **Given** the model deciding to issue with no proposal, **Then** nothing is issued.
2. **Given** a draft changed after its preview, **Then** the proposal is void.

## Requirements

- **FR-001**: `turn.ts`: the output schema (Zod, strict JSON schema for the model's API), the
  model's draft as the working draft, the problems sent back once.
- **FR-002**: The model port `decide` replaces `runTurn` and its tools.
- **FR-003**: `application.ts`: state, actions with their rules, summary, memory of 10 exchanges.
- **FR-004**: Removed: the tools that edited the draft, ids, evidence and number re-reading, the
  reply guard.

## Success Criteria

- **SC-001**: `tests/conversation.test.ts` and `turn.test.ts` pass.
- **SC-002**: `pnpm eval:conversation`: the four fixed conversations and the four simulated
  dialogues pass with the real model.
