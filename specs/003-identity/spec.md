# Feature Specification: Identity

**Feature Branch**: `003-identity`
**Created**: 2026-09-29
**Status**: Implemented
**Input**: Roadmap phase 2 — "Each person who writes to Firmo is one Compte Kete person, one
organization, one session." Depends on kete-core spec 013 (doctrine D-024).

## User Scenarios & Testing

### User Story 1 — The first message is enough (P1)

1. **Given** a WhatsApp number never seen, **When** its first message arrives, **Then** a Compte
   Kete person and organization are created in silence, and the next messages find them.
2. **Given** a Telegram user, **Then** Firmo asks once for her number; a contact that is not her own
   is refused.
3. **Given** two numbers, **Then** they are two organizations that never see each other.

### User Story 2 — The space opens as the right person (P1)

1. **Given** a one-time link for B opened in a browser where A was signed in, **Then** B is signed
   in, never A — even if B abandons the sign-in halfway, A's session is gone.
2. **Given** a forged or replayed callback, **Then** nobody is signed in.
3. **Given** a requested path outside Firmo, **Then** the link lands on `/espace`.

## Requirements

- **FR-001**: `messaging_identities` with RLS, resolved only through `find_messaging_identity`.
- **FR-002**: An account port and its Compte Kete adapter (`client_credentials`, `kete:people`).
- **FR-003**: Single sign-on with the Compte Kete (`@kete/auth`), cookie `firmo_session`;
  `/auth/connexion` drops the previous session.
- **FR-004**: `/espace` for the signed-in member; `/lien-expire` for a spent link.

## Success Criteria

- **SC-001**: Tests prove one-time provisioning, Telegram's contact rule, isolation, and that two
  numbers on the same browser never share a session.
