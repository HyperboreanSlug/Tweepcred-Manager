# Module: `csvparse`

**Source:** `src/modules/csvparse.js`  
**Exports (IIFE scope):** `CSVP`

## Purpose

Header-aware CSV parsing for the Block list tab's fast lane. When an uploaded
file has a header row that names recognized columns, the Block list tool can
read every field it needs (user ids, flags, follower counts) from the file
itself and go **straight to blocking** — no live API lookups.

## Recognized columns

| Field            | Accepted header names                                             |
|------------------|-------------------------------------------------------------------|
| User id          | `user_id`, `accountid`, `account_id`, `userid`, `user-id`, `id_str` |
| Handle           | `handle`, `username`, `screen_name`, `screenname`, `@handle`       |
| Name             | `name`                                                            |
| Private flag     | `private`, `is_private`, `protected`, `is_protected`              |
| Followers        | `followers`, `followers_count`, `follower_count`                  |
| Pre-checked flag | `matches_all_filters`, `matches`, `flagged`, `match`              |

Values `1` or `true` set flags; empty cells stay `null`. The export produced
by the Block list tab (`tpm-blocklist.csv`) round-trips through `CSVP.parse`,
so a checked list can be re-uploaded later and blocked without re-checking.

## Behavior

- `parse(text)` returns `{ header, entries }` only when the first row names
  a recognized user-id or handle column; otherwise it returns `null` and the
  caller falls back to the single-column parser.
- Proper quoted-field CSV is handled (`"Alice, the first"` stays one cell);
  doubled quotes inside fields are unescaped.
- Entries are deduped by id or handle; ids must be 5+ digits, handles must
  match `[a-z0-9_]{1,15}` with at least one letter.

## Dependencies

None (self-contained).