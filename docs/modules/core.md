# Module: `core`

**Source:** `src/modules/core.js`  
**Exports (IIFE scope):** `Core`

## Purpose

Shared state, session auth, GraphQL helpers, localStorage settings, and small utilities used by every other module.

## Public API

| Member | Description |
|--------|-------------|
| `Core.version` | Package version string |
| `Core.init()` | Read cookies, username, install GraphQL query-id sniffer |
| `Core.apiHeaders([contentType])` | Auth headers for X GraphQL/REST |
| `Core.resolveQueryId(operationName)` | Sniff or scrape query ids (they rotate) |
| `Core.fetchUserByScreenName(handle)` | Normalized public profile (followers, following, location, …) |
| `Core.userPostedTerm(screenName, terms)` | SearchTimeline check for posted phrases |
| `Core.store.get/set(key, val)` | Namespaced `localStorage` (`tpm:…`) |
| `Core.sleep`, `Core.rand`, `Core.parseCount`, `Core.escapeHtml`, `Core.waitForElem` | Utilities |
| `Core.snowflakeToDate(id)` | Snowflake → `Date` |

## Dependencies

- Browser cookies: `ct0`, `twid`
- Live X session (`credentials: 'include'`)
- Optional: page JS bundles for query-id discovery

## Maintenance notes

- When GraphQL ops start 404-ing, clear `Core._queryIds[op]` (already done on 404) and open a relevant X page so the sniffer can relearn ids.
- Keep the public web bearer token aligned with what the X web client ships.
- Do not add `GM_*` APIs here if dual console + userscript support must remain (`@grant none`).
