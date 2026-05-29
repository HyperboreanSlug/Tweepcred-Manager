<h1 align="center">🧭 Tweepcred Manager</h1>

<p align="center">
  <strong>An all-in-one console script for managing your X.com "tweepcred" — X's internal reputation score.</strong><br>
  Estimate your score, repair your follower/following ratio, and clean up old low-engagement tweets — from <em>one</em> panel.
</p>

<p align="center">
  No extension · No API keys · Runs locally in your browser
</p>

---

> ⚠️ **Use at your own risk.** This script automates X's web interface, which is against X's Terms of Service and **can get your account locked or banned**. It runs entirely in your browser using your own logged-in session — nothing is sent anywhere. Use conservative settings and stop if X warns you.

## What is "tweepcred"?

**Tweepcred** is X/Twitter's internal **reputation score** (0–100). It comes from the company's own (partially open-sourced) ranking stack, where it is computed as a **PageRank over the follow graph** and then adjusted by signals such as:

- your **follower / following ratio**,
- **account age**,
- **profile completeness** (profile photo, bio, etc.),
- and safety/abuse flags.

Why it matters: accounts whose tweepcred falls **below ~65** have only a limited number of their tweets included in X's **search index** — so a low score quietly suppresses your reach.

This project unifies two well-known community tools into one panel, organized around the three levers you can actually pull to improve that score.

## The three tools, one panel

| Tab | What it does | The tweepcred lever it pulls |
| --- | --- | --- |
| **📊 Dashboard** | Estimates your tweepcred from public signals and gives concrete recommendations. | Tells you what to fix first. |
| **👥 Unfollow** | Mass-unfollows people who don't follow you back. Skips mutuals, private accounts and a whitelist. One-shot or continuous. | **Follower/following ratio** — the single biggest factor. |
| **🧹 Cleanup** | Deletes Tweets / Likes / DMs from your data export (or slow-deletes from your profile), with spare-by-likes and spare-recent filters. | **Engagement quality** — removes dead-weight tweets that drag down your average. |

Everything lives in one **draggable, minimizable, mobile-friendly** dark glass panel that matches X's look. Your settings (delays, whitelist, toggles) are saved in your browser.

## Quick start

