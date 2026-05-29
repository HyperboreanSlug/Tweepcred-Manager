// ==UserScript==
// @name         Tweepcred Manager
// @namespace    https://github.com/HyperboreanSlug/Tweepcred-Manager
// @version      1.0.0
// @description  All-in-one toolkit for managing your X.com "tweepcred" reputation: estimate your score, fix your follower/following ratio (mass unfollow non-followers), and clean up old/low-engagement tweets, likes and DMs — all from one panel.
// @author       HyperboreanSlug (merges TweetXer by Luca Hammer et al. + Mass Unfollow by Shayan Taherkhani)
// @license      MIT
// @match        https://x.com/*
// @match        https://mobile.x.com/*
// @match        https://twitter.com/*
// @match        https://mobile.twitter.com/*
// @icon         https://www.google.com/s2/favicons?domain=twitter.com
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
 *   • Cleanup    – deletes Tweets / Likes / DMs using your data export (or slow-
 *                  deletes from your profile), with spare-by-likes and spare-recent
 *                  filters and auto-pause.                  [engine: TweetXer / Luca Hammer]
 *
 * The two automation engines are ported faithfully from the original projects;
 * this file shares their auth/util plumbing, namespaces all DOM ids under the
 * single #tpm-panel, and wires them to one UI. See README.md and CREDITS.md.
 *
 * ⚠ Automating X is against its Terms of Service and can get your account locked
 *   or banned. Use conservative settings, at your own risk.
 */

