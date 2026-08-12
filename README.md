<h1 align="center">Tweepcred Manager</h1>

<p align="center">
  <strong>An all-in-one console script for managing your X.com "tweepcred" - X's internal reputation score.</strong><br>
  Estimate your score, repair your follower/following ratio, track followers, sort following by following-count, and clean up old low-engagement tweets — from <em>one</em> panel.
</p>

<p align="center">
  Console paste · Greasemonkey/Tampermonkey · No API keys · Local session only
</p>

<p align="center">
  <a href="https://raw.githubusercontent.com/HyperboreanSlug/Tweepcred-Manager/main/dist/tweepcred-manager.user.js"><strong>📥 Auto-install for Tampermonkey / Violentmonkey / Greasemonkey</strong></a><br>
  <sub>(click the link with a userscript manager installed — it offers to install automatically, and checks for updates)</sub>
</p>

---

> **Warning: Use at your own risk.** This script automates X's web interface, which is against X's Terms of Service and **can get your account locked or banned**. It runs entirely in your browser using your own logged-in session and nothing is sent anywhere. Use conservative settings and stop if X warns you.

## What is "tweepcred"?

**Tweepcred** is X/Twitter's internal **reputation score** (0-100). It comes from the company's own (partially open-sourced) ranking stack, where it is computed as a **PageRank over the follow graph** and then adjusted by signals such as:

- your **follower / following ratio**
- **account age**
- **profile completeness** (profile photo, bio, etc.)
- safety/abuse flags

Why it matters: accounts whose tweepcred falls **below ~65** have only a limited number of their tweets included in X's **search index**, so a low score quietly suppresses your reach.

## Rate limits - read this first

X enforces a hard limit of approximately **200 actions per 15 minutes** on the endpoints this script uses (unfollows, tweet deletions, like removals). Exceeding it triggers a `429 Too Many Requests` response; pushing further or repeatedly can escalate to a temporary account lock.

The script is built around this constraint:

| Tool | Default batch size | Default inter-action delay | Effective rate |
| --- | --- | --- | --- |
| **Unfollow** | 190 per batch | 3-35 s (random, human-like) | ~10-20 / min at defaults |
| **Followers (enrich)** | user cap (default 200) | ~0.9–1.3 s per profile lookup | read-only GraphQL |
| **Cleanup (export)** | 190 per auto-pause | no per-action delay (API-gated) | up to ~190 / 15 min |
| **Cleanup (slow delete)** | 190 per auto-pause | 1.2 s between UI actions | up to ~190 / 15 min |

Slow delete drives the browser UI but calls the same `DeleteTweet` endpoint underneath, so it is subject to the same 200/15min cap. The auto-pause applies to slow delete as well.

**Practical guidance:**

- **Do not raise the batch size above 190.** Even 195 over a 15-minute window can trip the limit depending on other activity on your account.
- **Do not lower the minimum delay below 3 seconds** for unfollows. X tracks inter-request timing as an automation signal, not just volume.
- **Continuous mode** inserts a **15-20 minute cooldown** between each batch of 190. This mirrors the rate-limit window and is the recommended way to do large cleanups over a single session.
- **Run one tool at a time.** Unfollowing and deleting tweets simultaneously doubles your request rate against shared limits.
- The auto-pause in Cleanup (default: 15 min after every 190 deletions) follows the same logic. Tune it down rather than up.
- If you see a *"you're doing that too much"* banner or a `429` in the console, **stop for the day**. Repeated 429s in a short window are what trigger locks.

## The tools, one panel

| Tab | What it does | The tweepcred lever it pulls |
| --- | --- | --- |
| **Dashboard** | Estimates your tweepcred from public signals and gives concrete recommendations. | Tells you what to fix first. |
| **Unfollow** | Mass-unfollows non-followers in batches of 190 or fewer with human-like delays. Skips mutuals, private accounts and a whitelist. | **Follower/following ratio** - the single biggest factor. |
| **Followers** | Snapshot your followers over time (diff gains/losses). Scan Following and **sort by each account's following count**. Export CSV/JSON. | Visibility into network quality / ratio planning. |
| **Cleanup** | Deletes Tweets / Likes / DMs from your data export (or slow-deletes from your profile), auto-pausing at 190 to respect the rate window. | **Engagement quality** - removes dead-weight tweets. |

Everything lives in one **draggable, minimizable, mobile-friendly** dark glass panel. Your settings (delays, whitelist, toggles, follower snapshots) are saved in your browser (`localStorage`).

## Project layout (modular)

