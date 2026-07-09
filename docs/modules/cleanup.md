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
