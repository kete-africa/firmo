# Tasks: Operations and Kete

- [x] T001 Event ports in documents and conversation; the `@kete/sdk` adapter over a Drizzle
      transaction; the manifest declares `document.issued`, `document.shared`, `ai.usage`
- [x] T002 The relay in the worker, once Firmo is registered in the Cockpit
- [x] T003 Migration 0009: `operator_journal` (insert only for the application role),
      `operator_journal_recent`, `operator_incidents` (sender masked, never a body)
- [x] T004 `src/features/operations`: the operator rule, incidents, journal, the journaled reading
- [x] T005 `/operations` and `POST /api/operations/read`, French and English, 375 px
- [x] T006 Tests: events in their transaction and delivered signed; operator rule; incidents;
      reading and journal; the journal out of the application role's reach; e2e
