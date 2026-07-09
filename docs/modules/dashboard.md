# Module: `dashboard`

**Source:** `src/modules/dashboard.js`  
**Exports (IIFE scope):** `Dashboard`

## Purpose

Estimates the per-user **mass/prior** that seeds X’s 2023 open-source tweepcred pipeline (`UserMass` + `Reputation`), and suggests ratio repairs.

## Public API

| Member | Description |
|--------|-------------|
| `Dashboard.render()` | Build tab HTML + wire events |
| `Dashboard.onShow()` | Lazy render + autofill |
| `Dashboard.autofill()` | DOM + API fill of blank fields |
| `Dashboard.fetchProfileStats(handle, force)` | UserByScreenName lookup |
| `Dashboard.computeMass(inp)` | Exact open-source mass math |
| `Dashboard.calculate()` | Read form → score UI + recommendations |

## Dependencies

- `Core` (API, parseCount, resolveQueryId)
- `UI`

## Maintenance notes

- This is **not** full PageRank tweepcred — document that whenever UX copy changes.
- Verified checkbox is **legacy** verification only, matching 2023 source (not Premium blue).
