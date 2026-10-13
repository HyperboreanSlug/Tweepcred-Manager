# Module: `slowgql`

**Source:** `src/modules/slowgql.js`  
**Exports (IIFE scope):** `SlowGql`

## Purpose

List the logged-in account's own tweets via GraphQL (`UserTweetsAndReplies`) so slow-delete does not scroll the profile virtualizer.

## Public API

| Member | Description |
|--------|-------------|
| `SlowGql.collect(tab, onPage)` | Paginate live tweets. `tab` is `posts` or `replies`. |
| `SlowGql.eligible(t, tab, skipDays, spareLikes)` | Age / likes / reply-vs-post filter. Unknown snowflake dates are spared. |

## Notes

- Both runs list `UserTweetsAndReplies`. The posts run keeps non-replies. The replies run keeps only `in_reply_to_status_id_str`.
- `UserTweets` stops after a short page run (empty page, same Bottom cursor) while older posts are still on `UserTweetsAndReplies`. Do not use `UserTweets` for this scan.
- The scan stops when the Bottom cursor is missing or repeats, or when five pages in a row add no new ids. The page cap is 4000. A page with no new own tweets does not end the scan by itself.
- Deletion itself is `Cleanup.deleteTweets()` (`DeleteTweet`). This module only builds `tIds`.
- Query ids rotate; `Core.resolveQueryId` plus fallbacks from a known-good night.
