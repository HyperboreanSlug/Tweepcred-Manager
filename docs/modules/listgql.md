# Module: `listgql`

**Source:** `src/modules/listgql.js`  
**Exports (IIFE scope):** `ListGql`

## Purpose

Paginate the logged-in account's Followers list (and the same shape for Following) with GraphQL. No DOM scroll.

## Why POST

`GET /i/api/graphql/{id}/Followers` returns HTTP 404. The web client sends a POST body: `variables`, `features`, `fieldToggles`, `queryId`.

The server returns about 50 accounts per page. A higher `count` does not increase the page size.

## User shape

List rows no longer include `legacy.screen_name`. Read:

- `core.screen_name`, `core.name`, `core.created_at`
- `privacy.protected`
- `profile_bio.description`
- `avatar.image_url`
- `relationship_counts` when present

`legacy` is still read when X sends it.

## Public API

| Member | Description |
|--------|-------------|
| `ListGql.collect(op, queryId, userId, opts, shouldStop)` | Cursor-paginate. `op` is `Followers` or `Following`. Returns account objects, or null if page 1 fails. |
| `ListGql.mapUser(result)` | One user result → `{ handle, name, private, followers, following, ... }`. |

`Followers.collectFollowersApi` calls `ListGql.collect`.
