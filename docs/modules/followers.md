# Module: `followers`

**Source:** `src/modules/followers.js`  
**Exports (IIFE scope):** `Followers`

## Purpose

1. **Follower tracker** — snapshot the Followers list into `localStorage`, diff later for gains/losses.  
2. **Following sort** — read the Following list with the same POST endpoint as Followers, **sort by following count** (how many accounts *they* follow), export CSV/JSON. One page is about 50 accounts and already includes the counts. `UserByScreenName` runs only if that call fails.

## Public API

| Member | Description |
|--------|-------------|
| `Followers.render()` / `onShow()` | Tab UI |
| `Followers.snapshotFollowers()` | Collect followers (API-first) → history |
| `Followers.collectFollowersApi(opts)` | Cursor-paginated GraphQL `Followers` via `ListGql` (POST). About 50 accounts per page. Reads `core` / `privacy`, not only `legacy`. Null if unavailable. |
| `Followers.collectFollowersBest(opts)` | API first, DOM-walk fallback; returns `{ accounts, viaApi }` |
| `Followers.saveSnapshot(accounts, source)` | Shared snapshot writer (manual / antibot / import); quota-safe (handles-only fallback, trims oldest); returns save success |
| `Followers.exportSnapshotCsv()` / `importSnapshotCsv()` | Latest snapshot → CSV; CSV (first column = handle) → new snapshot |
| `Followers.diffSnapshots()` | Compare last two snapshots |
| `Followers.scanAndSortFollowing()` | List endpoint first, then DOM walk + `UserByScreenName` if that call fails |
| `Followers.sortRows()` | Sort in-memory rows |
| `Followers.exportCsv()` / `exportJson()` | Downloads |

## Storage keys

- `tpm:followersHistory:<username>` — array of snapshots (max 20)
- `tpm:followersSort`, `tpm:followersMax` — UI prefs

## Dependencies

- `Follow` (UserCell parsing)
- `Core.fetchUserByScreenName`, `Core.store`, `Core.sleep`
- `UI`

## Usage

1. **Snapshot:** open `x.com/<you>/followers` → **Snapshot followers**.  
2. Later, snapshot again → **Diff vs previous**.  
3. **Sort:** choose sort → **Scan & sort following**. The list endpoint does not need the Following page open. Open that page only when the status says the list endpoint is unavailable.

## Maintenance notes

- Snapshots persist in `localStorage` (last 20, keyed per username). Sources are tagged: `manual`, `antibot` (every anti-bot scan auto-saves one), `import` (CSV). Quota-safe: on storage pressure the writer drops oldest snapshots, then falls back to handles-only (still diffable) — a 100k-follower snapshot's full details exceed browser storage, handles fit.
- Virtualized lists: collection scrolls and re-queries cells; stagnant-scroll detection stops the walk. A single malformed cell is skipped (try/catch), and X's "Retry" button is clicked when the list stops growing so a throttled timeline can resume.
- The list endpoint returns about 50 accounts per request, with follower counts and following counts on each row. A higher `count` does not raise the page size.
- The slow path is ~1 `UserByScreenName` call per account with ~0.9–1.3 s delay. The max-account cap applies to both paths.
- Location column is informational only (self-reported profile field).
