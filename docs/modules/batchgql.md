# Module: `batchgql`

**Source:** `src/modules/batchgql.js`  
**Exports (IIFE scope):** `BatchGql`

## Purpose

Look up many accounts by numeric id in one call. `Blocklist` uses this when a list has user ids and no header that already has the private flag.

## Why POST, 100 ids

`POST /i/api/graphql/{id}/UsersByRestIds` with `variables.userIds` accepts 100 ids. The response is `data.users[].result` in the nested profile shape (`core`, `privacy`, `relationship_counts`, `profile_bio`, `avatar`). `Core.mapProfile` maps each result.

This call shares the list GraphQL bucket (about 187 requests / 15 min). It does not share the `UserByScreenName` bucket.

## Public API

| Member | Description |
|--------|-------------|
| `BatchGql.collect(ids, opts, shouldStop)` | Returns a `Map` of id → profile, or null if the first request cannot start. `opts.onProgress(done, total)` and `opts.onWait(seconds)` are optional. |
| `BatchGql.lookupEntries(entries, hooks)` | Ids go through `collect`. Handles with no id use `UserByScreenName`. Returns a `Map` of entry → profile or null. Unchecked entries are absent. |

A 429 waits for `x-rate-limit-reset`. A 404 clears the query id, resolves it once, and retries that batch.

## Dependencies

- `Core.resolveQueryId`, `Core.apiHeaders`, `Core.mapProfile`, `Core.sleep`
