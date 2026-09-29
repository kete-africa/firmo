# Feature Specification: Staging

**Feature Branch**: `009-staging`
**Created**: 2026-09-29
**Status**: Running — the author's gestures pending
**Input**: Roadmap phase 7 — "Firmo runs on staging, with its real channels."

## User Scenarios & Testing

1. **Given** `dev` merged and migrated, **When** `firmo-staging` is deployed, **Then** `/health`
   says `healthy` and `/.well-known/kete` says `staging` with its three events. _Done._
2. **Given** kete-core's `staging:operator` run by the author, **Then** Firmo signs people in with
   the staging Compte Kete, provisions them by phone, and lets Kete operators into `/operations`.
3. **Given** Firmo registered in the staging Cockpit and its key set, **Then** its events arrive
   there, signed.
4. **Given** the author's decision to move the messaging channels, **Then** a message on Telegram
   or WhatsApp reaches Firmo staging and is answered.
5. **Given** the journeys above, **Then** the author validates the client, payment and messaging
   journeys before any production.

## Requirements

- **FR-001**: Coolify `firmo-staging` in project `Kete`, environment `staging`, branch `dev`,
  source `kete-coolify`; runtime-only secrets; `KETE_PACKAGES_TOKEN` as a Docker build secret.
- **FR-002**: `docs/OPERATIONS.md`: where it runs, its environment, how it deploys, the author's
  gestures.
- **FR-003**: kete-core `staging:operator` registers Firmo (`kete:people`) and sets its client
  (kete-core pull request 17).

## Success Criteria

- **SC-001** `[agent]`: scenario 1. _Met on 2026-09-29._
- **SC-002** `[human]`: scenarios 2 to 5.
