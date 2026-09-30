# 0003 — One structured turn per message; the code keeps the state and runs the actions

- **Status**: accepted (by the author, 2026-09-30: « continue », after asking why the code
  parses what the model already understands)
- **Date**: 2026-09-30
- **Applies to**: `src/features/conversation`
- **Supersedes**: 0002

## What went wrong

Decision 0002 had the model edit the draft through small tools (`add_to_draft`, `change_draft`
on ids `L3`, `S2`), and the code **re-read every number**: a number entered only if the model
quoted words of the **last** message that contained it **in digits**, and one refused number
refused the whole call. On staging, « un tube annellé à 140000 » looped: « un » is not a digit,
so the line was refused with its price; the answer « 1 » could not carry the price back, the
answer « 140 000 » could not carry the quantity. The code was a second, weaker reader of numbers
the model had understood — and it protected little: a price on the wrong line has a valid quote.

## Decision

One model call per message. The model reads the sender's own conversation and answers with **one
structured output** — enforced by the model's API, validated with Zod:

- `draft`: the whole draft as it now understands it (null when nothing changed);
- `reply`: its words to the person, without any amount;
- `action`: at most one — preview, propose or confirm or cancel the issuance, send a PDF,
  convert, open a page of the space;
- `issuer_name`, `new_document`, `document_number`.

The code checks what a schema cannot say (a line priced two ways, a percentage above 100) and
sends it back to the model once. It keeps the state, runs the action with its rules — an issuance
only after a proposal and a yes, the exact previewed draft, the plans — computes every amount and
writes the summary the person reads.

What the person sees before anything is final — the code's summary, the preview, the question
with its buttons — is the guard against a misunderstanding. Nothing is issued without her yes.

## Memory

Kept by Firmo, never at the model's provider (`store: false`): one conversation per sender and
channel, in her organization. The model reads the last 10 exchanges — what she wrote, and what
Firmo actually sent her (the summary included; links masked, PDFs by their caption) — then the
state the code holds (issuer name, proposal pending, recent documents, the draft, what is
missing) with her new message. An issued document or a new one starts the exchanges afresh: a
past document's prices never reach the next one.

## Cost

One call per message instead of up to five; the instructions and the schema are the same on
every call and cached by the API. Measured on the fixed scenarios: 1 500 to 1 800 input tokens
and one call per message.

## What would reverse it

A model that no longer keeps a structured output faithful to the conversation, measured by
`pnpm eval:conversation` — then the fix is in the instructions or the model, not in re-reading.
