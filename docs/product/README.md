# Firmo's product decisions

These files come unchanged from the reference version of Firmo (`Jean-claude21/firmo`, 2026-08).
They are written in French and hold the business rules this rewrite keeps: the anchor object, the
sections, labour as an adjustment, the reading shown before composing, voice first, immutability
at issuance, the anti-scope.

| File | Holds |
|---|---|
| `decisions.md` | the product decisions and the anti-scope |
| `model.md` | the domain model, rights, isolation and lifecycle |
| `referentiels.md` | the trade vocabulary |
| `contenus.md`, `voix.md` | what Firmo says, and how |
| `strategie.md`, `identite.md` | who it is for, the name and the register |

## What the Kete doctrine changes

| In these files | Now |
|---|---|
| Supabase (Postgres, Storage), `service_role` confined to storage | Neon Postgres and Neon Object Storage (D-023) |
| The messaging identity is the account, created in silence | Still created in silence — as a **Compte Kete by phone number** (D-024) |
| Signed web links, one hour, owned by Firmo | One-time sign-in links to the Compte Kete, then single sign-on |
| Firmo's own offers, subscriptions and Chariow checkout | The Compte Kete's subscriptions and payment port (D-013, D-019); Firmo keeps its quota rule |
| A 17-screen administration reached through a Telegram link | Kete Cockpit for offers, subscriptions and figures; Firmo keeps incidents, traced reading, audit and configuration, for Kete operators signed in with two factors |
| Python, FastAPI | TypeScript (D-016) |

Where a rule here and the doctrine disagree, the doctrine wins.
