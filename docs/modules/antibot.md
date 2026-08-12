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
- Empty bio (only matches when bio data is available)
- Joined within the last N months (default 12; uses `created_at`)

Matching is recomputed live from the current checkboxes by `matches()`, so the table always reflects the selected filters.

## Flow

1. `scan()` — collects the follower list via `Followers.collectFollowersApi` (cursor-paginated GraphQL `Followers`, ~20/page): scales to 100k+ followers, works from any page, and each page already carries locked status, follower count, default-avatar flag and numeric id — no per-account lookups. If the API is unavailable it falls back to the DOM walk (`collectListHandles`, lock icon read from the list) plus one `Core.fetchUserByScreenName` per locked account. The full list is saved as a follower-tracker snapshot (`source: 'antibot'`); the enriched locked rows are persisted to `localStorage` (`antibotScan:<username>`).
2. `loadPrevious()` — restores the last saved scan and re-applies the current filters with no API calls, so filter combinations can be explored instantly.
3. `renderResults()` — preview table of accounts matching all selected filters (capped at 1000 rendered rows so huge match sets can't freeze the panel; block/CSV still use every match) + CSV/JSON export of all looked-up rows.
4. `blockAll()` — confirm-gated; POSTs `1.1/blocks/create.json` per matching account with 429 reset-wait, capped by the Stop button.

## Dependencies

- `Core` (fetchUserByScreenName, apiHeaders, store)
- `Followers` (collectListHandles, setNow, stopFlag, _download)
- `UI`

## Maintenance notes

- Scale: built for 100k+ followers. API pagination is the primary path (no DOM scroll, no per-account lookups); the `Followers` queryId is resolved at runtime via the sniffer/bundle scan. If X changes the Followers response shape, `collectFollowersApi` parsing is the place to fix; the DOM walk remains as fallback.
- Rate limits: 429s during collection or enrichment wait out `x-rate-limit-reset` (visible countdown), then resume in place. Stop is honored mid-wait.
- List collection (DOM fallback) is patient: when X throttles the list, the walk clicks Retry and waits (6s × up to 6 rounds) instead of stopping at the first pause.
- Locked detection on the fallback path is DOM-based (`Follow.isPrivate`); on the API path it comes from `legacy.protected`.
- Blocking needs the numeric account id; locked accounts without one match filters but are not blockable (shown in the summary).
