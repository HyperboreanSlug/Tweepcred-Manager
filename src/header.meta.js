// ==UserScript==
// @name         Tweepcred Manager
// @namespace    https://github.com/HyperboreanSlug/Tweepcred-Manager
// @version      1.6.0
// @description  All-in-one toolkit for managing your X.com "tweepcred" reputation: estimate score, fix follower ratio, track followers, sort following by following-count, and clean up tweets — console paste or Greasemonkey.
// @author       HyperboreanSlug (merges TweetXer by Luca Hammer et al. + Mass Unfollow by Shayan Taherkhani)
// @license      MIT
// @homepage     https://github.com/HyperboreanSlug/Tweepcred-Manager
// @match        https://x.com/*
// @match        https://mobile.x.com/*
// @match        https://twitter.com/*
// @match        https://mobile.twitter.com/*
// @icon         https://www.google.com/s2/favicons?domain=twitter.com
// @noframes
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/*
 * Tweepcred Manager
 * =================
 * A single console-paste / userscript that unifies two well-known X.com tools
 * behind one tabbed control panel, around a single goal: managing "tweepcred",
 * X's internal PageRank-style reputation score.
 *
 *   • Dashboard  – estimates your tweepcred from public signals (follower/
 *                  following ratio, account age, profile completeness) and gives
 *                  concrete, actionable recommendations.
 *   • Unfollow   – mass-unfollows non-followers to repair your ratio. Skips
 *                  mutuals, private accounts and a user whitelist. One-shot or
 *                  continuous (batches + cooldown).  [engine: Shayan Taherkhani]
 *   • Followers  – snapshot your followers over time; scan Following and sort
 *                  accounts by their following count (export CSV/JSON).
 *   • Cleanup    – deletes Tweets / Likes / DMs using your data export (or slow-
 *                  deletes from your profile), with spare-by-likes and spare-recent
 *                  filters and auto-pause.                  [engine: TweetXer / Luca Hammer]
 *
 * Source is modular under src/modules/ (see docs/modules/). Build with
 * node scripts/build.js — output works as console paste and as a userscript.
 * Engines are ported faithfully; plumbing is shared under #tpm-panel.
 * See README.md and CREDITS.md.
 *
 * ⚠ Automating X is against its Terms of Service and can get your account locked
 *   or banned. Use conservative settings, at your own risk.
 */
