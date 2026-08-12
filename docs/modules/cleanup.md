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

- GraphQL operation ids rotate; deletion uses resolve + fallbacks.
- `TweetResultByRestId` for live like counts may need manual query-id refresh (see README).
- Slow delete honors the spare-recent-N-days filter via `tweetDate()` (DOM `<time>` tag, snowflake permalink fallback). Unknown dates are spared, never deleted.
- Slow delete has a stuck watchdog: same top post for 20 passes => one recovery (Escape + scroll), then a clean stop with guidance. Guards against silent delete refusals and wrong-page runs.
- When X stops loading the timeline (rate limit or an out-of-memory wedge), slow delete waits in 5-minute rounds. After 60 minutes of dead timeline it reloads the page (session persisted in localStorage) and auto-resumes on the profile page. Only after two consecutive reload lifetimes with zero deletions does it conclude the list is exhausted.
- Resume never needs scrolling: deleted tweets are gone from X, so the top of the profile timeline is the resume point. Starting/resuming off the profile page auto-navigates there.
