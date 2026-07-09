/**
 * @module unfollow
 * @see docs/modules/unfollow.md
 */
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
                <label class="tpm-check"><input type="checkbox" id="tpm-unf-mutuals" ${s.get('unf.mutuals', true) ? 'checked' : ''}> Preserve mutual followers (never unfollow people who follow you back)</label>
                <label class="tpm-check"><input type="checkbox" id="tpm-unf-private" ${s.get('unf.private', true) ? 'checked' : ''}> Skip private / locked accounts</label>
              </div>

              <div class="tpm-section">
                <h4>Whitelist — never unfollow these</h4>
                <p>One @handle per line (or comma-separated). Saved on this browser.</p>
                <textarea id="tpm-unf-white" class="tpm-input" placeholder="@friend&#10;@favbrand">${Core.escapeHtml((s.get('unf.white', []) || []).map(u => '@' + u).join('\n'))}</textarea>
              </div>

              <div class="tpm-section">
                <h4>Posted-word filter (X search)</h4>
                <p>For each followed account, runs an X search (<code>from:user "term"</code>) to check whether they have ever <strong>posted</strong> any of your terms, then either protects or targets them. Built for research groups studying the prevalence of hate speech and other content on the platform. Each term is matched as an exact phrase; comma- or newline-separated. One search request per account (counts toward rate limits).</p>
                <label class="tpm-label" for="tpm-unf-kw">Terms to search for in their posts</label>
                <textarea id="tpm-unf-kw" class="tpm-input" placeholder="term one, term two">${Core.escapeHtml(s.get('unf.kw', '') || '')}</textarea>
                <label class="tpm-label" for="tpm-unf-kw-action">When an account has posted a term</label>
                <select id="tpm-unf-kw-action" class="tpm-input">
                  <option value="off">Do nothing (filter off)</option>
                  <option value="protect">Protect — never unfollow accounts that posted it</option>
                  <option value="target">Target — only act on accounts that posted it</option>
                </select>
                <p class="tpm-note" id="tpm-unf-kw-note"></p>
              </div>

              <div class="tpm-btns">
                <button class="tpm-btn tpm-btn-ghost" id="tpm-unf-audit" type="button">Scan only (audit)</button>
                <button class="tpm-btn tpm-btn-primary" id="tpm-unf-start" type="button">Start unfollowing</button>
              </div>
              <div class="tpm-btns">
                <button class="tpm-btn tpm-btn-ghost" id="tpm-unf-report" type="button">Scan for posted words → report (no unfollows)</button>
              </div>
              <div id="tpm-unf-report-out" style="display:none"></div>
              <div class="tpm-btns" id="tpm-unf-live" style="display:none">
                <button class="tpm-btn tpm-btn-warn" id="tpm-unf-pause" type="button">Pause</button>
                <button class="tpm-btn tpm-btn-danger" id="tpm-unf-stop" type="button">Stop</button>
              </div>
              <div class="tpm-status idle" id="tpm-unf-status">Idle</div>
              <div class="tpm-note">Stays under X rate limits with human-like random delays. Continuous high-volume unfollowing is exactly what X's automation detection watches for — stop for the day if you see a "you're doing that too much" warning.</div>`;

            UI.el('tpm-unf-cont').addEventListener('change', (e) => {
                UI.el('tpm-unf-cooldownrow').style.display = e.target.checked ? '' : 'none';
            });
            // Restore saved keyword action and keep a plain-language note in sync.
            const kwAction = UI.el('tpm-unf-kw-action');
            kwAction.value = s.get('unf.kwAction', 'off');
            const kwNote = () => {
                const map = {
                    off: 'Filter is off. The terms field is ignored.',
                    protect: 'Accounts that have posted a term will be SKIPPED (kept). Use this to preserve a study cohort while you trim everyone else.',
                    target: 'ONLY accounts that have posted a term will be unfollowed. Others are skipped. Use Scan only to preview the matched set before acting.'
                };
                UI.el('tpm-unf-kw-note').textContent = map[kwAction.value] || '';
            };
            kwAction.addEventListener('change', kwNote);
            kwNote();
            UI.el('tpm-unf-audit').onclick = () => this.audit();
            UI.el('tpm-unf-start').onclick = () => this.start();
            UI.el('tpm-unf-report').onclick = () => this.reportPostedWords();
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
            this.preserveMutuals = UI.el('tpm-unf-mutuals').checked;
            this.whitelist = new Set(
                (UI.el('tpm-unf-white').value.match(/[A-Za-z0-9_]+/g) || []).map(u => u.toLowerCase())
            );

            // Posted-word filter (X search): terms the account may have posted.
            const kwRaw = UI.el('tpm-unf-kw').value || '';
            this.kwAction = UI.el('tpm-unf-kw-action').value;        // off | protect | target
            this.kwTerms = kwRaw.split(/[\n,]+/).map(t => t.trim()).filter(Boolean);
            if (this.kwAction !== 'off' && this.kwTerms.length === 0) this.kwAction = 'off';

            const s = Core.store;
            s.set('unf.max', this.MAX); s.set('unf.mind', this.MIN_DELAY / 1000); s.set('unf.maxd', this.MAX_DELAY / 1000);
            s.set('unf.cont', this.continuous); s.set('unf.cmin', this.PAUSE_MIN / 60000); s.set('unf.cmax', this.PAUSE_MAX / 60000);
            s.set('unf.private', this.skipPrivate); s.set('unf.mutuals', this.preserveMutuals); s.set('unf.white', [...this.whitelist]);
            s.set('unf.kw', kwRaw); s.set('unf.kwAction', UI.el('tpm-unf-kw-action').value);
        },

        // Has this account ever POSTED one of the configured terms? Runs an X
        // search (from:user "term"). Returns true/false, or null if the search
        // couldn't be completed (so the caller can skip rather than mis-act).
        async keywordMatches(_cell, username) {
            if (!this.kwTerms || !this.kwTerms.length) return false;
            const r = await Core.userPostedTerm(username, this.kwTerms);
            if (r == null) return null;
            return r.matched;
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

            const kwOn = this.kwAction && this.kwAction !== 'off';
            const seen = new Set();
            const kwMatches = [];
            let mutuals = 0, nonFollowers = 0, privates = 0, whitelisted = 0, kwMatched = 0, empty = 0;
            while (!this.stop && empty < 8) {
                await this.waitWhilePaused();
                const cells = Array.from(document.querySelectorAll('[data-testid="UserCell"], [data-testid="cellInnerDiv"]'));
                let found = false;
                for (const cell of cells) {
                    if (!cell.querySelector('a[href^="/"]')) continue;
                    const u = Follow.getUsername(cell);
                    if (u === 'unknown' || seen.has(u)) continue;
                    seen.add(u); found = true;
                    const uc = cell.matches?.('[data-testid="UserCell"]') ? cell
                        : (cell.querySelector?.('[data-testid="UserCell"]') || cell);
                    if (this.whitelist.has(u.toLowerCase())) whitelisted++;
                    else if (Follow.isMutual(uc)) mutuals++;
                    else if (Follow.isPrivate(uc)) privates++;
                    else nonFollowers++;
                    // Tally keyword matches when the filter is configured.
                    if (kwOn) {
                        uc.scrollIntoView({ block: 'center', behavior: 'instant' });
                        const m = await this.keywordMatches(uc, u);
                        if (m === true) { kwMatched++; kwMatches.push(u); console.log(`%c[audit] keyword match: @${u}`, 'color:#f4212e'); }
                    }
                    this.setStats(nonFollowers, mutuals + privates + whitelisted, kwOn ? kwMatched : '—');
                    this.setNow(`Scanned <strong>${seen.size}</strong>${kwOn ? ` · <strong>${kwMatched}</strong> keyword matches` : ''}…`);
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
            const kwLine = kwOn ? ` · <strong>${kwMatched}</strong> keyword matches` : '';
            this.setNow(`<strong>${seen.size}</strong> scanned · <strong>${nonFollowers}</strong> non-followers · ${mutuals} mutuals · ${privates} private · ${whitelisted} whitelisted${kwLine}`);
            console.table({ scanned: seen.size, nonFollowers, mutuals, privates, whitelisted, keywordMatches: kwMatched });
            if (kwOn) console.log('Keyword-matched accounts:', kwMatches);
            this.finishUI();
        },

        // Report-only scan: walk the open follow list, search each account's posts
        // for the configured terms, and produce a downloadable list of positive
        // hits. Never unfollows anyone. For research/monitoring use.
        async reportPostedWords() {
            if (this.running) return;
            this.readSettings();
            if (!this.kwTerms || !this.kwTerms.length) {
                this.setStatus('stop', '⚠️ Enter at least one term first');
                return;
            }
            this.running = true; this.stop = false; this.paused = false;
            UI.el('tpm-unf-audit').disabled = true;
            UI.el('tpm-unf-start').disabled = true;
            UI.el('tpm-unf-report').disabled = true;
            UI.el('tpm-unf-live').style.display = 'flex';
            UI.el('tpm-unf-pause').textContent = 'Pause';
            this.setStatus('run', '🔍 Searching posts (no unfollows)…');
            console.log(`%c[report] Searching followed accounts for: ${this.kwTerms.join(', ')}`, 'color:#1d9bf0;font-weight:bold');

            const seen = new Set();
            const hits = [];          // { username, term, scannedAt }
            let scanned = 0, errors = 0, empty = 0;
            const MAX_EMPTY = 8;

            while (!this.stop && empty < MAX_EMPTY) {
                await this.waitWhilePaused();
                if (this.stop) break;
                const cells = Array.from(document.querySelectorAll('[data-testid="UserCell"], [data-testid="cellInnerDiv"]'));
                let found = false;
                for (const cell of cells) {
                    if (this.stop) break;
                    await this.waitWhilePaused();
                    if (!cell.querySelector('a[href^="/"]')) continue;
                    const u = Follow.getUsername(cell);
                    if (u === 'unknown' || seen.has(u)) continue;
                    seen.add(u); found = true; scanned++;

                    const r = await Core.userPostedTerm(u, this.kwTerms);
                    if (r == null) {
                        errors++;
                        this.logAction(u, 'error', 'Post search failed');
                    } else if (r.matched) {
                        hits.push({ username: u, term: r.term, time: new Date().toISOString() });
                        console.log(`%c[report] HIT @${u} — posted "${r.term}"`, 'color:#f4212e;font-weight:bold');
                    }
                    this.setStats(hits.length, scanned, errors);
                    this.setNow(`Searched <strong>${scanned}</strong> · <strong>${hits.length}</strong> hits${errors ? ` · ${errors} errors` : ''}`);

                    // Pace search requests to stay under the rate limit.
                    await Core.sleep(this.MIN_DELAY);
                }
                if (!found) {
                    empty++;
                    const last = cells[cells.length - 1];
                    if (last) last.scrollIntoView({ block: 'end', behavior: 'instant' });
                    window.scrollBy(0, 800);
                    await Core.sleep(1200);
                } else { empty = 0; }
            }

            this.setStatus('idle', '✅ Report complete');
            this.setNow(`Searched <strong>${scanned}</strong> accounts · <strong>${hits.length}</strong> posted a term${errors ? ` · ${errors} errors` : ''}`);
            console.table(hits);
            this.renderReport(hits, scanned, errors);
            this.finishUI();
            UI.el('tpm-unf-report').disabled = false;
        },

        // Render the hit list with copy + CSV/JSON download (no network, no deletes).
        renderReport(hits, scanned, errors) {
            const out = UI.el('tpm-unf-report-out');
            if (!out) return;
            if (!hits.length) {
                out.style.display = '';
                out.innerHTML = `<div class="tpm-section"><h4>Report</h4><p>Searched ${scanned} accounts. No account posted any of the terms${errors ? ` (${errors} could not be searched)` : ''}.</p></div>`;
                return;
            }
            const rows = hits.map(h => `<li>@${Core.escapeHtml(h.username)} <span style="color:var(--muted)">— "${Core.escapeHtml(h.term)}"</span></li>`).join('');
            out.style.display = '';
            out.innerHTML = `
              <div class="tpm-section">
                <h4>Positive hits (${hits.length})</h4>
                <p>Searched ${scanned} accounts${errors ? `, ${errors} could not be searched` : ''}. No accounts were unfollowed.</p>
                <ul style="max-height:200px;overflow:auto;margin:0 0 10px;padding-left:18px">${rows}</ul>
                <div class="tpm-btns">
                  <button class="tpm-btn tpm-btn-ghost" id="tpm-unf-report-copy" type="button">Copy handles</button>
                  <button class="tpm-btn tpm-btn-ghost" id="tpm-unf-report-csv" type="button">Download CSV</button>
                  <button class="tpm-btn tpm-btn-ghost" id="tpm-unf-report-json" type="button">Download JSON</button>
                </div>
              </div>`;

            const download = (name, type, content) => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([content], { type }));
                a.download = name; a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            };
            UI.el('tpm-unf-report-copy').onclick = () => {
                navigator.clipboard?.writeText(hits.map(h => '@' + h.username).join('\n'));
                this.setStatus('idle', '📋 Handles copied');
            };
            UI.el('tpm-unf-report-csv').onclick = () => {
                const csv = 'username,matched_term,scanned_at\n' +
                    hits.map(h => `${h.username},"${(h.term || '').replace(/"/g, '""')}",${h.time}`).join('\n');
                download('posted-word-hits.csv', 'text/csv', csv);
            };
            UI.el('tpm-unf-report-json').onclick = () => {
                download('posted-word-hits.json', 'application/json', JSON.stringify(hits, null, 2));
            };
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

                // Resolve to the precise UserCell so the "Follows you" badge, the
                // username and the unfollow button all belong to the SAME account.
                // The matched node is frequently the outer cellInnerDiv wrapper.
                const cell = target.matches?.('[data-testid="UserCell"]')
                    ? target
                    : (target.querySelector?.('[data-testid="UserCell"]') || target);

                const lower = username.toLowerCase();
                if (this.whitelist.has(lower)) {
                    this.logAction(username, 'skipped', 'Whitelisted'); skipped++;
                    this.setStats(total, skipped, this.MAX - batchCount); continue;
                }

                // Render the cell BEFORE testing mutual/private status. X lazily
                // renders the "Follows you" badge, so checking an off-screen row
                // can miss it and unfollow a mutual. Scroll first, let it paint,
                // THEN check. (This ordering was the mutual-preservation bug.)
                cell.scrollIntoView({ block: 'center', behavior: 'instant' });
                await Core.sleep(400);

                if (this.preserveMutuals && Follow.isMutual(cell)) {
                    this.logAction(username, 'skipped', 'Mutual follow'); skipped++;
                    this.setStats(total, skipped, this.MAX - batchCount); continue;
                }
                if (this.skipPrivate && Follow.isPrivate(cell)) {
                    this.logAction(username, 'skipped', 'Private/locked'); skipped++;
                    this.setStats(total, skipped, this.MAX - batchCount); continue;
                }

                // Posted-word filter: protect (skip those who posted it) or target
                // (skip those who didn't). Runs an X search per account.
                if (this.kwAction && this.kwAction !== 'off') {
                    this.setNow(`Searching @${Core.escapeHtml(username)}'s posts…`);
                    const matched = await this.keywordMatches(cell, username);
                    if (matched === null) {
                        this.logAction(username, 'skipped', 'Post search failed (could not query)'); skipped++;
                        this.setStats(total, skipped, this.MAX - batchCount); continue;
                    }
                    if (this.kwAction === 'protect' && matched) {
                        this.logAction(username, 'skipped', 'Posted a term — protected'); skipped++;
                        this.setStats(total, skipped, this.MAX - batchCount); continue;
                    }
                    if (this.kwAction === 'target' && !matched) {
                        this.logAction(username, 'skipped', 'Never posted a term (target mode)'); skipped++;
                        this.setStats(total, skipped, this.MAX - batchCount); continue;
                    }
                }

                const btn = Follow.findUnfollowButton(cell);
                if (!btn) {
                    this.logAction(username, 'skipped', 'No unfollow button'); skipped++;
                    this.setStats(total, skipped, this.MAX - batchCount); continue;
                }

                // Final safety net: re-check on the live element immediately before
                // the click, in case the virtualized list re-rendered the row. A
                // mutual must never be unfollowed while preservation is on.
                if (this.preserveMutuals && Follow.isMutual(cell)) {
                    this.logAction(username, 'skipped', 'Mutual follow (guard)'); skipped++;
                    this.setStats(total, skipped, this.MAX - batchCount); continue;
                }

                this.setNow(`Processing <strong>@${Core.escapeHtml(username)}</strong>`);
                try {
                    const anchors = Array.from(cell.querySelectorAll('a'));
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
            const rep = UI.el('tpm-unf-report'); if (rep) rep.disabled = false;
            UI.el('tpm-unf-live').style.display = 'none';
        }
    };
