# Module: `antibot`

**Source:** `src/modules/antibot.js`  
**Exports (IIFE scope):** `Antibot`

## Purpose

Flag and block bot-like followers. Scans the Followers page, reads locked status from the list's lock icons (no API), runs API lookups **only for locked accounts**, classifies them against user filters, previews and exports the results, and blocks only after an explicit confirm.

## Filters (AND — an account is shown only if it matches EVERY selected filter)

- Private / locked profile
- Follower count below a configurable minimum
- Default profile picture (`default_profile_image` from the API)
- Random / bot-like @handle — `handleSignals()`: default `user<digits>` names, long digit runs, mostly-digit handles, word + random digits, vowel-less letter runs

Matching is recomputed live from the current checkboxes by `matches()`, so the table always reflects the selected filters.

## Flow

1. `scan()` — requires the Followers page; reuses `Followers.collectListHandles` to walk the virtualized list, saves the full list as a follower-tracker snapshot (`source: 'antibot'`), then filters to DOM-detected **locked** accounts and runs one `Core.fetchUserByScreenName` per locked account only (~0.9–1.3s apart). Non-locked followers cost zero API calls. The enriched rows are persisted to `localStorage` (`antibotScan:<username>`).
2. `loadPrevious()` — restores the last saved scan and re-applies the current filters with no API calls, so filter combinations can be explored instantly.
3. `renderResults()` — preview table of accounts matching all selected filters (private flag, follower count, default pic, reasons) + CSV/JSON export of all looked-up rows.
4. `blockAll()` — confirm-gated; POSTs `1.1/blocks/create.json` per matching account with 429 reset-wait, capped by the Stop button.

## Dependencies

- `Core` (fetchUserByScreenName, apiHeaders, store)
- `Followers` (collectListHandles, setNow, stopFlag, _download)
- `UI`

## Maintenance notes

- Rate limits: a 429 during enrichment waits out `x-rate-limit-reset` (visible countdown in the status line), then resumes from the same account index — the scan never loses its place. The Stop button is honored even mid-wait. Failed lookups are counted and reported in the final status.
- List collection is patient: when X throttles the followers list, the walk clicks Retry and waits (6s × up to 6 rounds) instead of stopping at the first pause.
- Locked detection is DOM-based (`Follow.isPrivate` on the list cells); if X changes the lock icon markup, that heuristic is the place to fix.
- Blocking needs the numeric account id from the lookup; locked accounts whose lookup failed match filters but are not blockable (shown in the summary).