(function () {
    'use strict';

    // Re-run guard: if the panel is already up, just surface it instead of
    // building a second one (and avoid clobbering an in-flight task).
    if (window.__tpmRunning) {
        const existing = document.getElementById('tpm-panel');
        if (existing) {
            existing.classList.remove('tpm-min');
            existing.animate?.([{ outline: '2px solid #1d9bf0' }, { outline: '2px solid transparent' }], { duration: 800 });
        }
        console.warn('[Tweepcred Manager] Already running — re-using the open panel.');
        return;
    }
    window.__tpmRunning = true;

    /* ===================================================================== *
     *  CORE — shared state, auth and utilities used by every module          *
     * ===================================================================== */
    const Core = {
        version: '1.0.0',
        baseUrl: `https://${window.location.hostname}`,
        // Public web bearer token (same one the X web app ships). Inherited from
        // TweetXer; required for the GraphQL delete/like endpoints.
        authorization: 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
        ct0: null,
        transaction_id: '',
        username: '',
        userId: null,
        // Twitter Snowflake epoch (2010-11-04). IDs minted after this encode a
        // creation timestamp in their high bits.
        snowflakeEpoch: 1288834974657n,

        init() {
            this.ct0 = this.getCookie('ct0');
            this.updateTransactionId();
            this.username = this.getUsernameFromUI();
            this.userId = this.getUserId();
        },

        sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
        rand(min, max) { return min + Math.floor(Math.random() * (max - min)); },

        getCookie(name) {
            const m = `; ${document.cookie}`.match(`;\\s*${name}=([^;]+)`);
            return m ? m[1] : null;
        },

        // Logged-in numeric user id lives in the `twid` cookie as "u%3D<id>".
        getUserId() {
            const raw = this.getCookie('twid');
            if (!raw) return null;
            const dec = decodeURIComponent(raw); // "u=1234567890"
            const m = dec.match(/\d+/);
            return m ? m[0] : null;
        },

        getUsernameFromUI() {
            const sources = [
                '[data-testid="SideNav_AccountSwitcher_Button"]',
                '[data-testid="UserName"]'
            ];
            for (const sel of sources) {
                const el = document.querySelector(sel);
                const m = el && el.textContent.match(/@(\w+)/);
                if (m) return m[1];
            }
            return (document.location.href.split('/')[3] || '').replace('#', '');
        },

        updateTransactionId() {
            this.transaction_id = [...crypto.getRandomValues(new Uint8Array(95))]
                .map((x, i) => (i = x / 255 * 61 | 0, String.fromCharCode(i + (i > 9 ? i > 35 ? 61 : 55 : 48)))).join``;
        },

        // X API headers used for authenticated GraphQL / REST calls.
        apiHeaders(contentType = 'application/json') {
            return {
                authorization: this.authorization,
                'content-type': contentType,
                'x-client-transaction-id': this.transaction_id,
                'x-csrf-token': this.ct0,
                'x-twitter-active-user': 'yes',
                'x-twitter-auth-type': 'OAuth2Session'
            };
        },

        // Convert a Snowflake id (tweet OR post-2013 user id) to a Date.
        snowflakeToDate(id) {
            try {
                return new Date(Number((BigInt(id) >> 22n) + this.snowflakeEpoch));
            } catch (_) { return null; }
        },

        fmtDuration(s) {
            if (!isFinite(s) || s <= 0) return '—';
            s = Math.round(s);
            const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
            if (h) return `${h}h ${m}m`;
            if (m) return `${m}m ${sec}s`;
            return `${sec}s`;
        },

        // Parse "1,234" / "1.2K" / "3.4M" into a number.
        parseCount(text) {
            if (text == null) return null;
            const m = String(text).replace(/,/g, '').match(/([\d.]+)\s*([KkMm])?/);
            if (!m) return null;
            let n = parseFloat(m[1]);
            if (/k/i.test(m[2])) n *= 1e3;
            else if (/m/i.test(m[2])) n *= 1e6;
            return Math.round(n);
        },

        escapeHtml(s) {
            return String(s).replace(/[&<>"']/g, c => (
                { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
            ));
        },

        // localStorage-backed settings store (namespaced, fails quietly).
        store: {
            get(key, fallback) {
                try {
                    const v = localStorage.getItem('tpm:' + key);
                    return v == null ? fallback : JSON.parse(v);
                } catch (_) { return fallback; }
            },
            set(key, val) {
                try { localStorage.setItem('tpm:' + key, JSON.stringify(val)); } catch (_) { }
            }
        },

        // Resolve when `selector` appears, or null after `timeout` ms.
        waitForElem(selector, timeout = 8000) {
            const existing = document.querySelector(selector);
            if (existing) return Promise.resolve(existing);
            return new Promise(resolve => {
                let settled = false;
                const finish = (val) => {
                    if (settled) return;
                    settled = true;
                    observer.disconnect();
                    clearTimeout(timer);
                    resolve(val);
                };
                const observer = new MutationObserver(() => {
                    const el = document.querySelector(selector);
                    if (el) finish(el);
                });
                observer.observe(document.body, { subtree: true, childList: true });
                const timer = setTimeout(() => finish(null), timeout);
            });
        }
    };

    /* ===================================================================== *
     *  Shared DOM helpers for the X follow-list (used by Unfollow + Dashboard)*
     *  Ported verbatim from the Mass-Unfollow project so behaviour matches.  *
     * ===================================================================== */
    const Follow = {
        txt(el) { return (el?.innerText || el?.textContent || '').trim().toLowerCase(); },

        isMutual(cell) {
            const NEEDLES = ['follows you', 'شما را دنبال می‌کند'];
            if (cell.querySelector('[data-testid="userFollowIndicator"]')) return true;
            for (const el of cell.querySelectorAll('[aria-label]')) {
                const label = (el.getAttribute('aria-label') || '').toLowerCase();
                if (NEEDLES.some(n => label.includes(n))) return true;
            }
            const combined = (cell?.innerText || '').toLowerCase() + ' ' + (cell?.textContent || '').toLowerCase();
            return NEEDLES.some(n => combined.includes(n));
        },

        isPrivate(cell) {
            const svgs = cell.querySelectorAll('svg');
            for (const svg of svgs) {
                const label = (svg.getAttribute('aria-label') || '').toLowerCase();
                if (label.includes('protected') || label.includes('private') || label.includes('locked')) return true;
            }
            for (const el of cell.querySelectorAll('[aria-label]')) {
                const label = (el.getAttribute('aria-label') || '').toLowerCase();
                if (label.includes('protected') || label.includes('private') || label.includes('locked')) return true;
            }
            for (const title of cell.querySelectorAll('svg title')) {
                const t = this.txt(title);
                if (t.includes('protected') || t.includes('private') || t.includes('locked')) return true;
            }
            for (const path of cell.querySelectorAll('svg path[d]')) {
                const d = path.getAttribute('d') || '';
                if (d.includes('M12 4a3 3 0 0 0-3 3v2h6V7a3 3 0 0 0-3-3') ||
                    d.includes('M16.5 10H15V7a3 3') ||
                    (d.includes('M') && d.includes('a') && d.includes('H') && d.length > 30 && d.length < 120 &&
                        path.closest('svg')?.getAttribute('viewBox') === '0 0 24 24')) {
                    if (!path.closest('[role="button"], button')) return true;
                }
            }
            return false;
        },

        getUsername(cell) {
            const link = cell.querySelector('a[href^="/"][role="link"], a[href^="/"]:not([href*="status"]):not([href*="intent"])');
            return link ? (link.getAttribute('href').split('/')[1] || 'unknown') : 'unknown';
        },

        findUnfollowButton(cell) {
            const byTestId = cell.querySelector('[data-testid$="-unfollow"]');
            if (byTestId) return byTestId;
            const btns = cell.querySelectorAll('div[role="button"], button');
            return Array.from(btns).find(b => {
                const t = (b.innerText || b.textContent || '').trim().toLowerCase();
                if (t.length > 25) return false;
                return t.includes('following') || t.includes('unfollow') || t.includes('دنبال می‌کنید');
            });
        },

        async waitConfirm(timeout = 7000) {
            const start = Date.now();
            while (Date.now() - start < timeout) {
                const btn =
                    document.querySelector('[data-testid="confirmationSheetConfirm"]') ||
                    document.querySelector('div[role="button"][data-testid*="unfollow"]') ||
                    document.querySelector('button[data-testid*="unfollow"]') ||
                    Array.from(document.querySelectorAll('button')).find(b => this.txt(b).includes('unfollow'));
                if (btn) return btn;
                await Core.sleep(300);
            }
            return null;
        }
    };

    /* ===================================================================== *
     *  UI — one panel, tabbed. Builds the chrome; each module fills a tab.    *
     * ===================================================================== */
    const UI = {
        id: 'tpm-panel',

        build() {
            const old = document.getElementById(this.id);
            if (old) old.remove();

            const panel = document.createElement('div');
            panel.id = this.id;
            panel.innerHTML = this.styles() + `
              <div class="tpm-header" id="tpm-header">
                <div class="tpm-badge">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 21v-6h6v6"/></svg>
                </div>
                <div class="tpm-htext">
                  <h2>Tweepcred Manager</h2>
                  <div class="tpm-sub">manage your X reputation score</div>
                </div>
                <button class="tpm-iconbtn" id="tpm-min" title="Minimize" type="button"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg></button>
                <button class="tpm-iconbtn" id="tpm-close" title="Close" type="button"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
              </div>
              <nav class="tpm-tabs" id="tpm-tabs">
                <button class="tpm-tab tpm-active" data-tab="dashboard" type="button">Dashboard</button>
                <button class="tpm-tab" data-tab="unfollow" type="button">Unfollow</button>
                <button class="tpm-tab" data-tab="cleanup" type="button">Cleanup</button>
                <button class="tpm-tab" data-tab="about" type="button">About</button>
              </nav>
              <div class="tpm-body">
                <section class="tpm-pane tpm-active" id="tpm-pane-dashboard"></section>
                <section class="tpm-pane" id="tpm-pane-unfollow"></section>
                <section class="tpm-pane" id="tpm-pane-cleanup"></section>
                <section class="tpm-pane" id="tpm-pane-about"></section>
              </div>`;
            document.body.insertBefore(panel, document.body.firstChild);

            document.getElementById('tpm-min').onclick = () => panel.classList.toggle('tpm-min');
            document.getElementById('tpm-close').onclick = () => { panel.remove(); window.__tpmRunning = false; };
            document.getElementById('tpm-tabs').addEventListener('click', (e) => {
                const tab = e.target.closest('.tpm-tab');
                if (tab) this.switchTab(tab.dataset.tab);
            });

            this.makeDraggable(panel, document.getElementById('tpm-header'));
        },

        switchTab(name) {
            document.querySelectorAll('#tpm-tabs .tpm-tab').forEach(t =>
                t.classList.toggle('tpm-active', t.dataset.tab === name));
            document.querySelectorAll('.tpm-pane').forEach(p =>
                p.classList.toggle('tpm-active', p.id === `tpm-pane-${name}`));
            if (name === 'dashboard') Dashboard.onShow();
            if (name === 'unfollow') Unfollow.onShow();
        },

        makeDraggable(panel, header) {
            let dragging = false, offX = 0, offY = 0;
            header.addEventListener('pointerdown', (e) => {
                if (e.target.closest('.tpm-iconbtn')) return;
                dragging = true;
                const r = panel.getBoundingClientRect();
                panel.style.transform = 'none';
                panel.style.left = `${r.left}px`;
                panel.style.top = `${r.top}px`;
                panel.style.right = 'auto';
                offX = e.clientX - r.left;
                offY = e.clientY - r.top;
                header.setPointerCapture(e.pointerId);
            });
            header.addEventListener('pointermove', (e) => {
                if (!dragging) return;
                const w = panel.offsetWidth, h = panel.offsetHeight;
                panel.style.left = `${Math.max(6, Math.min(window.innerWidth - w - 6, e.clientX - offX))}px`;
                panel.style.top = `${Math.max(6, Math.min(window.innerHeight - h - 6, e.clientY - offY))}px`;
            });
            const end = (e) => { if (dragging) { dragging = false; try { header.releasePointerCapture(e.pointerId); } catch (_) { } } };
            header.addEventListener('pointerup', end);
            header.addEventListener('pointercancel', end);
        },

        styles() {
            const p = `#${this.id}`;
            return `<style>
            ${p},${p} *{box-sizing:border-box}
            ${p}{
              --acc:#1d9bf0;--ok:#17bf63;--warn:#f7931a;--danger:#f4212e;
              --text:#e7e9ea;--muted:#71767b;--card:rgba(255,255,255,.05);--border:rgba(255,255,255,.12);
              position:fixed;top:16px;right:16px;width:min(440px,calc(100vw - 24px));
              max-height:calc(100vh - 32px);overflow:hidden;display:flex;flex-direction:column;
              z-index:2147483647;margin:0;padding:0;
              background:rgba(21,24,28,.95);backdrop-filter:blur(14px) saturate(150%);-webkit-backdrop-filter:blur(14px) saturate(150%);
              color:var(--text);font-family:"TwitterChirp",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
              font-size:15px;line-height:1.45;text-align:left;
              border:1px solid var(--border);border-radius:20px;box-shadow:0 18px 50px rgba(0,0,0,.55);
              -webkit-font-smoothing:antialiased;animation:tpm-in .25s ease both;
            }
            @keyframes tpm-in{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:translateY(0)}}
            ${p} .tpm-header{display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:grab;user-select:none;border-bottom:1px solid var(--border);flex:0 0 auto}
            ${p} .tpm-header:active{cursor:grabbing}
            ${p} .tpm-badge{flex:0 0 auto;width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--acc),#5cc0ff);color:#fff;box-shadow:0 4px 12px rgba(29,155,240,.4)}
            ${p} .tpm-htext{flex:1 1 auto;min-width:0}
            ${p} .tpm-htext h2{margin:0;font-size:17px;font-weight:800;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
            ${p} .tpm-sub{font-size:12px;color:var(--muted);font-weight:500}
            ${p} .tpm-iconbtn{flex:0 0 auto;width:32px;height:32px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--muted);background:transparent;transition:.15s}
            ${p} .tpm-iconbtn:hover{background:rgba(255,255,255,.1);color:var(--text)}
            ${p} #tpm-close:hover{background:rgba(244,33,46,.15);color:var(--danger)}
            ${p} .tpm-tabs{display:flex;gap:2px;padding:8px 10px 0;flex:0 0 auto}
            ${p} .tpm-tab{flex:1;padding:9px 6px;background:transparent;border:none;border-bottom:2px solid transparent;color:var(--muted);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;border-radius:8px 8px 0 0;transition:.15s}
            ${p} .tpm-tab:hover{color:var(--text);background:rgba(255,255,255,.05)}
            ${p} .tpm-tab.tpm-active{color:var(--acc);border-bottom-color:var(--acc)}
            ${p} .tpm-body{padding:16px;overflow-y:auto;flex:1 1 auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.25) transparent}
            ${p} .tpm-body::-webkit-scrollbar{width:8px}
            ${p} .tpm-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.2);border-radius:8px}
            ${p}.tpm-min{width:min(320px,calc(100vw - 24px))}
            ${p}.tpm-min .tpm-tabs,${p}.tpm-min .tpm-body{display:none}
            ${p} .tpm-pane{display:none}
            ${p} .tpm-pane.tpm-active{display:block}
            ${p} .tpm-section{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:12px}
            ${p} .tpm-section h4{margin:0 0 6px;font-size:14px;font-weight:700}
            ${p} .tpm-section p{margin:0 0 10px;font-size:13px;color:var(--muted)}
            ${p} .tpm-section ul{margin:6px 0 0;padding-left:18px;font-size:13px;color:var(--muted)}
            ${p} .tpm-section li{margin:4px 0}
            ${p} .tpm-label{display:block;font-size:13px;color:var(--muted);margin:12px 0 6px}
            ${p} .tpm-label:first-child{margin-top:0}
            ${p} .tpm-input{width:100%;padding:9px 12px;border-radius:10px;border:1px solid var(--border);background:rgba(0,0,0,.25);color:var(--text);font-size:14px;font-family:inherit;outline:none;transition:.15s}
            ${p} textarea.tpm-input{resize:vertical;min-height:64px}
            ${p} .tpm-input:focus{border-color:var(--acc);box-shadow:0 0 0 3px rgba(29,155,240,.25)}
            ${p} .tpm-row{display:flex;gap:10px}
            ${p} .tpm-row>div{flex:1}
            ${p} .tpm-check{display:flex;align-items:flex-start;gap:8px;margin-top:12px;font-size:13px;color:var(--muted);cursor:pointer;line-height:1.4}
            ${p} .tpm-check input{flex:0 0 auto;width:16px;height:16px;margin-top:1px;accent-color:var(--acc);cursor:pointer}
            ${p} .tpm-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:10px 16px;border-radius:999px;border:1px solid transparent;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;transition:.15s}
            ${p} .tpm-btn-primary{background:var(--acc);color:#fff}
            ${p} .tpm-btn-primary:hover{background:#1a8cd8}
            ${p} .tpm-btn-ghost{background:transparent;border-color:var(--border);color:var(--text)}
            ${p} .tpm-btn-ghost:hover{background:rgba(255,255,255,.08)}
            ${p} .tpm-btn-warn{background:var(--warn);color:#111}
            ${p} .tpm-btn-warn:hover{filter:brightness(1.08)}
            ${p} .tpm-btn-danger{background:transparent;border-color:rgba(244,33,46,.5);color:var(--danger)}
            ${p} .tpm-btn-danger:hover{background:rgba(244,33,46,.12)}
            ${p} .tpm-btn[disabled]{opacity:.45;cursor:not-allowed}
            ${p} .tpm-btns{display:flex;gap:10px;margin-top:8px}
            ${p} a{color:var(--acc);text-decoration:none}
            ${p} a:hover{text-decoration:underline}
            /* score gauge */
            ${p} .tpm-score{display:flex;align-items:center;gap:16px}
            ${p} .tpm-score-num{font-size:46px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
            ${p} .tpm-score-meta{flex:1}
            ${p} .tpm-score-label{font-size:13px;font-weight:700;margin-bottom:6px}
            ${p} .tpm-track{height:10px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden}
            ${p} .tpm-fill{height:100%;width:0;border-radius:999px;transition:width .5s ease}
            ${p} .tpm-factor{margin:8px 0}
            ${p} .tpm-factor-top{display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px}
            ${p} .tpm-factor-top span:last-child{color:var(--muted);font-variant-numeric:tabular-nums}
            ${p} .tpm-mini-track{height:6px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}
            ${p} .tpm-mini-fill{height:100%;border-radius:999px;background:var(--acc)}
            /* stats */
            ${p} .tpm-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
            ${p} .tpm-stat{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 8px;text-align:center}
            ${p} .tpm-stat-v{font-size:24px;font-weight:800;color:var(--acc);font-variant-numeric:tabular-nums}
            ${p} .tpm-stat-l{font-size:11px;color:var(--muted);margin-top:4px}
            ${p} .tpm-status{text-align:center;padding:9px;border-radius:10px;font-size:13px;font-weight:700;margin-top:6px}
            ${p} .tpm-status.run{background:rgba(23,191,99,.18);color:var(--ok)}
            ${p} .tpm-status.pause{background:rgba(247,147,26,.18);color:var(--warn)}
            ${p} .tpm-status.stop{background:rgba(244,33,46,.18);color:var(--danger)}
            ${p} .tpm-status.idle{background:rgba(255,255,255,.06);color:var(--muted)}
            ${p} .tpm-now{background:rgba(29,155,240,.1);border:1px solid rgba(29,155,240,.3);border-radius:10px;padding:10px;margin:10px 0;font-size:13px;text-align:center}
            ${p} .tpm-note{font-size:12px;color:var(--muted);margin-top:10px;line-height:1.5}
            ${p} .tpm-warn-box{background:rgba(247,147,26,.12);border:1px solid rgba(247,147,26,.35);color:#ffd9a8;border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:12px}
            ${p} #tpm-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:22px 16px;border:2px dashed var(--border);border-radius:14px;cursor:pointer;text-align:center;color:var(--muted);background:var(--card);transition:.15s}
            ${p} #tpm-drop:hover,${p} #tpm-drop.tpm-dragover{border-color:var(--acc);color:var(--text);background:rgba(29,155,240,.08)}
            ${p} #tpm-drop strong{color:var(--text);font-weight:700}
            ${p} #tpm-file{position:absolute;width:1px;height:1px;opacity:0;clip:rect(0 0 0 0)}
            ${p} .tpm-pct{font-size:18px;font-weight:800;color:var(--acc)}
            ${p} .tpm-foot{margin-top:6px;text-align:center;font-size:11px;color:var(--muted)}
            @media (max-width:480px){${p}{top:8px;right:8px;left:8px;width:auto;border-radius:16px}}
            </style>`;
        },

        // small helper to fetch panel-scoped element by id
        el(id) { return document.getElementById(id); }
    };

    /* ===================================================================== *
     *  DASHBOARD — estimates tweepcred from public signals + recommendations *
     * ===================================================================== */
    const Dashboard = {
        firstShow: true,

        onShow() {
            if (this.firstShow) {
                this.render();
                this.firstShow = false;
                this.autofill();
            }
        },

        render() {
            UI.el('tpm-pane-dashboard').innerHTML = `
              <div class="tpm-section">
                <h4>Estimated tweepcred</h4>
                <p>Tweepcred is X's internal PageRank-style reputation score (0–100). The real value isn't exposed, so this is an <strong>estimate</strong> from public signals. Below ~65, X limits how many of your tweets enter the search index.</p>
                <div class="tpm-score">
                  <div class="tpm-score-num" id="tpm-score-num">–</div>
                  <div class="tpm-score-meta">
                    <div class="tpm-score-label" id="tpm-score-label">Enter your numbers below</div>
                    <div class="tpm-track"><div class="tpm-fill" id="tpm-score-fill"></div></div>
                  </div>
                </div>
                <div id="tpm-factors" style="margin-top:14px"></div>
              </div>

              <div class="tpm-section">
                <h4>Your numbers</h4>
                <p>Auto-filled from your profile when possible. Correct anything that's off, then recalculate.</p>
                <div class="tpm-row">
                  <div><label class="tpm-label">Followers</label><input id="tpm-d-followers" type="number" class="tpm-input" placeholder="0"></div>
                  <div><label class="tpm-label">Following</label><input id="tpm-d-following" type="number" class="tpm-input" placeholder="0"></div>
                </div>
                <div class="tpm-row">
                  <div><label class="tpm-label">Account created (year)</label><input id="tpm-d-year" type="number" class="tpm-input" placeholder="e.g. 2015"></div>
                  <div><label class="tpm-label">Total tweets</label><input id="tpm-d-tweets" type="number" class="tpm-input" placeholder="0"></div>
                </div>
                <label class="tpm-check"><input type="checkbox" id="tpm-d-avatar" checked> I have a profile photo</label>
                <label class="tpm-check"><input type="checkbox" id="tpm-d-bio" checked> I have a bio / profile description</label>
                <div class="tpm-btns">
                  <button class="tpm-btn tpm-btn-primary" id="tpm-d-calc" type="button">Recalculate</button>
                </div>
              </div>

              <div class="tpm-section">
                <h4>Recommendations</h4>
                <ul id="tpm-recs"><li>Fill in your numbers and recalculate.</li></ul>
              </div>
              <div class="tpm-foot">Heuristic estimate, not X's actual score.</div>`;

            UI.el('tpm-d-calc').onclick = () => this.calculate();
            ['tpm-d-followers', 'tpm-d-following', 'tpm-d-year', 'tpm-d-tweets'].forEach(id => {
                UI.el(id).addEventListener('input', () => this.calculate());
            });
            ['tpm-d-avatar', 'tpm-d-bio'].forEach(id => {
                UI.el(id).addEventListener('change', () => this.calculate());
            });
        },

        // Try to read followers/following/tweets/avatar/bio from the page DOM.
        autofill() {
            // counts from profile header anchors
            const grab = (suffixes) => {
                for (const sfx of suffixes) {
                    const a = document.querySelector(`a[href$="${sfx}"]`);
                    if (a) {
                        // prefer the bold count span's title/text
                        const strong = a.querySelector('span');
                        const n = Core.parseCount(a.getAttribute('title') || (strong && strong.textContent) || a.textContent);
                        if (n != null) return n;
                    }
                }
                return null;
            };
            const followers = grab(['/verified_followers', '/followers']);
            const following = grab(['/following']);
            if (followers != null) UI.el('tpm-d-followers').value = followers;
            if (following != null) UI.el('tpm-d-following').value = following;

            // tweet count from profile nav ("12.3K posts")
            const navEl = document.querySelector('[data-testid="primaryColumn"] [role="navigation"]') ||
                document.querySelector('[data-testid="primaryColumn"]');
            if (navEl) {
                const m = navEl.textContent.match(/([\d.,]+\s*[KM]?)\s+posts/i);
                if (m) UI.el('tpm-d-tweets').value = Core.parseCount(m[1]) ?? '';
            }

            // account creation year from the join-date span, else snowflake of user id
            const joinSpan = Array.from(document.querySelectorAll('span'))
                .find(s => /^Joined\s/i.test(s.textContent.trim()));
            let year = null;
            if (joinSpan) {
                const ym = joinSpan.textContent.match(/(\d{4})/);
                if (ym) year = parseInt(ym[1], 10);
            }
            if (!year && Core.userId) {
                // Only decode if the id is large enough to be a Snowflake (post-2013).
                try {
                    if (BigInt(Core.userId) > 10000000000000000n) {
                        const d = Core.snowflakeToDate(Core.userId);
                        if (d && d.getFullYear() > 2010) year = d.getFullYear();
                    }
                } catch (_) { }
            }
            if (year) UI.el('tpm-d-year').value = year;

            // avatar / bio presence
            const avatar = document.querySelector('a[href$="/photo"] img, [data-testid^="UserAvatar"] img');
            if (avatar) UI.el('tpm-d-avatar').checked = !/default_profile/i.test(avatar.src || '');
            const bio = document.querySelector('[data-testid="UserDescription"]');
            UI.el('tpm-d-bio').checked = !!(bio && bio.textContent.trim().length);

            this.calculate();
        },

        // Transparent, documented heuristic. Each factor is scored 0..1 then
        // weighted. The biggest lever is the follower/following ratio, mirroring
        // the PageRank-over-the-follow-graph core of the real algorithm.
        calculate() {
            const followers = parseInt(UI.el('tpm-d-followers').value, 10);
            const following = parseInt(UI.el('tpm-d-following').value, 10);
            const year = parseInt(UI.el('tpm-d-year').value, 10);
            const hasAvatar = UI.el('tpm-d-avatar').checked;
            const hasBio = UI.el('tpm-d-bio').checked;

            if (isNaN(followers) || isNaN(following)) return;

            const clamp = (x) => Math.max(0, Math.min(1, x));

            // 1. Ratio (weight 45) — followers / following on a log scale.
            const r = followers / Math.max(following, 1);
            const ratioScore = clamp((Math.log10(r + 0.1) + 1) / 1.6);

            // 2. Account age (weight 20) — 5+ years counts as fully established.
            let ageScore = 0.5, ageKnown = false, years = null;
            if (!isNaN(year) && year >= 2006 && year <= new Date().getFullYear()) {
                years = (new Date().getFullYear() + (new Date().getMonth() / 12)) - year;
                ageScore = clamp(years / 5);
                ageKnown = true;
            }

            // 3. Following-volume sanity (weight 15) — huge following looks spammy.
            let volScore;
            if (following <= 400) volScore = 1;
            else if (following <= 2000) volScore = 1 - 0.5 * (following - 400) / 1600;
            else if (following <= 5000) volScore = 0.5 - 0.3 * (following - 2000) / 3000;
            else volScore = 0.15;

            // 4. Profile completeness (weight 10).
            const profileScore = (hasAvatar ? 0.6 : 0) + (hasBio ? 0.4 : 0);

            // 5. Engagement/activity (weight 10) — can't be measured precisely
            //    client-side, so it's a neutral constant the user should improve
            //    via the Cleanup tab. Kept at a small weight on purpose.
            const engageScore = 0.7;

            const factors = [
                { key: 'Follower / following ratio', w: 45, s: ratioScore, hint: `${followers.toLocaleString()} : ${following.toLocaleString()} (${r.toFixed(2)}×)` },
                { key: 'Account age', w: 20, s: ageScore, hint: ageKnown ? `${years.toFixed(1)} yrs` : 'unknown (neutral)' },
                { key: 'Following volume', w: 15, s: volScore, hint: `${following.toLocaleString()} following` },
                { key: 'Profile completeness', w: 10, s: profileScore, hint: `${hasAvatar ? 'photo' : 'no photo'}, ${hasBio ? 'bio' : 'no bio'}` },
                { key: 'Engagement (assumed)', w: 10, s: engageScore, hint: 'improve via Cleanup' }
            ];

            const score = Math.round(factors.reduce((sum, f) => sum + f.w * f.s, 0));
            this.paint(score, factors, { followers, following });
        },

        paint(score, factors, ctx) {
            const color = score >= 65 ? 'var(--ok)' : score >= 45 ? 'var(--warn)' : 'var(--danger)';
            const num = UI.el('tpm-score-num');
            num.textContent = score;
            num.style.color = color;
            const fill = UI.el('tpm-score-fill');
            fill.style.width = `${score}%`;
            fill.style.background = color;
            UI.el('tpm-score-label').innerHTML = score >= 65
                ? '✅ Likely above the ~65 search-indexing threshold'
                : '⚠️ Likely below ~65 — X may limit your tweet indexing';

            UI.el('tpm-factors').innerHTML = factors.map(f => `
              <div class="tpm-factor">
                <div class="tpm-factor-top"><span>${f.key}</span><span>${Core.escapeHtml(f.hint)}</span></div>
                <div class="tpm-mini-track"><div class="tpm-mini-fill" style="width:${Math.round(f.s * 100)}%;background:${f.s >= 0.66 ? 'var(--ok)' : f.s >= 0.4 ? 'var(--warn)' : 'var(--danger)'}"></div></div>
              </div>`).join('');

            this.recommend(score, factors, ctx);
        },

        recommend(score, factors, ctx) {
            const recs = [];
            const { followers, following } = ctx;

            // Ratio fix → Unfollow tool
            if (following > followers) {
                const target = Math.max(0, following - followers);
                recs.push(`Your ratio is upside-down. Unfollowing about <strong>${target.toLocaleString()}</strong> non-followers would bring you to roughly 1:1. <a href="#" id="tpm-rec-unfollow">Open the Unfollow tool →</a>`);
            } else if (following > 1000 && following / Math.max(followers, 1) > 0.7) {
                recs.push(`You follow a lot of accounts relative to your followers. Trimming non-followers can lift your ratio. <a href="#" id="tpm-rec-unfollow">Open the Unfollow tool →</a>`);
            }

            if (factors.find(f => f.key.startsWith('Profile')).s < 1) {
                if (!UI.el('tpm-d-avatar').checked) recs.push('Add a profile photo — accounts using the default egg/avatar are treated as lower quality.');
                if (!UI.el('tpm-d-bio').checked) recs.push('Fill in your bio — a complete profile is a positive reputation signal.');
            }

            recs.push('Delete old, zero-engagement tweets to raise your average engagement and feed quality. <a href="#" id="tpm-rec-cleanup">Open the Cleanup tool →</a>');

            if (score >= 65) {
                recs.unshift('You\'re in good shape. Keep your ratio healthy and avoid bursts of automated activity.');
            }

            UI.el('tpm-recs').innerHTML = recs.map(r => `<li>${r}</li>`).join('');
            const ru = UI.el('tpm-rec-unfollow'); if (ru) ru.onclick = (e) => { e.preventDefault(); UI.switchTab('unfollow'); };
            const rc = UI.el('tpm-rec-cleanup'); if (rc) rc.onclick = (e) => { e.preventDefault(); UI.switchTab('cleanup'); };
        }
    };

    /* ===================================================================== *
     *  UNFOLLOW — repair your ratio. Engine ported from Mass-Unfollower,      *
     *  unified one-shot + continuous, plus audit (dry-run) and a whitelist.   *
     * ===================================================================== */
    const Unfollow = {
        running: false,
        paused: false,
        stop: false,
        firstShow: true,
        log: [],

        onShow() {
            if (this.firstShow) { this.render(); this.firstShow = false; }
            this.checkLocation();
        },

        render() {
            const s = Core.store;
            UI.el('tpm-pane-unfollow').innerHTML = `
              <div id="tpm-unf-locwarn"></div>
              <div class="tpm-stats">
                <div class="tpm-stat"><div class="tpm-stat-v" id="tpm-unf-done">0</div><div class="tpm-stat-l">Unfollowed</div></div>
                <div class="tpm-stat"><div class="tpm-stat-v" id="tpm-unf-skip">0</div><div class="tpm-stat-l">Skipped</div></div>
                <div class="tpm-stat"><div class="tpm-stat-v" id="tpm-unf-left">0</div><div class="tpm-stat-l">Left in batch</div></div>
              </div>
              <div class="tpm-now" id="tpm-unf-now">Idle — go to your <strong>Following</strong> page, then Start.</div>

              <div class="tpm-section">
                <h4>Settings</h4>
                <div class="tpm-row">
                  <div><label class="tpm-label">Batch size</label><input id="tpm-unf-max" type="number" class="tpm-input" value="${s.get('unf.max', 190)}" min="1" max="500"></div>
                  <div><label class="tpm-label">Min delay (s)</label><input id="tpm-unf-mind" type="number" class="tpm-input" value="${s.get('unf.mind', 3)}" min="0" max="120"></div>
                  <div><label class="tpm-label">Max delay (s)</label><input id="tpm-unf-maxd" type="number" class="tpm-input" value="${s.get('unf.maxd', 35)}" min="2" max="180"></div>
                </div>
                <label class="tpm-check"><input type="checkbox" id="tpm-unf-cont" ${s.get('unf.cont', false) ? 'checked' : ''}> Continuous mode — keep going in batches with a cooldown (instead of stopping at one batch)</label>
                <div class="tpm-row" id="tpm-unf-cooldownrow" style="${s.get('unf.cont', false) ? '' : 'display:none'}">
                  <div><label class="tpm-label">Cooldown min (min)</label><input id="tpm-unf-cmin" type="number" class="tpm-input" value="${s.get('unf.cmin', 15)}" min="1" max="120"></div>
                  <div><label class="tpm-label">Cooldown max (min)</label><input id="tpm-unf-cmax" type="number" class="tpm-input" value="${s.get('unf.cmax', 20)}" min="1" max="180"></div>
                </div>
                <label class="tpm-check"><input type="checkbox" id="tpm-unf-private" ${s.get('unf.private', true) ? 'checked' : ''}> Skip private / locked accounts</label>
              </div>

              <div class="tpm-section">
                <h4>Whitelist — never unfollow these</h4>
                <p>One @handle per line (or comma-separated). Saved on this browser.</p>
                <textarea id="tpm-unf-white" class="tpm-input" placeholder="@friend&#10;@favbrand">${Core.escapeHtml((s.get('unf.white', []) || []).map(u => '@' + u).join('\n'))}</textarea>
              </div>

              <div class="tpm-btns">
                <button class="tpm-btn tpm-btn-ghost" id="tpm-unf-audit" type="button">Scan only (audit)</button>
                <button class="tpm-btn tpm-btn-primary" id="tpm-unf-start" type="button">Start unfollowing</button>
              </div>
              <div class="tpm-btns" id="tpm-unf-live" style="display:none">
                <button class="tpm-btn tpm-btn-warn" id="tpm-unf-pause" type="button">Pause</button>
                <button class="tpm-btn tpm-btn-danger" id="tpm-unf-stop" type="button">Stop</button>
              </div>
              <div class="tpm-status idle" id="tpm-unf-status">Idle</div>
              <div class="tpm-note">Stays under X rate limits with human-like random delays. Continuous high-volume unfollowing is exactly what X's automation detection watches for — stop for the day if you see a "you're doing that too much" warning.</div>`;

            UI.el('tpm-unf-cont').addEventListener('change', (e) => {
                UI.el('tpm-unf-cooldownrow').style.display = e.target.checked ? '' : 'none';
            });
            UI.el('tpm-unf-audit').onclick = () => this.audit();
            UI.el('tpm-unf-start').onclick = () => this.start();
            UI.el('tpm-unf-pause').onclick = () => this.togglePause();
            UI.el('tpm-unf-stop').onclick = () => { this.stop = true; this.setStatus('stop', '🔴 Stopping…'); };
        },

        checkLocation() {
            const onList = /\/(following|followers|verified_followers)\b/.test(location.pathname) ||
                document.querySelector('[data-testid="UserCell"]');
            const box = UI.el('tpm-unf-locwarn');
            if (!box) return;
            box.innerHTML = onList ? '' :
                `<div class="tpm-warn-box">Open your <strong>Following</strong> list first: go to your profile → <em>Following</em> (URL ends in <code>/following</code>). The unfollow engine works on whatever follow-list is open.</div>`;
        },

        readSettings() {
            const v = (id, d) => { const n = parseFloat(UI.el(id).value); return isNaN(n) ? d : n; };
            this.MAX = v('tpm-unf-max', 190);
            this.MIN_DELAY = v('tpm-unf-mind', 3) * 1000;
            this.MAX_DELAY = v('tpm-unf-maxd', 35) * 1000;
            this.continuous = UI.el('tpm-unf-cont').checked;
            this.PAUSE_MIN = v('tpm-unf-cmin', 15) * 60000;
            this.PAUSE_MAX = v('tpm-unf-cmax', 20) * 60000;
            this.skipPrivate = UI.el('tpm-unf-private').checked;
            this.whitelist = new Set(
                (UI.el('tpm-unf-white').value.match(/[A-Za-z0-9_]+/g) || []).map(u => u.toLowerCase())
            );
            const s = Core.store;
            s.set('unf.max', this.MAX); s.set('unf.mind', this.MIN_DELAY / 1000); s.set('unf.maxd', this.MAX_DELAY / 1000);
            s.set('unf.cont', this.continuous); s.set('unf.cmin', this.PAUSE_MIN / 60000); s.set('unf.cmax', this.PAUSE_MAX / 60000);
            s.set('unf.private', this.skipPrivate); s.set('unf.white', [...this.whitelist]);
        },

        setStatus(kind, text) {
            const el = UI.el('tpm-unf-status');
            el.className = 'tpm-status ' + kind;
            el.textContent = text;
        },
        setNow(html) { UI.el('tpm-unf-now').innerHTML = html; },
        setStats(done, skip, leftInBatch) {
            UI.el('tpm-unf-done').textContent = done;
            UI.el('tpm-unf-skip').textContent = skip;
            UI.el('tpm-unf-left').textContent = leftInBatch;
        },

        logAction(username, action, reason = '') {
            const time = new Date().toLocaleTimeString();
            this.log.push({ time, username, action, reason });
            const colors = { unfollowed: 'color:green;font-weight:bold', skipped: 'color:orange', error: 'color:red;font-weight:bold' };
            console.log(`%c[${time}] ${action.toUpperCase()} - @${username} ${reason}`, colors[action] || '');
        },

        async waitWhilePaused() { while (this.paused && !this.stop) await Core.sleep(500); },

        togglePause() {
            this.paused = !this.paused;
            UI.el('tpm-unf-pause').textContent = this.paused ? 'Resume' : 'Pause';
            this.setStatus(this.paused ? 'pause' : 'run', this.paused ? '🟡 Paused' : '🟢 Running…');
        },

        // Dry run: scroll the whole list and tally categories without unfollowing.
        async audit() {
            if (this.running) return;
            this.readSettings();
            this.running = true; this.stop = false;
            UI.el('tpm-unf-audit').disabled = true;
            UI.el('tpm-unf-start').disabled = true;
            UI.el('tpm-unf-live').style.display = 'flex';
            this.setStatus('run', '🔍 Auditing (no unfollows)…');

            const seen = new Set();
            let mutuals = 0, nonFollowers = 0, privates = 0, whitelisted = 0, empty = 0;
            while (!this.stop && empty < 8) {
                await this.waitWhilePaused();
                const cells = Array.from(document.querySelectorAll('[data-testid="UserCell"], [data-testid="cellInnerDiv"]'));
                let found = false;
                for (const cell of cells) {
                    if (!cell.querySelector('a[href^="/"]')) continue;
                    const u = Follow.getUsername(cell);
                    if (u === 'unknown' || seen.has(u)) continue;
                    seen.add(u); found = true;
                    if (this.whitelist.has(u.toLowerCase())) whitelisted++;
                    else if (Follow.isMutual(cell)) mutuals++;
                    else if (Follow.isPrivate(cell)) privates++;
                    else nonFollowers++;
                    this.setStats(nonFollowers, mutuals + privates + whitelisted, '—');
                    this.setNow(`Scanned <strong>${seen.size}</strong> accounts…`);
                }
                if (!found) {
                    empty++;
                    const last = cells[cells.length - 1];
                    if (last) last.scrollIntoView({ block: 'end', behavior: 'instant' });
                    window.scrollBy(0, 800);
                    await Core.sleep(1200);
                } else { empty = 0; }
            }

            this.setStatus('idle', '✅ Audit complete');
            this.setNow(`<strong>${seen.size}</strong> scanned · <strong>${nonFollowers}</strong> non-followers (unfollowable) · ${mutuals} mutuals · ${privates} private · ${whitelisted} whitelisted`);
            console.table({ scanned: seen.size, nonFollowers, mutuals, privates, whitelisted });
            this.finishUI();
        },

        async start() {
            if (this.running) return;
            this.readSettings();
            this.running = true; this.stop = false; this.paused = false;
            UI.el('tpm-unf-audit').disabled = true;
            UI.el('tpm-unf-start').disabled = true;
            UI.el('tpm-unf-live').style.display = 'flex';
            UI.el('tpm-unf-pause').textContent = 'Pause';
            this.setStatus('run', '🟢 Running…');
            console.log('%c[Tweepcred Manager] Unfollow started', 'color:#1d9bf0;font-weight:bold');

            let total = 0, batchCount = 0, skipped = 0, batchNum = 1;
            const processed = new Set();
            let emptyScrolls = 0;
            const MAX_EMPTY = 8;
            this.setStats(0, 0, this.MAX);

            const randomDelay = () => this.MIN_DELAY + Math.floor(Math.random() * (this.MAX_DELAY - this.MIN_DELAY));

            while (!this.stop) {
                await this.waitWhilePaused();
                if (this.stop) break;

                if (batchCount >= this.MAX) {
                    if (!this.continuous) break;            // one-shot: stop at the cap
                    await this.cooldown(total);              // continuous: long cooldown
                    if (this.stop) break;
                    batchCount = 0; batchNum++;
                    console.log(`%c🔄 Batch #${batchNum}…`, 'color:#1d9bf0;font-weight:bold');
                    continue;
                }

                const cells = Array.from(document.querySelectorAll('[data-testid="UserCell"], [data-testid="cellInnerDiv"]'));
                let target = null, username = null;
                for (const cell of cells) {
                    if (!cell.querySelector('a[href^="/"]')) continue;
                    const u = Follow.getUsername(cell);
                    if (u === 'unknown' || processed.has(u)) continue;
                    target = cell; username = u; break;
                }

                if (!target) {
                    const last = cells[cells.length - 1];
                    if (last) last.scrollIntoView({ block: 'end', behavior: 'instant' });
                    window.scrollBy(0, 800);
                    await Core.sleep(1200);
                    if (++emptyScrolls >= MAX_EMPTY) { console.log('🏁 End of list.'); break; }
                    continue;
                }
                emptyScrolls = 0;
                processed.add(username);

                const lower = username.toLowerCase();
                if (this.whitelist.has(lower)) {
                    this.logAction(username, 'skipped', 'Whitelisted'); skipped++;
                    this.setStats(total, skipped, this.MAX - batchCount); continue;
                }
                if (Follow.isMutual(target)) {
                    this.logAction(username, 'skipped', 'Mutual follow'); skipped++;
                    this.setStats(total, skipped, this.MAX - batchCount); continue;
                }
                if (this.skipPrivate && Follow.isPrivate(target)) {
                    this.logAction(username, 'skipped', 'Private/locked'); skipped++;
                    this.setStats(total, skipped, this.MAX - batchCount); continue;
                }

                target.scrollIntoView({ block: 'center', behavior: 'instant' });
                await Core.sleep(400);
                const btn = Follow.findUnfollowButton(target);
                if (!btn) {
                    this.logAction(username, 'skipped', 'No unfollow button'); skipped++;
                    this.setStats(total, skipped, this.MAX - batchCount); continue;
                }

                this.setNow(`Processing <strong>@${Core.escapeHtml(username)}</strong>`);
                try {
                    const anchors = Array.from(target.querySelectorAll('a'));
                    const blockNav = (e) => e.preventDefault();
                    anchors.forEach(a => a.addEventListener('click', blockNav, true));
                    btn.click();
                    await Core.sleep(100);
                    anchors.forEach(a => a.removeEventListener('click', blockNav, true));

                    const confirmBtn = await Follow.waitConfirm();
                    if (confirmBtn) { confirmBtn.click(); this.logAction(username, 'unfollowed'); }
                    else this.logAction(username, 'skipped', 'No confirm dialog — assuming unfollowed');
                    total++; batchCount++;
                    this.setStats(total, skipped, this.MAX - batchCount);
                } catch (err) {
                    this.logAction(username, 'error', err.message); skipped++;
                    this.setStats(total, skipped, this.MAX - batchCount);
                }

                if (this.stop) break;
                await this.waitWhilePaused();
                const d = randomDelay();
                this.setNow(`⏳ Waiting ${Math.round(d / 1000)}s…`);
                await Core.sleep(d);
            }

            this.setStatus('stop', '✅ Complete');
            this.setNow(`🎉 Done — unfollowed <strong>${total}</strong>, skipped ${skipped}.`);
            console.log(`%c=== UNFOLLOW COMPLETE === total ${total}, skipped ${skipped}, batches ${batchNum}`, 'color:#1d9bf0;font-weight:bold');
            console.table(this.log);
            this.finishUI();
        },

        async cooldown(totalSoFar) {
            const ms = this.PAUSE_MIN + Math.floor(Math.random() * Math.max(0, this.PAUSE_MAX - this.PAUSE_MIN));
            const endAt = Date.now() + ms;
            this.setStatus('pause', '😴 Cooling down…');
            console.log(`%c😴 Batch done (total ${totalSoFar}). Cooldown ${Math.round(ms / 60000)} min…`, 'color:#f7931a;font-weight:bold');
            while (Date.now() < endAt && !this.stop) {
                if (this.paused) { await Core.sleep(500); continue; }
                const rem = endAt - Date.now();
                const mins = Math.floor(rem / 60000), secs = Math.floor((rem % 60000) / 1000);
                this.setNow(`😴 Next batch in <strong>${mins}:${String(secs).padStart(2, '0')}</strong>`);
                await Core.sleep(1000);
            }
            if (!this.stop) this.setStatus('run', '🟢 Running…');
        },

        finishUI() {
            this.running = false;
            UI.el('tpm-unf-audit').disabled = false;
            UI.el('tpm-unf-start').disabled = false;
            UI.el('tpm-unf-live').style.display = 'none';
        }
    };

    /* ===================================================================== *
     *  CLEANUP — delete tweets / likes / DMs. Engine ported from TweetXer.    *
     * ===================================================================== */
    const Cleanup = {
        firstShow: true,
        TweetCount: 0,
        tIds: [],
        tId: '',
        action: '',
        skip: 0,
        total: 0,
        dCount: 0,
        startCount: 0,
        startTime: 0,
        ratelimitreset: 0,
        pauseEvery: 190,
        pauseMinutes: 15,
        spareThreshold: 0,
        liveLikes: false,
        sparedCount: 0,
        deleteDMsOneByOne: false,
        bookmarks: [],
        bookmarksNext: '',
        tweetResultQueryId: '7xflPyRiUxGVbJd4uWmbKg',
        deleteURL: '/i/api/graphql/VaenaVgh5q5ih7kvyVjgtg/DeleteTweet',
        unfavURL: '/i/api/graphql/ZYKSe-w7KEslx3JhSIk5LA/UnfavoriteTweet',
        deleteMessageURL: '/i/api/graphql/BJ6DtxA2llfjnRoRjaiIiw/DMMessageDeleteMutation',
        deleteConvoURL: '/i/api/1.1/dm/conversation/USER_ID-CONVERSATION_ID/delete.json',
        bookmarksURL: '/i/api/graphql/L7vvM2UluPgWOW4GDvWyvw/Bookmarks?',

        onShow() { if (this.firstShow) { this.render(); this.firstShow = false; } },

        render() {
            UI.el('tpm-pane-cleanup').innerHTML = `
              <div class="tpm-section">
                <h4>Delete from your data export</h4>
                <p>Request your data at <a href="https://x.com/settings/your_twitter_data/data" target="_blank">Settings → Your data</a>, unzip it, then drop a file here.</p>
                <label id="tpm-drop" for="tpm-file">
                  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="var(--acc)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0l-4 4m4-4l4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
                  <strong>Choose your data file</strong>
                  <span>Drag &amp; drop or click<br>tweet-headers.js · tweets.js · like.js · direct-message-headers.js</span>
                </label>
                <input type="file" id="tpm-file">
                <p id="tpm-clean-info" style="margin-top:12px"></p>
                <div id="tpm-clean-progress"></div>
              </div>

              <div class="tpm-section">
                <h4>Filters</h4>
                <label class="tpm-label" for="tpm-skipCount">Skip the oldest N items (empty = auto-detect)</label>
                <input id="tpm-skipCount" type="number" class="tpm-input" placeholder="0">
                <label class="tpm-label" for="tpm-spareLikes">Spare tweets with more than N likes (needs tweets.js)</label>
                <input id="tpm-spareLikes" type="number" class="tpm-input" placeholder="e.g. 100">
                <label class="tpm-label" for="tpm-skipDays">Spare tweets from the last N days</label>
                <input id="tpm-skipDays" type="number" class="tpm-input" placeholder="e.g. 30">
                <label class="tpm-check"><input type="checkbox" id="tpm-liveLikes"> Fetch live like counts from X (works with tweet-headers.js; one extra request per tweet)</label>
              </div>

              <div class="tpm-section">
                <h4>Auto-pause</h4>
                <p>Pause periodically to dodge rate limits and account locks.</p>
                <div class="tpm-row">
                  <div><label class="tpm-label">Pause after every N</label><input id="tpm-pauseEvery" type="number" class="tpm-input" value="190"></div>
                  <div><label class="tpm-label">Pause (minutes)</label><input id="tpm-pauseMinutes" type="number" class="tpm-input" value="15"></div>
                </div>
              </div>

              <div class="tpm-section">
                <h4>Other tools</h4>
                <div class="tpm-btns"><button id="tpm-exportBookmarks" class="tpm-btn tpm-btn-ghost" type="button">Export bookmarks</button></div>
                <div class="tpm-btns"><button id="tpm-slowDelete" class="tpm-btn tpm-btn-ghost" type="button">Slow delete without a file</button></div>
                <p style="margin-top:10px">Slow delete works straight from your profile (no export), ~4000/hour. Only deletes tweets authored by you.</p>
              </div>
              <div class="tpm-foot">Cleanup engine: TweetXer v0.9.4 (adapted)</div>`;

            UI.el('tpm-file').addEventListener('change', () => this.processFile(), false);
            UI.el('tpm-exportBookmarks').onclick = () => this.exportBookmarks();
            UI.el('tpm-slowDelete').onclick = () => this.slowDelete();

            // drag & drop
            const drop = UI.el('tpm-drop'), fileInput = UI.el('tpm-file');
            ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); drop.classList.add('tpm-dragover'); }));
            ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('tpm-dragover'); }));
            drop.addEventListener('drop', (e) => {
                if (e.dataTransfer.files?.length) { fileInput.files = e.dataTransfer.files; fileInput.dispatchEvent(new Event('change')); }
            });
        },

        info(text) { const el = UI.el('tpm-clean-info'); if (el) el.textContent = text; },

        readSettings() {
            const every = parseInt(UI.el('tpm-pauseEvery')?.value, 10);
            this.pauseEvery = isNaN(every) ? 190 : every;
            const mins = parseFloat(UI.el('tpm-pauseMinutes')?.value);
            this.pauseMinutes = isNaN(mins) ? 15 : mins;
            const likes = parseInt(UI.el('tpm-spareLikes')?.value, 10);
            this.spareThreshold = isNaN(likes) ? 0 : likes;
            this.liveLikes = !!UI.el('tpm-liveLikes')?.checked;
        },

        createProgressBar() {
            const drop = UI.el('tpm-drop'); if (drop) drop.style.display = 'none';
            this.startTime = Date.now();
            this.startCount = this.dCount;
            const area = UI.el('tpm-clean-progress');
            area.innerHTML = `
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin:6px 0">
                <span style="font-size:13px;color:var(--muted);font-weight:600">Progress</span>
                <span class="tpm-pct" id="tpm-pct">0%</span>
              </div>
              <div class="tpm-track"><div class="tpm-fill" id="tpm-fill" style="background:linear-gradient(90deg,var(--acc),#5cc0ff)"></div></div>
              <div style="display:flex;justify-content:space-between;gap:8px;margin-top:8px;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums">
                <span id="tpm-cnt">0 / 0</span><span id="tpm-rate">—</span><span id="tpm-eta">ETA —</span>
              </div>`;
            this.updateProgressBar();
        },

        updateProgressBar() {
            if (!UI.el('tpm-fill')) return;
            const total = this.total || 0;
            const pct = total > 0 ? Math.min(100, (this.dCount / total) * 100) : 0;
            UI.el('tpm-fill').style.width = `${pct}%`;
            UI.el('tpm-pct').textContent = `${pct >= 100 ? '100' : pct.toFixed(1)}%`;
            UI.el('tpm-cnt').textContent = `${this.dCount.toLocaleString()} / ${total.toLocaleString()}`;
            const elapsed = (Date.now() - this.startTime) / 1000;
            const done = this.dCount - this.startCount;
            const rate = (done > 0 && elapsed > 0) ? done / elapsed : 0;
            UI.el('tpm-rate').textContent = rate <= 0 ? '—' : (rate >= 1 ? `${rate.toFixed(1)}/s` : `${(rate * 60).toFixed(0)}/min`);
            const remaining = Math.max(0, total - this.dCount);
            UI.el('tpm-eta').textContent = `ETA ${rate > 0 ? Core.fmtDuration(remaining / rate) : '—'}`;
            this.info(`Working… most recent ID: ${this.tId || '—'}`);
        },

        filterByLikes(entries) {
            if (UI.el('tpm-liveLikes')?.checked) return entries;
            const spareLikes = parseInt(UI.el('tpm-spareLikes')?.value, 10) || 0;
            if (spareLikes <= 0) return entries;
            if (!entries.length || entries[0].tweet.favorite_count === undefined) {
                this.info('This file has no like counts. Use tweets.js to spare tweets by likes.');
                return entries;
            }
            const before = entries.length;
            const kept = entries.filter(x => !(parseInt(x.tweet.favorite_count, 10) > spareLikes));
            console.log(`Sparing ${before - kept.length} tweet(s) with more than ${spareLikes} likes.`);
            return kept;
        },

        needsTweetsFileForLikes(json) {
            if (UI.el('tpm-liveLikes')?.checked) return false;
            const likes = parseInt(UI.el('tpm-spareLikes')?.value, 10);
            if (isNaN(likes) || likes <= 0) return false;
            return !json.length || json[0].tweet.favorite_count === undefined;
        },

        promptForTweetsFile() {
            this.info('Like-based sparing needs like counts, which tweet-headers.js lacks. Select tweets.js instead, or enable "Fetch live like counts".');
            const strong = document.querySelector('#tpm-drop strong'); if (strong) strong.textContent = 'Now choose tweets.js';
            const span = document.querySelector('#tpm-drop span'); if (span) span.innerHTML = 'tweets.js holds the like counts needed to spare popular tweets';
            const drop = UI.el('tpm-drop'); if (drop) drop.style.display = '';
        },

        filterByDays(ids) {
            const days = parseInt(UI.el('tpm-skipDays')?.value, 10) || 0;
            if (days <= 0) return ids;
            const cutoff = Date.now() - days * 86400000;
            const epoch = Core.snowflakeEpoch;
            const before = ids.length;
            const kept = ids.filter(id => { try { return Number((BigInt(id) >> 22n) + epoch) < cutoff; } catch (_) { return true; } });
            console.log(`Sparing ${before - kept.length} tweet(s) from the last ${days} day(s).`);
            return kept;
        },

        async maybePause() {
            if (!this.pauseEvery || this.pauseEvery <= 0) return;
            const done = this.dCount - this.startCount;
            if (done <= 0 || done % this.pauseEvery !== 0) return;
            let remaining = Math.round(this.pauseMinutes * 60);
            while (remaining > 0) {
                this.info(`Pausing ${Core.fmtDuration(remaining)} after ${done.toLocaleString()} deletions to avoid rate limits…`);
                await Core.sleep(1000); remaining--;
            }
        },

        async getLikeCount(id) {
            const variables = JSON.stringify({ tweetId: id, withCommunity: false, includePromotedContent: false, withVoice: false });
            const features = JSON.stringify({
                creator_subscriptions_tweet_preview_api_enabled: true, communities_web_enable_tweet_community_results_fetch: true,
                c9s_tweet_anatomy_moderator_badge_enabled: true, articles_preview_enabled: true, responsive_web_edit_tweet_api_enabled: true,
                graphql_is_translatable_rweb_tweet_is_translatable_enabled: true, view_counts_everywhere_api_enabled: true,
                longform_notetweets_consumption_enabled: true, responsive_web_twitter_article_tweet_consumption_enabled: true,
                tweet_awards_web_tipping_enabled: false, creator_subscriptions_quote_tweet_preview_enabled: false,
                freedom_of_speech_not_reach_fetch_enabled: true, standardized_nudges_misinfo: true,
                tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true, rweb_video_timestamps_enabled: true,
                longform_notetweets_rich_text_read_enabled: true, longform_notetweets_inline_media_enabled: true,
                responsive_web_graphql_exclude_directive_enabled: true, verified_phone_label_enabled: false,
                responsive_web_graphql_skip_user_profile_image_extensions_enabled: false, responsive_web_graphql_timeline_navigation_enabled: true,
                responsive_web_enhance_cards_enabled: false, rweb_tipjar_consumption_enabled: true, premium_content_api_read_enabled: false,
                responsive_web_grok_analyze_button_fetch_trends_enabled: false, responsive_web_grok_analyze_post_followups_enabled: false,
                responsive_web_grok_share_attachment_enabled: false, profile_label_improvements_pcf_label_in_post_enabled: false,
                responsive_web_grok_image_annotation_enabled: false, tweetypie_unmention_optimization_enabled: true
            });
            const fieldToggles = JSON.stringify({ withArticleRichContentState: true, withArticlePlainText: false, withGrokAnalyze: false, withDisallowedReplyControls: false });
            const url = `${Core.baseUrl}/i/api/graphql/${this.tweetResultQueryId}/TweetResultByRestId?` + new URLSearchParams({ variables, features, fieldToggles });
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const response = await fetch(url, {
                        headers: Core.apiHeaders(), referrer: `${Core.baseUrl}/${Core.username}`,
                        referrerPolicy: 'strict-origin-when-cross-origin', method: 'GET', mode: 'cors',
                        credentials: 'include', signal: AbortSignal.timeout(5000)
                    });
                    if (response.status === 200) {
                        const data = await response.json();
                        let result = data?.data?.tweetResult?.result;
                        if (result && result.tweet) result = result.tweet;
                        const likes = result?.legacy?.favorite_count;
                        return likes == null ? null : parseInt(likes, 10);
                    }
                    if (response.status === 429) {
                        const reset = parseInt(response.headers.get('x-rate-limit-reset'), 10);
                        let s = reset ? reset - Math.floor(Date.now() / 1000) : 60;
                        while (s > 0) { this.info(`Ratelimited reading likes. Waiting ${s}s. ${this.dCount} deleted.`); await Core.sleep(1000); s = reset ? reset - Math.floor(Date.now() / 1000) : s - 1; }
                        continue;
                    }
                    console.log(`Like lookup failed (HTTP ${response.status}). Update tweetResultQueryId if this persists.`);
                    return null;
                } catch (error) { console.log('Like lookup error:', error); return null; }
            }
            return null;
        },

        processFile() {
            const tn = UI.el('tpm-file');
            if (!(tn.files && tn.files[0])) return;
            const self = this;
            const fr = new FileReader();
            fr.onloadend = function (evt) {
                const cutpoint = evt.target.result.indexOf('= ');
                const filestart = evt.target.result.slice(0, cutpoint);
                const json = JSON.parse(evt.target.result.slice(cutpoint + 1));

                if (filestart.includes('.tweet_headers.')) {
                    if (self.needsTweetsFileForLikes(json)) { self.promptForTweetsFile(); return; }
                    self.action = 'untweet';
                    self.tIds = self.filterByDays(self.filterByLikes(json).map(x => x.tweet.tweet_id));
                } else if (filestart.includes('.tweets.') || filestart.includes('.tweet.')) {
                    self.action = 'untweet';
                    self.tIds = self.filterByDays(self.filterByLikes(json).map(x => x.tweet.id_str));
                } else if (filestart.includes('.like.')) {
                    self.action = 'unfav';
                    self.tIds = json.map(x => x.like.tweetId);
                } else if (filestart.includes('.direct_message_headers.') || filestart.includes('.direct_message_group_headers.') ||
                    filestart.includes('.direct_messages.') || filestart.includes('.direct_message_groups.')) {
                    self.action = 'undm';
                    if (self.deleteDMsOneByOne) {
                        self.tIds = json.map(c => c.dmConversation.messages.map(m => m.messageCreate ? m.messageCreate.id : 0)).flat().filter(i => i != 0);
                    } else {
                        self.tIds = json.map(c => c.dmConversation.conversationId);
                    }
                } else {
                    self.info('File content not recognized. Use a file from the Twitter data export.');
                }

                if (self.action.length > 0) {
                    self.readSettings();
                    self.total = self.tIds.length;
                    self.createProgressBar();
                }

                if (self.action === 'untweet') {
                    self.ensureTweetCount().then(() => {
                        const skipVal = UI.el('tpm-skipCount').value;
                        if (skipVal.length < 1) {
                            self.skip = Math.max(0, self.total - self.TweetCount - parseInt(self.total / 20));
                        } else self.skip = parseInt(skipVal, 10);
                        console.log(`Skipping oldest ${self.skip} Tweets.`);
                        self.tIds.reverse();
                        self.tIds = self.tIds.slice(self.skip);
                        self.dCount = self.skip;
                        self.tIds.reverse();
                        self.deleteTweets();
                    });
                } else if (self.action === 'unfav') {
                    self.skip = UI.el('tpm-skipCount').value.length > 0 ? parseInt(UI.el('tpm-skipCount').value, 10) : 0;
                    self.tIds = self.tIds.slice(self.skip);
                    self.dCount = self.skip;
                    self.tIds.reverse();
                    self.deleteFavs();
                } else if (self.action === 'undm') {
                    self.skip = UI.el('tpm-skipCount').value.length > 0 ? parseInt(UI.el('tpm-skipCount').value, 10) : 0;
                    self.tIds = self.tIds.slice(self.skip);
                    self.dCount = self.skip;
                    self.tIds.reverse();
                    if (self.deleteDMsOneByOne) self.deleteDMs(); else self.deleteConvos();
                }
            };
            fr.readAsText(tn.files[0]);
        },

        // Lazily detect the profile tweet count (used to auto-skip already-deleted
        // tweets). Navigates to the profile only when needed.
        async ensureTweetCount() {
            if (this.TweetCount) return;
            try {
                await Core.waitForElem('header', 4000);
                const extract = (selector) => {
                    const el = document.querySelector(selector);
                    if (!el) return null;
                    const m = el.textContent.match(/((\d|,|\.|K)+) (\w+)$/);
                    if (!m) return null;
                    return m[1].replace(/\.(\d+)K/, '$1'.padEnd(4, '0')).replace('K', '000').replace(',', '').replace('.', '');
                };
                this.TweetCount = extract('[data-testid="primaryColumn"]>div>div>div') ||
                    extract('[data-testid="TopNavBar"]>div>div') || 1000000;
                console.log(this.TweetCount + ' Tweets on profile.');
            } catch (_) {
                this.TweetCount = 1000000;
            }
        },

        async sendRequest(url, body = `{"variables":{"tweet_id":"${this.tId}","dark_request":false},"queryId":"${url.split('/')[6]}"}`) {
            return new Promise(async (resolve) => {
                try {
                    const response = await fetch(url, {
                        headers: Core.apiHeaders(), referrer: `${Core.baseUrl}/${Core.username}/with_replies`,
                        referrerPolicy: 'strict-origin-when-cross-origin', body, method: 'POST', mode: 'cors',
                        credentials: 'include', signal: AbortSignal.timeout(5000)
                    });
                    if (response.status === 200) {
                        this.dCount++; this.updateProgressBar(); await this.maybePause();
                        if (response.headers.get('x-rate-limit-remaining') != null && response.headers.get('x-rate-limit-remaining') < 1) {
                            this.ratelimitreset = response.headers.get('x-rate-limit-reset');
                            let s = this.ratelimitreset - Math.floor(Date.now() / 1000);
                            while (s > 0) { s = this.ratelimitreset - Math.floor(Date.now() / 1000); this.info(`Ratelimited. Waiting ${s}s. ${this.dCount} deleted.`); await Core.sleep(1000); }
                            resolve('deleted and waiting');
                        } else resolve('deleted');
                    } else if (response.status === 429) {
                        this.tIds.push(this.tId); await Core.sleep(1000);
                    } else { console.log(response); resolve('error'); }
                } catch (error) {
                    if (error.name === 'AbortError' || error.Name === 'AbortError') {
                        this.tIds.push(this.tId);
                        let s = 15; while (s > 0) { s--; this.info(`Timeout. Waiting ${s}s. ${this.dCount} deleted.`); await Core.sleep(1000); }
                    }
                    resolve('error');
                }
            });
        },

        async deleteTweets() {
            while (this.tIds.length > 0) {
                this.tId = this.tIds.pop();
                if (this.liveLikes && this.spareThreshold > 0) {
                    const likes = await this.getLikeCount(this.tId);
                    if (likes !== null && likes > this.spareThreshold) {
                        this.sparedCount++; if (this.total > 0) this.total--;
                        console.log(`Spared ${this.tId} (${likes} likes).`); this.updateProgressBar(); continue;
                    }
                }
                await this.sendRequest(Core.baseUrl + this.deleteURL);
            }
            this.tId = ''; this.updateProgressBar();
            this.info(`Done. Deleted ${this.dCount.toLocaleString()} tweets.`);
        },

        async deleteFavs() {
            while (this.tIds.length > 0) { this.tId = this.tIds.pop(); await this.sendRequest(Core.baseUrl + this.unfavURL); }
            this.tId = ''; this.updateProgressBar(); this.info(`Done. Removed ${this.dCount.toLocaleString()} likes.`);
        },

        async deleteDMs() {
            while (this.tIds.length > 0) {
                this.tId = this.tIds.pop();
                await this.sendRequest(Core.baseUrl + this.deleteMessageURL, `{"variables":{"messageId":"${this.tId}"},"requestId":""}`);
            }
            this.tId = ''; this.updateProgressBar();
        },

        async deleteConvos() {
            while (this.tIds.length > 0) {
                this.tId = this.tIds.pop();
                const url = Core.baseUrl + this.deleteConvoURL.replace('USER_ID-CONVERSATION_ID', this.tId);
                const response = await fetch(url, {
                    headers: Core.apiHeaders('application/x-www-form-urlencoded'), referrer: `${Core.baseUrl}/messages`,
                    body: 'dm_secret_conversations_enabled=false&krs_registration_enabled=true&cards_platform=Web-12&include_cards=1&include_ext_alt_text=true&include_ext_limited_action_results=true&include_quote_count=true&include_reply_count=1&tweet_mode=extended&include_ext_views=true&dm_users=false&include_groups=true&include_inbox_timelines=true&include_ext_media_color=true&supports_reactions=true&supports_edit=true&include_conversation_info=true',
                    method: 'POST', mode: 'cors', credentials: 'include', signal: AbortSignal.timeout(5000)
                });
                if (response.status === 204) {
                    this.dCount++; this.updateProgressBar(); await this.maybePause();
                    if (response.headers.get('x-rate-limit-remaining') != null && response.headers.get('x-rate-limit-remaining') < 1) {
                        this.ratelimitreset = response.headers.get('x-rate-limit-reset');
                        let s = this.ratelimitreset - Math.floor(Date.now() / 1000);
                        while (s > 0) { s = this.ratelimitreset - Math.floor(Date.now() / 1000); this.info(`Ratelimited. Waiting ${s}s. ${this.dCount} deleted.`); await Core.sleep(1000); }
                    }
                    await Core.sleep(Math.floor(Math.random() * 200));
                } else if (response.status === 429 || response.status === 420) {
                    this.tIds.push(this.tId);
                    let s = 300; while (s > 0) { s--; this.info(`Ratelimited. Waiting ${s}s. ${this.dCount} deleted.`); await Core.sleep(1000); }
                } else console.log(response);
            }
            this.tId = ''; this.updateProgressBar();
        },

        async exportBookmarks() {
            this.info('Exporting bookmarks…');
            let variables = '';
            this.bookmarks = []; this.bookmarksNext = ''; this.dCount = 0;
            while (this.bookmarksNext.length > 0 || this.bookmarks.length === 0) {
                variables = this.bookmarksNext.length > 0
                    ? `{"count":20,"cursor":"${this.bookmarksNext}","includePromotedContent":false}`
                    : '{"count":20,"includePromotedContent":false}';
                const response = await fetch(Core.baseUrl + this.bookmarksURL + new URLSearchParams({
                    variables,
                    features: '{"graphql_timeline_v2_bookmark_timeline":true,"rweb_tipjar_consumption_enabled":true,"responsive_web_graphql_exclude_directive_enabled":true,"verified_phone_label_enabled":false,"creator_subscriptions_tweet_preview_api_enabled":true,"responsive_web_graphql_timeline_navigation_enabled":true,"responsive_web_graphql_skip_user_profile_image_extensions_enabled":false,"communities_web_enable_tweet_community_results_fetch":true,"c9s_tweet_anatomy_moderator_badge_enabled":true,"articles_preview_enabled":true,"responsive_web_edit_tweet_api_enabled":true,"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"view_counts_everywhere_api_enabled":true,"longform_notetweets_consumption_enabled":true,"responsive_web_twitter_article_tweet_consumption_enabled":true,"tweet_awards_web_tipping_enabled":false,"creator_subscriptions_quote_tweet_preview_enabled":false,"freedom_of_speech_not_reach_fetch_enabled":true,"standardized_nudges_misinfo":true,"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":true,"rweb_video_timestamps_enabled":true,"longform_notetweets_rich_text_read_enabled":true,"longform_notetweets_inline_media_enabled":true,"responsive_web_enhance_cards_enabled":false}'
                }), { headers: Core.apiHeaders(), referrer: `${Core.baseUrl}/i/bookmarks`, referrerPolicy: 'strict-origin-when-cross-origin', method: 'GET', mode: 'cors', credentials: 'include' });

                if (response.status === 200) {
                    const data = await response.json();
                    data.data.bookmark_timeline_v2.timeline.instructions[0].entries.forEach((item) => {
                        if (item.entryId.includes('tweet')) { this.dCount++; this.bookmarks.push(item.content.itemContent.tweet_results.result); }
                        else if (item.entryId.includes('cursor-bottom')) { this.bookmarksNext = this.bookmarksNext !== item.content.value ? item.content.value : ''; }
                    });
                    this.info(`${this.dCount} bookmarks collected`);
                } else console.log(response);

                if (!response.headers.get('x-rate-limit-remaining') && response.headers.get('x-rate-limit-remaining') < 1) {
                    this.ratelimitreset = response.headers.get('x-rate-limit-reset');
                    let s = this.ratelimitreset - Math.floor(Date.now() / 1000);
                    while (s > 0) { s = this.ratelimitreset - Math.floor(Date.now() / 1000); this.info(`Ratelimited. Waiting ${s}s. ${this.dCount} collected.`); await Core.sleep(1000); }
                }
            }
            const blob = new Blob([JSON.stringify(this.bookmarks)], { type: 'text/plain' });
            const a = document.createElement('a');
            a.innerText = 'Download bookmarks';
            a.href = window.URL.createObjectURL(blob);
            a.download = 'twitter-bookmarks.json';
            a.style.display = 'block'; a.style.marginTop = '10px';
            UI.el('tpm-clean-info').after(a);
            this.info(`Done — ${this.bookmarks.length} bookmarks ready to download.`);
        },

        tweetAuthorHandle(tweetEl) {
            const nameEl = tweetEl.querySelector('[data-testid="User-Name"]');
            const m = nameEl && nameEl.textContent.match(/@(\w+)/);
            return m ? m[1].toLowerCase() : null;
        },

        likesFromTweetElement(tweetEl) {
            const group = tweetEl.querySelector('[role="group"][aria-label]');
            const label = group ? group.getAttribute('aria-label') : '';
            const m = label.match(/([\d.,]+)\s*(K|M)?\s+like/i);
            if (!m) return 0;
            let n = parseFloat(m[1].replace(/,/g, ''));
            if (m[2] === 'K') n *= 1000; else if (m[2] === 'M') n *= 1000000;
            return Math.round(n);
        },

        async slowDelete() {
            this.readSettings();
            const drop = UI.el('tpm-drop'); if (drop) drop.style.display = 'none';
            await this.ensureTweetCount();
            this.total = this.TweetCount;
            this.createProgressBar();

            const list = document.querySelectorAll('[data-testid="ScrollSnap-List"] a');
            if (list[1]) list[1].click();
            await Core.sleep(2000);

            let consecutiveErrors = 0;
            const maxConsecutiveErrors = 8;
            const more = '[data-testid="tweet"] [data-testid="caret"]';
            let emptyScans = 0;
            const maxEmptyScans = 12;

            while (true) {
                await Core.sleep(1200);
                document.querySelectorAll('section [data-testid="cellInnerDiv"]>div>div>div').forEach(x => x.remove());
                document.querySelectorAll('section [data-testid="cellInnerDiv"]>div>div>[role="link"]').forEach(x => x.remove());

                if (document.querySelectorAll(more).length === 0) {
                    const retry = Array.from(document.querySelectorAll('[role="button"], button')).find(b => /retry|try again|reload/i.test(b.textContent));
                    if (retry) retry.click();
                    window.scrollTo(0, document.body.scrollHeight);
                    if (++emptyScans >= maxEmptyScans) break;
                    await Core.sleep(6000); continue;
                }
                emptyScans = 0;

                const caretEl = document.querySelector(more);
                const tweetEl = caretEl ? caretEl.closest('[data-testid="tweet"]') : document.querySelector('[data-testid="tweet"]');

                if (tweetEl && Core.username) {
                    const author = this.tweetAuthorHandle(tweetEl);
                    if (author && author !== Core.username.toLowerCase()) { tweetEl.remove(); continue; }
                }
                if (tweetEl && this.spareThreshold > 0) {
                    const likes = this.likesFromTweetElement(tweetEl);
                    if (likes > this.spareThreshold) { this.sparedCount++; if (this.total > 0) this.total--; tweetEl.remove(); this.updateProgressBar(); continue; }
                }

                try {
                    const moreElement = document.querySelector(more);
                    if (moreElement) moreElement.scrollIntoView({ behavior: 'smooth' });

                    const unretweet = document.querySelector('[data-testid="unretweet"]');
                    if (unretweet) {
                        unretweet.click();
                        const confirmURT = await Core.waitForElem('[data-testid="unretweetConfirm"]');
                        if (!confirmURT) throw new Error('unretweet confirmation did not appear');
                        confirmURT.click();
                    } else {
                        const caret = await Core.waitForElem(more);
                        if (!caret) throw new Error('tweet menu button did not appear');
                        caret.click();
                        const menu = await Core.waitForElem('[role="menuitem"]');
                        if (!menu) throw new Error('tweet menu did not open');
                        if (menu.textContent.includes('@')) {
                            caret.click();
                            const notMine = document.querySelector('[data-testid="tweet"]'); if (notMine) notMine.remove();
                        } else {
                            menu.click();
                            const confirmation = await Core.waitForElem('[data-testid="confirmationSheetConfirm"]');
                            if (!confirmation) throw new Error('delete confirmation did not appear');
                            confirmation.click();
                        }
                    }
                    this.dCount++; this.updateProgressBar(); await this.maybePause();
                    consecutiveErrors = 0;
                    if (this.dCount % 100 === 0) console.log(`${new Date().toUTCString()} Deleted ${this.dCount} Tweets`);
                } catch (error) {
                    consecutiveErrors++;
                    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                    const backoff = Math.min(60000, 4000 * consecutiveErrors);
                    this.info(`Hit a snag (likely a rate limit). Waiting ${Math.round(backoff / 1000)}s. ${this.dCount} deleted.`);
                    await Core.sleep(backoff);
                    if (consecutiveErrors >= maxConsecutiveErrors) break;
                }
            }
            this.info(`Finished. Total deleted: ${this.dCount} Tweets. Reload to confirm.`);
        }
    };

    /* ===================================================================== *
     *  ABOUT                                                                  *
     * ===================================================================== */
    const About = {
        render() {
            UI.el('tpm-pane-about').innerHTML = `
              <div class="tpm-section">
                <h4>What is tweepcred?</h4>
                <p>Tweepcred is X/Twitter's internal reputation score (0–100). It's derived from a PageRank over the follow graph and adjusted by signals like your follower/following ratio, account age, profile completeness and safety flags. Accounts under roughly <strong>65</strong> have fewer of their tweets included in the search index.</p>
              </div>
              <div class="tpm-section">
                <h4>How this toolkit helps</h4>
                <ul>
                  <li><strong>Dashboard</strong> estimates your score and what to fix.</li>
                  <li><strong>Unfollow</strong> repairs your follower/following ratio — the biggest lever.</li>
                  <li><strong>Cleanup</strong> removes old, low-engagement tweets that drag down your average.</li>
                </ul>
              </div>
              <div class="tpm-section">
                <h4>Credits</h4>
                <p>Unfollow engine by <strong>Shayan Taherkhani</strong>. Cleanup engine (TweetXer) by <strong>Luca Hammer</strong> and contributors. Unified into Tweepcred Manager by HyperboreanSlug. See CREDITS.md.</p>
              </div>
              <div class="tpm-warn-box">Automating X is against its Terms of Service and may get your account locked or banned. Everything here runs locally in your browser using your own logged-in session. Use conservative settings, at your own risk.</div>
              <div class="tpm-foot">Tweepcred Manager v${Core.version}</div>`;
        }
    };

    /* ===================================================================== *
     *  BOOTSTRAP                                                               *
     * ===================================================================== */
    Core.init();
    UI.build();
    Dashboard.render();
    Dashboard.firstShow = false;
    Dashboard.autofill();
    Unfollow.render(); Unfollow.firstShow = false; Unfollow.checkLocation();
    Cleanup.render(); Cleanup.firstShow = false;
    About.render();
    UI.switchTab('dashboard');

    console.log(`%c🧭 Tweepcred Manager v${Core.version} ready. @${Core.username || '?'}`, 'color:#1d9bf0;font-weight:bold;font-size:14px');
})();
