# 0001 — Inbound messages wait in a table, reached only through definer functions

- **Status**: accepted
- **Date**: 2026-09-29
- **Applies to**: phase 3 (conversation), `db/migrations/0004_conversation.sql`

## Decision

A webhook verifies the channel's signature, stores each message in `inbound_messages` —
unique per channel and provider message id — and answers at once. A worker claims pending
messages (`FOR UPDATE SKIP LOCKED`, with a lease), resolves the sender, processes, and settles
them. The worker runs inside the web process for now; several instances are safe.

The table has row-level security with **no policy for the application role**: a message arrives
before its organization is known, and its body is the tradesman's. The application role reaches
it only through definer functions (`inbound_enqueue`, `inbound_claim`, `inbound_settle`), which
never list bodies across organizations.

## Why not pg-boss

The doctrine's reference stack names pg-boss for jobs. Here the need is narrower and sharper:
exactly-once per provider message id, a body that must stay invisible to other organizations,
and a claim that survives a crash. A table with three definer functions says exactly that, in
one migration, without a second schema and its privileges. pg-boss comes with the first job that
is not an inbound message (reminders, daily summaries).

## What would reverse it

Scheduled or recurring jobs, or a worker that must run apart from the web process.
