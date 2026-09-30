# 0002 — The conversation is a bounded agent with guarded tools

- **Status**: superseded by 0003 (2026-09-30); accepted before (by the author, 2026-09-29: « oui … l'idée de la refonte est aussi de faire
  mieux partout »)
- **Date**: 2026-09-29
- **Applies to**: `src/features/conversation`

## Decision

The reference routed each message through a list of intents, then answered mostly with fixed
sentences; corrections named lines by position; a voice note cost up to three model calls. Firmo
now runs **one model turn per message** in which the model acts only through **tools** — each a
use case with its guard — and writes a short reply:

- every number comes with words of the person's last message that **contain** it (the reference
  only checked that the words were in the message);
- elements of the draft are named by **stable ids**, never positions;
- the **code writes every amount** the person reads, and the reply may not state one it did not
  compute;
- issuance needs a proposal **and** the person's yes (or the button) — the model cannot issue alone.

## Why

It follows how people write (several requests in one message, informal words), costs fewer calls,
and is the doctrine's shape for every Kete app: capabilities exposed to an agent, guarded by the
same rules as the screens.

## What it costs

Tests need a scripted model for the code's part, and a live evaluation with the real model
(`pnpm eval:conversation`) for the model's part — judged by the code on the final state.