1. Log into **[x.com](https://x.com)** in a desktop browser.
2. Open the developer console: **F12** (or **Cmd+Option+I** on macOS) → **Console** tab.
   - If the browser blocks pasting, type `allow pasting` and press **Enter** first.
3. Paste the entire contents of [`tweepcred-manager.js`](tweepcred-manager.js) and press **Enter**.
4. The **Tweepcred Manager** panel appears in the top-right. Pick a tab and go.

> 💡 You can also run it as a **userscript** with [Violentmonkey](https://violentmonkey.github.io/), [Tampermonkey](https://www.tampermonkey.net/) or FireMonkey — it includes a userscript header. This also works on mobile (Firefox + Tampermonkey on Android, Userscripts on iOS Safari).

## Using each tool

### 📊 Dashboard

Opens to an **estimated tweepcred score** with a factor-by-factor breakdown. It auto-fills your followers, following, account age, profile photo and bio from the page when it can; correct anything that's off and it recalculates live.

It then gives **actionable recommendations**, e.g. *"Unfollowing about 1,240 non-followers would bring you to roughly 1:1"* — with a one-click jump to the Unfollow tool.

> The real tweepcred value is internal to X and not exposed, so this is a **transparent heuristic estimate**, not the actual number. The scoring weights are documented in [the source](tweepcred-manager.js) (`Dashboard.calculate`).

### 👥 Unfollow

Repairs your ratio by unfollowing accounts that don't follow you back.

1. Go to **your profile → Following** (URL ends in `/following`). The panel warns you if you're not on a follow list.
2. Adjust **batch size** and **delays** if you like (defaults are safe: 190 per batch, 3–35 s between actions).
3. Click **Start unfollowing**, or **Scan only (audit)** for a dry run that just counts your mutuals / non-followers / private accounts.

Features:

- ✅ **Skips mutuals** — people who follow you back are never unfollowed.
- 🔒 **Skips private/locked accounts** (toggle).
- ⭐ **Whitelist** — list @handles to never unfollow (saved in your browser).
- 🔁 **Continuous mode** — keep going in batches with a 15–20 min cooldown between them, instead of stopping at one batch.
- ⏸️ **Pause / Resume / Stop**, live stats, and a final report in the console.

> **Heads-up:** continuous high-volume unfollowing is exactly the pattern X's automation detection watches for. The cooldowns lower the risk but don't eliminate it. Stop for the day if you see a *"you're doing that too much"* warning.

### 🧹 Cleanup

Deletes the low-value content that pulls your engagement average down.

- **From your data export** (recommended, fast): [request your data](https://x.com/settings/your_twitter_data/data), unzip it, then drag a file onto the dropzone.
- **Slow delete without a file**: deletes straight from your profile (~4,000/hour, only your own tweets).

Filters & options:

| Option | What it does |
| --- | --- |
| **Skip oldest N** | Resume a previous run (empty = auto-detect already-deleted tweets). |
| **Spare > N likes** | Keep popular tweets (uses counts from `tweets.js`, or live lookups). |
| **Fetch live like counts** | Look up each tweet's current likes from X (works with `tweet-headers.js`; one extra request per tweet). |
| **Spare last N days** | Keep your most recent tweets. |
| **Auto-pause** | Pause N minutes after every M deletions to dodge rate limits. |
| **Export bookmarks** | Bookmarks aren't in the official export — grab them as JSON. |

**Supported files:** `tweet-headers.js`, `tweets.js` (enables spare-by-likes), `like.js`, `direct-message-headers.js` / `direct-message-group-headers.js`.

## Ideas & roadmap

These extend the "manage your tweepcred" theme. Open to PRs:

- **Engagement scanner** — use the data export to flag your zero-engagement / ratio'd tweets as deletion candidates (the inverse of spare-by-likes), so Cleanup can target dead weight automatically.
- **Ratio target planner** — in the Dashboard, set a goal ratio and have it compute exactly how many unfollows get you there, then hand the number straight to the Unfollow tool.
- **Inactive / ghost-account finder** — within the Unfollow list, prioritize unfollowing accounts that are suspended, deactivated or haven't posted in a long time.
- **Snapshot & track** — save Dashboard estimates over time to a local history so you can see your score trend as you clean up.
- **Auto profile audit** — actively read your avatar/bio/header/pinned-tweet state and score profile completeness instead of asking.
- **Pacing advisor** — a single shared "safety budget" across Unfollow + Cleanup so combined daily automation stays under X's thresholds.

If you have other ideas, open an issue.

## How it works (under the hood)

- **Unfollow** drives the real X web UI: it walks the virtualized follow list, re-querying the DOM each pass (because X recycles off-screen rows), detects mutuals/private accounts by `data-testid` + aria-labels, and clicks the real unfollow + confirm buttons with human-like delays.
- **Cleanup** talks to X's own GraphQL/REST endpoints (`DeleteTweet`, `UnfavoriteTweet`, DM deletion, Bookmarks) using your session cookies, swapping in tweet IDs from your export so it can reach old tweets that no longer appear on your profile.
- All of it shares one core (auth token, `ct0` CSRF cookie, transaction id, rate-limit handling, snowflake→date decoding) and one tabbed UI.

## Known limitations

- Estimates are heuristic — X does not expose the real tweepcred number.
- X changes its UI and rotates GraphQL query IDs frequently. If like-count lookups start failing, update `tweetResultQueryId` in the source (copy the current one from the Network tab).
- Likes can only be removed for the most recent few hundred (an X limitation).
- Chrome can get sluggish past ~15k tweets; closing the console while Cleanup runs helps.

## Credits

This is a unification of two community projects — full credit to their authors:

- **Mass Unfollow engine** — [Shayan Taherkhani](https://shayantaherkhani.ir) ([@tah3rkhani](https://twitter.com/tah3rkhani)).
- **Cleanup engine (TweetXer)** — [Luca Hammer](https://www.buymeacoffee.com/lucahammer) and contributors (Luca, dbort, pReya, Micolithe, STrRedWolf).

See [CREDITS.md](CREDITS.md) for details.

## License

[MIT](LICENSE). The bundled engines retain their original authorship and credit.

---

<p align="center">⭐ If this helped, give it a star.</p>
