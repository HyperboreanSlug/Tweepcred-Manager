# Module: `blocklist`

**Source:** `src/modules/blocklist.js`  
**Exports (IIFE scope):** `Blocklist`

## Purpose

Load a list of accounts and block them. The list source is a CSV, a plain
handle list, or your X data archive's `follower.js` / `following.js` files.
A CSV that carries `user_id` (or `matches_all_filters`) goes **straight to
blocking — no live checks**. Other lists are looked up once to detect a
private / locked profile. Private-only is the default filter.

## Inputs

- CSV with a header: columns `handle`, `user_id` / `account_id`,
  `private`, `followers`, `matches_all_filters` are recognized. Rows with a
  numeric id are ready to block immediately; rows with `matches_all_filters=1`
  bypass the filters (the file already did the checking).
- CSV without a header: the first column holds `@handle` or a numeric id.
- Plain text: one handle (or id) per line.
- Archive: `data/follower.js` or `data/following.js` — entries expose
  `accountId` only, so they are resolved via `UserByRestId`.

## Flow

CSV with header:

1. Parse columns (`CSVP`), build rows from the file itself — **no API calls**.
2. Score rows locally: `private` / `followers` columns against the shared
   filter settings; `csv_prechecked` rows are always ready.
3. Rows without a user id are skipped (the block API requires numeric ids).
4. Preview, confirm, block via `POST /i/api/1.1/blocks/create.json`.

Other lists:

1. Parse the file into `{handle}` / `{id}` entries (deduped).
2. Live lookup per account (`UserByScreenName` for handles,
   `UserByRestId` for ids) to read the locked flag.
3. Apply the same classifier as the Anti-bot scan (private / min followers /
   default avatar / bot-like handle / empty bio / recent join) — the filter
   checkboxes and their settings are shared via the `ab.*` storage keys, so
   tuning one tab tunes both.
4. Preview: resolved account, status, followers, matching criteria.
5. Confirm, then block.

An account matches only if it matches every selected filter; nothing selected
=> nothing flagged. Unknown profiles (lookup failed) are never blocked.

## Rate limits

- Blocks share X's ~200 actions / 15 min window.
- Auto-pause defaults to 190 / 15 min, same as Cleanup.
- Lookups also count against GraphQL limits (~1 account / sec).
- `429` waits out `x-rate-limit-reset`; `Stop` is honored mid-wait.

## Safety

- Unknown profiles (lookup failed) are never blocked.
- The same filter set as the **Anti-bot** scan applies; private/locked alone is
  the default. The full list is blocked only if all filters are turned off.
- Nothing blocks until the explicit confirm checkbox + Start click.

## Dependencies

- `CSVP` (header-aware CSV column parse)
- `Core` (auth headers, `fetchUserByScreenName`, `fetchUserByRestId`)
- `UI`, `Followers._download` (CSV export)