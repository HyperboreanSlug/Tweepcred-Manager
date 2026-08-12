# Module: `antibot`

**Source:** `src/modules/antibot.js`  
**Exports (IIFE scope):** `Antibot`

## Purpose

Flag and block bot-like followers. Scans the Followers page, reads locked status from the list's lock icons (no API), runs API lookups **only for locked accounts**, classifies them against user filters, previews and exports the results, and blocks only after an explicit confirm.

## Filters (any enabled filter flags the account)

- Private / locked profile
- Follower count below a configurable minimum
- Default profile picture (`default_profile_image` from the API)
- Random / bot-like @handle — `handleSignals()`: default `user<digits>` names, long digit runs, mostly-digit handles, word + random digits, vowel-less letter runs

## Flow

1. `scan()` — requires the Followers page; reuses `Followers.collectListHandles` to walk the virtualized list, saves the full list as a follower-tracker snapshot (`source: 'antibot'`), then filters to DOM-detected **locked** accounts and runs one `Core.fetchUserByScreenName` per locked account only (~0.9–1.3s apart). Non-locked followers cost zero API calls.
2. `renderResults()` — flagged-only preview table (private flag, follower count, default pic, reasons) + CSV/JSON export of all rows.
3. `blockAll()` — confirm-gated; POSTs `1.1/blocks/create.json` per flagged account with 429 reset-wait, capped by the Stop button.

## Dependencies

- `Core` (fetchUserByScreenName, apiHeaders, store)
- `Followers` (collectListHandles, setNow, stopFlag, _download)
- `UI`

## Maintenance notes

- Rate limits: a 429 during enrichment waits out `x-rate-limit-reset` (visible countdown in the status line), then resumes from the same account index — the scan never loses its place. Failed lookups are counted and reported in the final status.
- Locked detection is DOM-based (`Follow.isPrivate` on the list cells); if X changes the lock icon markup, that heuristic is the place to fix.
- Blocking needs the numeric account id from the lookup; locked accounts whose lookup failed are flagged but not blockable (shown in the summary).
- The private flag in exports comes from the list DOM heuristic OR the API `protected` field (API wins when available).
