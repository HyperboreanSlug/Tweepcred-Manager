# Module: `slowgql`

**Source:** `src/modules/slowgql.js`  
**Exports (IIFE scope):** `SlowGql`

## Purpose

List the logged-in account's own tweets via GraphQL (`UserTweets` / `UserTweetsAndReplies`) so slow-delete does not scroll the profile virtualizer.

## Public API

| Member | Description |
|--------|-------------|
| `SlowGql.collect(tab, onPage)` | Paginate live tweets. `tab` is `posts` or `replies`. |
| `SlowGql.eligible(t, tab, skipDays, spareLikes)` | Age / likes / reply-vs-post filter. Unknown snowflake dates are spared. |

## Notes

- Posts run uses `UserTweets` and keeps non-replies. Replies run uses `UserTweetsAndReplies` and keeps only `in_reply_to_status_id_str`.
- Deletion itself is `Cleanup.deleteTweets()` (`DeleteTweet`). This module only builds `tIds`.
- Query ids rotate; `Core.resolveQueryId` plus fallbacks from a known-good night.
