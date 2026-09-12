# Module: `cleanup`

**Source:** `src/modules/cleanup.js`  
**Exports (IIFE scope):** `Cleanup`

## Purpose

Delete tweets, likes, and DMs from a Twitter data export or via slow profile UI. Ported from TweetXer (Luca Hammer et al.).

## Public API

| Member | Description |
|--------|-------------|
| `Cleanup.render()` | Dropzone + options UI |
| File parsers + GraphQL delete paths (internal) | Export-driven cleanup |
| Slow-delete path (internal) | Profile UI deletions |

## Dependencies

- `Core` (auth, resolveQueryId, snowflake, store)
- `UI`

## Rate limits

Auto-pause default **190 actions / 15 min**. Honors `x-rate-limit-*` headers and backs off on 429.

## Maintenance notes

- Slow-delete must **never** `window.scrollTo(0, document.body.scrollHeight)` and must **never** `.remove()` tweet cells. X's virtualizer blanks the page if cells are ripped out or the scroller jumps into spacer space; wheel/trackpad still loads because it moves a little and leaves cells mounted. Use `scrollTimelineMore()` (real overflow scroller, last-tweet `scrollIntoView`, ~30% viewport step, synthetic `wheel`) and `skipTweet()` for spared / not-mine rows. `hideTimelineSuggestions()` may strip UserCell rows only.
- GraphQL operation ids rotate; deletion uses resolve + fallbacks.
- `TweetResultByRestId` for live like counts may need manual query-id refresh (see README).
- Slow delete honors the spare-recent-N-days filter via `tweetDate()` (DOM `<time>` tag, snowflake permalink fallback). Unknown dates are spared, never deleted.
- Blank / empty cells: 6 nudges (Retry + Posts tab + small scroll), then `forceReload` with `autoResume`. Four consecutive reloads with zero deletes this lifetime => treat the list as done. Reloads are spaced ≥45s.
- Stuck top post: Escape + nudge at 8, skip at 16, reload at 22. Repeated UI errors (8) reload instead of asking for Resume. Outer crashes reload and continue.
- Pause / Stop (`#tpm-clean-pause`, `#tpm-clean-stop`) apply to slow-delete and file-based delete. Pause persists on the slow session (`userPaused`) and blocks auto-reload. Stop clears the session and does not resume.
- Resume never needs scrolling: deleted tweets are gone from X, so the top of the profile timeline is the resume point. Starting/resuming off the profile page auto-navigates there.
