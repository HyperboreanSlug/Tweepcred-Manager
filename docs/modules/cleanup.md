# Module: `cleanup`

**Source:** `src/modules/cleanup.js`  
**Exports (IIFE scope):** `Cleanup`

## Purpose

Delete tweets, likes, and DMs from a Twitter data export or via GraphQL slow-delete (no profile scrolling). Ported from TweetXer (Luca Hammer et al.).

## Public API

| Member | Description |
|--------|-------------|
| `Cleanup.render()` | Dropzone + options UI |
| File parsers + GraphQL delete paths (internal) | Export-driven cleanup |
| Slow-delete path (internal) | GraphQL list + `DeleteTweet` (`SlowGql`) |

## Dependencies

- `Core` (auth, resolveQueryId, snowflake, store)
- `UI`

## Rate limits

Auto-pause default **190 actions / 15 min**. Honors `x-rate-limit-*` headers and backs off on 429.

## Maintenance notes

- Slow-delete lists via `SlowGql` (`UserTweets` / `UserTweetsAndReplies`) then deletes with `Cleanup.deleteTweets()` (`DeleteTweet`). Do not scroll the profile or click the caret menu.
- GraphQL operation ids rotate; listing and deletion use `Core.resolveQueryId` plus fallbacks.
- `TweetResultByRestId` for live like counts (file-based + optional live likes) may need query-id refresh (see README).
- Age filter uses `Core.snowflakeToDate`. Unknown ids are spared. Likes come from the list payload unless "Fetch live like counts" is on.
- Pause / Stop apply to slow-delete and file-based delete. Remaining `tIds` persist on the slow session. Stop clears the session.
- Delete speed slider is live via `pace()`. Stored as `clean.speedLevel`.
- **Posts** vs **Replies** are separate GraphQL filters, not profile tabs. A refresh auto-resumes unless paused.
