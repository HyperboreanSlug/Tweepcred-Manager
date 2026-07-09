# Module: `unfollow`

**Source:** `src/modules/unfollow.js`  
**Exports (IIFE scope):** `Unfollow`

## Purpose

Mass-unfollow non-followers from the Following page to repair follower/following ratio. Ported from Shayan Taherkhani’s mass-unfollow engine, with audit, whitelist, keyword search filter, and continuous batch mode.

## Public API

| Member | Description |
|--------|-------------|
| `Unfollow.render()` / `onShow()` | UI |
| `Unfollow.checkLocation()` | Warn if not on a follow list |
| Start / pause / stop / audit handlers (internal) | Batch unfollow loop |

## Dependencies

- `Follow` (DOM)
- `Core` (sleep, store, userPostedTerm, rate-friendly delays)
- `UI`

## Rate limits

Default batch **≤ 190**, inter-action delay **3–35 s**, continuous mode cooldown **15–20 min**. Do not raise batch above 190 without updating docs and warnings.

## Maintenance notes

- Keep mutual/private/whitelist skips intact — they are the main safety valves.
- Keyword filter issues one SearchTimeline request per account; treat as rate-budget heavy.