| Path | Role |
| --- | --- |
| `src/modules/*.js` | One file per feature (`core`, `follow`, `ui`, `dashboard`, `unfollow`, `followers`, `cleanup`, `about`) |
| `docs/modules/*.md` | Per-module maintenance docs |
| `scripts/build.js` | Concatenates modules into a single dual-mode bundle |
| `dist/tweepcred-manager.user.js` | Built userscript (install **or** console-paste) |
| `tweepcredmanager.js` | Same build at repo root (back-compat) |

```bash
node scripts/build.js
```

Modules share one IIFE scope (not ES imports) so the **same artifact** works as:

1. **Console paste** on x.com  
2. **Persistent Greasemonkey / Tampermonkey / Violentmonkey** userscript (`@grant none`, `@run-at document-idle`)

## Quick start

### Console

1. Log into **[x.com](https://x.com)** in a desktop browser.
2. Open the developer console: **F12** (or **Cmd+Option+I** on macOS) then the **Console** tab.
   - If the browser blocks pasting, type `allow pasting` and press **Enter** first.
3. Paste the entire contents of [`dist/tweepcred-manager.user.js`](dist/tweepcred-manager.user.js) (or [`tweepcredmanager.js`](tweepcredmanager.js)) and press **Enter**.
4. The **Tweepcred Manager** panel appears in the top-right. Pick a tab and go.

### Greasemonkey / Tampermonkey (persistent — recommended for long jobs)

1. Install [Violentmonkey](https://violentmonkey.github.io/), [Tampermonkey](https://www.tampermonkey.net/), [Greasemonkey](https://www.greasespot.net/), or FireMonkey.
2. Click the **auto-install link** at the top of this page — your userscript manager will offer to install it, and will pick up future updates automatically (`@updateURL`). Alternatively create a new script and paste `dist/tweepcred-manager.user.js`.
3. Visit x.com while logged in — the panel loads automatically at `document-idle` on every page load.

Why this matters for long runs: the userscript re-injects on **every** page load. Slow-delete sessions are persisted in `localStorage`, and crash recoveries (out-of-memory reloads, dead-timeline reloads) reload the page and **resume automatically** — a console paste can't survive a reload, the userscript can.

Also works on mobile (Firefox + Tampermonkey on Android, Userscripts on iOS Safari).

## Using each tool

### Dashboard

Opens to a **tweepcred score** computed as an **exact reproduction of X's 2023 open-source maths** (`UserMass.scala` + `Reputation.scala`): the base device mass, the new-account deboost (only the first ~30 days matter), the verified/Premium override (mass = 100), the restricted penalty, and both follow-ratio penalties (the `>500` following with `>0.6` ratio rule, and the `>2500` following rule). The constants and operators are copied verbatim from the source; see `Dashboard.computeMass` in [the source](tweepcred-manager.js).

You can **look up any public handle** (or your own, auto-filled via the API), and it recalculates live as you edit. It then gives **actionable recommendations**, such as how many non-followers to unfollow to clear the ratio penalty, with a one-click jump to the Unfollow tool.

> The one stage that **cannot** run in a browser is the global PageRank over the follow graph that consumes this mass. So the number shown is the per-user **mass/prior** that seeds tweepcred, computed exactly, not the PageRank output. Third-party calculators that fold in engagement and posting consistency are using signals that live in X's *ranking* model, not the open-source mass formula, so they are deliberately excluded here.

### Followers

**Track followers**

1. Open **your profile → Followers**.
2. Click **Snapshot followers**. The script scrolls the virtualized list and stores handles in `localStorage`.
3. Later, snapshot again and click **Diff vs previous** for new vs lost followers.

**Sort Following by following count**

1. Open **your profile → Following**.
2. Choose sort (default: following count high → low).
3. Click **Scan & sort following**. Each visible account is enriched via `UserByScreenName` (followers, following, location).
4. Export **CSV** or **JSON** if needed.

This tab does **not** unfollow anyone. Cap enrichment with “Max accounts” to stay gentle on rate limits. See [`docs/modules/followers.md`](docs/modules/followers.md).

### Unfollow

Repairs your ratio by unfollowing accounts that don't follow you back.

1. Go to **your profile then Following** (URL ends in `/following`). The panel warns you if you're not on a follow list.
2. Keep batch size at **190** (the default). Adjust delays only upward from the defaults (3 s min, 35 s max).
3. Click **Start unfollowing**, or **Scan only (audit)** for a dry run that counts your mutuals / non-followers / private accounts without touching anything.

Features:

- **Skips mutuals** - people who follow you back are never unfollowed (toggle).
- **Skips private/locked accounts** (toggle).
- **Whitelist** - @handles to never unfollow, saved in your browser.
- **Posted-word filter (X search)** - for each followed account, runs an X search (`from:user "term"`) to check whether they have ever **posted** any of your terms, then either **protects** them (never unfollow) or **targets** them (only act on matches). Each term is matched as an exact phrase; one search request per account. Built for research groups studying the prevalence of hate speech and other content on the platform.
- **Scan for posted words (report only)** - a separate, read-only function that walks your follow list, searches each account's posts for the terms, and produces a downloadable list of positive hits (copy handles, CSV, or JSON). It never unfollows anyone - use it purely to measure and record who has posted the terms.
- **Continuous mode** - batches of 190 with a 15-20 min cooldown between each, matching the rate-limit window. The only recommended way to clear large lists.
- **Pause / Resume / Stop**, live stats, and a full session log in the console.

> **Heads-up:** continuous high-volume unfollowing is exactly the pattern X's automation detection watches for. The cooldowns lower the risk but don't eliminate it. **Stop for the day if you see a "you're doing that too much" warning.**

### Cleanup

Deletes the low-value content that pulls your engagement average down.

- **From your data export** (recommended): [request your data](https://x.com/settings/your_twitter_data/data), unzip it, then drag a file onto the dropzone. Reaches old tweets that no longer appear on your profile.
- **Slow delete without a file**: deletes straight from your profile UI (~4,000/hour). No export needed, but only reaches currently visible tweets.

Both modes auto-pause at 190 actions by default to match the rate window. **Do not disable auto-pause entirely.**

Filters and options:

| Option | What it does |
| --- | --- |
| **Skip oldest N** | Resume a previous run (empty = auto-detect already-deleted tweets). |
| **Spare > N likes** | Keep popular tweets (uses counts from `tweets.js`, or live lookups). |
| **Fetch live like counts** | Look up each tweet's current likes from X before deleting. One extra request per tweet, which counts toward your rate limit. |
| **Spare last N days** | Keep your most recent tweets. |
| **Auto-pause every N / N min** | Pause after N deletions for N minutes. Default is 190 / 15, which matches the rate-limit window. Tune down if you want to be more conservative. |
| **Export bookmarks** | Bookmarks aren't in the official export - grab them as JSON. Read-only, does not count toward delete limits. |

**Supported files:** `tweet-headers.js`, `tweets.js` (enables spare-by-likes), `like.js`, `direct-message-headers.js` / `direct-message-group-headers.js`.

## Ideas and roadmap

- **Engagement scanner** - use the export to auto-flag zero-engagement tweets as deletion candidates, so Cleanup targets dead weight without manual filtering.
- **Ratio target planner** - set a goal ratio in the Dashboard; it computes the exact unfollow count and passes it to the Unfollow tool.
- **Inactive / ghost-account finder** - within the Unfollow list, prioritize suspended, deactivated or long-dormant accounts.
- **Snapshot and track** - save Dashboard estimates over time to see your score trend.
- **Shared rate budget** - a single 200/15min counter across Unfollow + Cleanup so running both tools interleaved never inadvertently trips the limit.

## How it works

- **Unfollow** drives the real X web UI: it walks the virtualized follow list (re-querying the DOM each pass because X recycles off-screen rows), detects mutuals/private accounts via `data-testid` and aria-labels, and clicks the real unfollow + confirm buttons with random human-like delays.
- **Cleanup** calls X's own GraphQL/REST endpoints (`DeleteTweet`, `UnfavoriteTweet`, DM deletion, Bookmarks) with your session cookies, swapping in tweet IDs from your export to reach old tweets not visible on your profile. It reads `x-rate-limit-remaining` and `x-rate-limit-reset` response headers and backs off automatically on `429`.
- Both share one auth core (`ct0` CSRF cookie, bearer token, transaction id) and one tabbed panel.

## Known limitations

- Tweepcred estimates are heuristic. X does not expose the real number.
- X rotates GraphQL query IDs. If live like-lookups start returning `400`/`404`, copy the current `TweetResultByRestId` query id from the Network tab and update `tweetResultQueryId` in the source.
- Likes can only be removed for the most recent few hundred (an X-side limitation, unrelated to rate limits).
- Chrome can get sluggish past ~15k tweets; closing the console while Cleanup runs helps.

## Credits

- **Mass Unfollow engine** - [Shayan Taherkhani](https://shayantaherkhani.ir) ([@tah3rkhani](https://twitter.com/tah3rkhani)).
- **Cleanup engine (TweetXer)** - [Luca Hammer](https://www.buymeacoffee.com/lucahammer) and contributors (Luca, dbort, pReya, Micolithe, STrRedWolf).

See [CREDITS.md](CREDITS.md) for details.

## License

[MIT](LICENSE). The bundled engines retain their original authorship and credit.
