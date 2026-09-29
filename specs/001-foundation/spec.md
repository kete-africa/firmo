# Feature Specification: Foundation

**Feature Branch**: `001-foundation`
**Created**: 2026-09-29
**Status**: Implemented
**Input**: Roadmap phase 0 — "A repository an agent can work in safely, and an app that describes
itself."

## User Scenarios & Testing

### User Story 1 — Kete sees that Firmo is alive (P1)

Kete Cockpit, or an operator, reads Firmo's health and self-description.

**Acceptance Scenarios**:

1. **Given** Firmo running with its database, **When** `/health` is read, **Then** it answers
   `healthy` with the database up and the outbox backlog.
2. **Given** Firmo running, **When** `/.well-known/kete` is read, **Then** it names the product
   `prd_firmo`, its version and its environment.

### User Story 2 — An agent works safely (P1)

**Acceptance Scenarios**:

1. **Given** a pull request to `dev`, **Then** CI runs lint, types, formatting, the catalogs check,
   migrations and tests on the Neon `test` branch, and builds an image that starts healthy.
2. **Given** the application role, **Then** it cannot bypass row-level security, and sees an
   organization only inside the transaction that set it.

## Requirements

- **FR-001**: TanStack Start app on `@kete/design`, French by default and English, no hard-coded
  visible string.
- **FR-002**: Neon `kete-firmo` (`main`, `dev`, `test`), `firmo_owner` and `firmo_app`
  (NOBYPASSRLS, created in SQL), a `files` bucket per branch.
- **FR-003**: `@kete/*` from GitHub Packages (`@kete-africa/*`, kete-core decision 0005).
- **FR-004**: The `@kete/sdk` outbox, created with its RLS policy.
- **FR-005**: One image with Typst inside, probing its own `/health`.

## Success Criteria

- **SC-001**: CI green on the first pull request to `dev`.
