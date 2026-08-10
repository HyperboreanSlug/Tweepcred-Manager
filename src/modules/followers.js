/**
 * @module followers
 * @description Follower tracker + following list sorted by following-count.
 * @see docs/modules/followers.md
 */
    /* ===================================================================== *
     *  FOLLOWERS — snapshot tracker + sort following by following-count     *
     * ===================================================================== */
    const Followers = {
        firstShow: true,
        running: false,
        stopFlag: false,
        // In-memory working set for the current sorted following scan
        rows: [],
        // Sort: 'following_desc' | 'following_asc' | 'followers_desc' | 'name'
        sortMode: Core.store.get('followersSort', 'following_desc'),
        enrichDelayMs: 900,

        onShow() {
            if (this.firstShow) {
                this.render();
                this.firstShow = false;
            }
            this.refreshSnapshotSummary();
            this.checkLocation();
        },

        render() {
            const pane = UI.el('tpm-pane-followers');
            if (!pane) return;
            pane.innerHTML = `
              <div class="tpm-warn-box">Walks your Following / Followers pages and looks up public profile stats. Stay on the list page while scanning. Respect rate limits — enrichment uses UserByScreenName (~1 req/account).</div>

              <div class="tpm-section">
                <h4>Follower tracker (snapshots)</h4>
                <p>Save a snapshot of your <strong>Followers</strong> list, then compare later to see who followed or left. Data stays in this browser (<code>localStorage</code>).</p>
                <div class="tpm-stats" id="tpm-f-snap-stats">
                  <div class="tpm-stat"><div class="tpm-stat-v" id="tpm-f-snap-count">–</div><div class="tpm-stat-l">Last snapshot</div></div>
                  <div class="tpm-stat"><div class="tpm-stat-v" id="tpm-f-snap-when">–</div><div class="tpm-stat-l">Taken</div></div>
                  <div class="tpm-stat"><div class="tpm-stat-v" id="tpm-f-hist-n">0</div><div class="tpm-stat-l">History</div></div>
                </div>
                <div class="tpm-btns">
                  <button class="tpm-btn tpm-btn-primary" id="tpm-f-snap" type="button">Snapshot followers</button>
                  <button class="tpm-btn tpm-btn-ghost" id="tpm-f-diff" type="button">Diff vs previous</button>
                </div>
                <div id="tpm-f-diff-out" class="tpm-note" style="margin-top:10px"></div>
              </div>

              <div class="tpm-section">
                <h4>Following list — sort by following count</h4>
                <p>Scan accounts on your <strong>Following</strong> page, fetch each account's following count, and list them sorted. Does not unfollow anyone.</p>
                <label class="tpm-label" for="tpm-f-sort">Sort by</label>
                <select id="tpm-f-sort" class="tpm-input">
                  <option value="following_desc">Following count (high → low)</option>
                  <option value="following_asc">Following count (low → high)</option>
                  <option value="followers_desc">Followers count (high → low)</option>
                  <option value="name">Handle (A–Z)</option>
                </select>
                <label class="tpm-label" for="tpm-f-max">Max accounts to enrich (0 = all scanned)</label>
                <input id="tpm-f-max" type="number" class="tpm-input" min="0" value="${Core.store.get('followersMax', 200)}">
                <div class="tpm-btns">
                  <button class="tpm-btn tpm-btn-primary" id="tpm-f-scan" type="button">Scan &amp; sort following</button>
                  <button class="tpm-btn tpm-btn-ghost" id="tpm-f-stop" type="button" disabled>Stop</button>
                </div>
                <div class="tpm-btns">
                  <button class="tpm-btn tpm-btn-ghost" id="tpm-f-export" type="button" disabled>Export CSV</button>
                  <button class="tpm-btn tpm-btn-ghost" id="tpm-f-export-json" type="button" disabled>Export JSON</button>
                </div>
                <div class="tpm-status idle" id="tpm-f-status">Idle</div>
                <div class="tpm-now" id="tpm-f-now" style="display:none"></div>
              </div>

              <div class="tpm-section">
                <h4>Sorted results</h4>
                <div id="tpm-f-list" class="tpm-f-list"><p class="tpm-note">Run a scan to populate this table.</p></div>
              </div>
              <div class="tpm-foot">Follower tracker · v${Core.version}</div>`;

            UI.el('tpm-f-sort').value = this.sortMode;
            UI.el('tpm-f-sort').onchange = () => {
                this.sortMode = UI.el('tpm-f-sort').value;
                Core.store.set('followersSort', this.sortMode);
                this.renderTable();
            };
            UI.el('tpm-f-max').onchange = () => {
                Core.store.set('followersMax', parseInt(UI.el('tpm-f-max').value, 10) || 0);
            };
            UI.el('tpm-f-snap').onclick = () => this.snapshotFollowers();
            UI.el('tpm-f-diff').onclick = () => this.diffSnapshots();
            UI.el('tpm-f-scan').onclick = () => this.scanAndSortFollowing();
            UI.el('tpm-f-stop').onclick = () => { this.stopFlag = true; };
            UI.el('tpm-f-export').onclick = () => this.exportCsv();
            UI.el('tpm-f-export-json').onclick = () => this.exportJson();
            this.refreshSnapshotSummary();
        },

        setStatus(kind, text) {
            const el = UI.el('tpm-f-status');
            if (!el) return;
            el.className = 'tpm-status ' + kind;
            el.textContent = text;
        },

        setNow(text) {
            const el = UI.el('tpm-f-now');
            if (!el) return;
            if (!text) { el.style.display = 'none'; return; }
            el.style.display = 'block';
            el.textContent = text;
        },

        checkLocation() {
            const path = location.pathname.toLowerCase();
            const onFollowers = /\/followers\/?$/.test(path) || /\/verified_followers\/?$/.test(path);
            const onFollowing = /\/following\/?$/.test(path);
            if (!onFollowers && !onFollowing) {
                this.setNow('Tip: open your profile → Followers (for snapshots) or Following (for sort scan).');
            }
        },

        // ---- Snapshot storage ------------------------------------------------

        _historyKey() { return 'followersHistory:' + (Core.username || 'me').toLowerCase(); },

        loadHistory() {
            return Core.store.get(this._historyKey(), []);
        },

        saveHistory(hist) {
            // Keep last 20 snapshots to avoid blowing localStorage
            return Core.store.set(this._historyKey(), hist.slice(-20));
        },

        refreshSnapshotSummary() {
            const hist = this.loadHistory();
            const last = hist[hist.length - 1];
            const c = UI.el('tpm-f-snap-count');
            const w = UI.el('tpm-f-snap-when');
            const n = UI.el('tpm-f-hist-n');
            if (n) n.textContent = String(hist.length);
            if (!last) {
                if (c) c.textContent = '–';
                if (w) w.textContent = '–';
                return;
            }
            if (c) c.textContent = String(last.handles?.length || 0);
            if (w) {
                try {
                    const d = new Date(last.at);
                    w.textContent = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                } catch (_) { w.textContent = '–'; }
            }
        },

        /**
         * Walk the Followers list DOM (virtualized), collect unique handles.
         * Scrolls the page to load more rows until no growth or stop.
         */
        async collectListHandles(opts = {}) {
            const maxScrolls = opts.maxScrolls || 80;
            const settleMs = opts.settleMs || 700;
            const seen = new Map(); // handle -> { handle, name, mutual, private }
            let stagnant = 0;

            for (let i = 0; i < maxScrolls && !this.stopFlag; i++) {
                const cells = document.querySelectorAll('[data-testid="UserCell"]');
                let added = 0;
                for (const cell of cells) {
                    const handle = Follow.getUsername(cell);
                    if (!handle || handle === 'unknown') continue;
                    const key = handle.toLowerCase();
                    if (seen.has(key)) continue;
                    const nameEl = cell.querySelector('[dir="ltr"] span, a[role="link"] span');
                    seen.set(key, {
                        handle,
                        name: (nameEl && nameEl.textContent) || handle,
                        mutual: Follow.isMutual(cell),
                        private: Follow.isPrivate(cell)
                    });
                    added++;
                }
                this.setNow(`Scanned ${seen.size} unique accounts… (scroll ${i + 1}/${maxScrolls})`);
                if (added === 0) {
                    stagnant++;
                    if (stagnant >= 3) break;
                } else {
                    stagnant = 0;
                }
                // Scroll the main timeline column
                const scroller = document.querySelector('[data-testid="primaryColumn"]') || document.scrollingElement || document.documentElement;
                const before = window.scrollY || scroller.scrollTop || 0;
                window.scrollBy(0, Math.min(window.innerHeight * 0.85, 900));
                await Core.sleep(settleMs);
                const after = window.scrollY || scroller.scrollTop || 0;
                if (Math.abs(after - before) < 4 && added === 0) {
                    stagnant++;
                    if (stagnant >= 3) break;
                }
            }
            return [...seen.values()];
        },

        async snapshotFollowers() {
            if (this.running) return;
            const path = location.pathname.toLowerCase();
            if (!/\/followers\/?$/.test(path) && !/\/verified_followers\/?$/.test(path)) {
                this.setStatus('pause', 'Open your Followers page first');
                alert('Go to your profile → Followers, then run Snapshot again.');
                return;
            }
            this.running = true;
            this.stopFlag = false;
            this._setBusy(true);
            this.setStatus('run', 'Snapshotting followers…');
            try {
                const accounts = await this.collectListHandles({ maxScrolls: 120 });
                const handles = accounts.map(a => a.handle.toLowerCase()).sort();
                const snap = {
                    at: new Date().toISOString(),
                    username: Core.username || null,
                    handles,
                    meta: accounts
                };
                const hist = this.loadHistory();
                hist.push(snap);
                const saved = this.saveHistory(hist);
                this.refreshSnapshotSummary();
                this.setStatus(saved ? 'idle' : 'stop',
                    saved ? `Saved ${handles.length} followers` : `Collected ${handles.length}, but SAVE FAILED (browser storage full)`);
                this.setNow(`Snapshot saved (${handles.length} handles). Use Diff vs previous to compare.`);
                console.log('[TPM Followers] Snapshot', snap);
            } catch (e) {
                console.error(e);
                this.setStatus('stop', 'Snapshot failed');
            } finally {
                this.running = false;
                this._setBusy(false);
            }
        },

        diffSnapshots() {
            const hist = this.loadHistory();
            const out = UI.el('tpm-f-diff-out');
            if (!out) return;
            if (hist.length < 2) {
                out.innerHTML = 'Need at least <strong>two</strong> snapshots to diff. Take another later.';
                return;
            }
            const prev = hist[hist.length - 2];
            const curr = hist[hist.length - 1];
            const a = new Set(prev.handles || []);
            const b = new Set(curr.handles || []);
            const gained = [...b].filter(h => !a.has(h));
            const lost = [...a].filter(h => !b.has(h));
            out.innerHTML = `
              <strong>Diff</strong> ${Core.escapeHtml(prev.at?.slice(0, 10) || '?')} → ${Core.escapeHtml(curr.at?.slice(0, 10) || '?')}<br>
              <span style="color:var(--ok)">+${gained.length} new</span> ·
              <span style="color:var(--danger)">−${lost.length} lost</span>
              <div style="margin-top:8px;max-height:160px;overflow:auto;font-size:12px">
                ${gained.length ? '<div><strong>New:</strong> ' + gained.map(h => '@' + Core.escapeHtml(h)).join(', ') + '</div>' : ''}
                ${lost.length ? '<div style="margin-top:6px"><strong>Lost:</strong> ' + lost.map(h => '@' + Core.escapeHtml(h)).join(', ') + '</div>' : ''}
                ${!gained.length && !lost.length ? '<div>No changes between last two snapshots.</div>' : ''}
              </div>`;
            console.table({ gained: gained.length, lost: lost.length });
            if (gained.length) console.log('[TPM] New followers', gained);
            if (lost.length) console.log('[TPM] Lost followers', lost);
        },

        // ---- Sort following by following count -------------------------------

        async scanAndSortFollowing() {
            if (this.running) return;
            const path = location.pathname.toLowerCase();
            if (!/\/following\/?$/.test(path)) {
                this.setStatus('pause', 'Open your Following page first');
                alert('Go to your profile → Following, then run Scan & sort again.');
                return;
            }
            this.running = true;
            this.stopFlag = false;
            this.rows = [];
            this._setBusy(true);
            this.setStatus('run', 'Scanning Following list…');
            try {
                const accounts = await this.collectListHandles({ maxScrolls: 100 });
                if (this.stopFlag) {
                    this.setStatus('stop', 'Stopped');
                    return;
                }
                const max = parseInt(UI.el('tpm-f-max')?.value, 10);
                const toEnrich = (!max || max <= 0) ? accounts : accounts.slice(0, max);
                this.setStatus('run', `Enriching ${toEnrich.length} profiles…`);

                for (let i = 0; i < toEnrich.length && !this.stopFlag; i++) {
                    const acc = toEnrich[i];
                    this.setNow(`Looking up @${acc.handle} (${i + 1}/${toEnrich.length})`);
                    const profile = await Core.fetchUserByScreenName(acc.handle);
                    this.rows.push({
                        handle: acc.handle,
                        name: profile?.name || acc.name,
                        following: profile?.following ?? null,
                        followers: profile?.followers ?? null,
                        location: profile?.location || '',
                        mutual: acc.mutual,
                        private: acc.private,
                        enriched: !!profile
                    });
                    // ponytail: render every 10th row, not every row — full-table innerHTML per row is O(n²)
                    if (i % 10 === 0 || i === toEnrich.length - 1) this.renderTable();
                    await Core.sleep(this.enrichDelayMs + Core.rand(0, 400));
                }

                // Include non-enriched remainder with null counts
                if (!max || max <= 0 || max >= accounts.length) {
                    /* all attempted */
                } else {
                    for (const acc of accounts.slice(max)) {
                        this.rows.push({
                            handle: acc.handle, name: acc.name,
                            following: null, followers: null, location: '',
                            mutual: acc.mutual, private: acc.private, enriched: false
                        });
                    }
                }

                this.renderTable();
                const ok = this.rows.filter(r => r.enriched).length;
                this.setStatus(this.stopFlag ? 'stop' : 'idle',
                    this.stopFlag ? `Stopped (${ok} enriched)` : `Done — ${ok} enriched, ${this.rows.length} total`);
                this.setNow(`Sorted by: ${this.sortMode}. Export if needed.`);
                UI.el('tpm-f-export').disabled = this.rows.length === 0;
                UI.el('tpm-f-export-json').disabled = this.rows.length === 0;
            } catch (e) {
                console.error(e);
                this.setStatus('stop', 'Scan failed');
            } finally {
                this.running = false;
                this._setBusy(false);
            }
        },

        sortRows() {
            const mode = this.sortMode || 'following_desc';
            const copy = this.rows.slice();
            if (mode === 'name') {
                copy.sort((a, b) => String(a.handle).localeCompare(String(b.handle)));
                return copy;
            }
            const key = mode.includes('followers') ? 'followers' : 'following';
            const asc = mode.endsWith('_asc');
            copy.sort((a, b) => {
                const av = a[key], bv = b[key];
                if (av == null && bv == null) return String(a.handle).localeCompare(String(b.handle));
                if (av == null) return 1; // nulls last
                if (bv == null) return -1;
                return asc ? av - bv : bv - av;
            });
            return copy;
        },

        renderTable() {
            const host = UI.el('tpm-f-list');
            if (!host) return;
            if (!this.rows.length) {
                host.innerHTML = '<p class="tpm-note">Run a scan to populate this table.</p>';
                return;
            }
            const sorted = this.sortRows();

            const rowsHtml = sorted.map((r, i) => `
              <tr>
                <td class="tpm-f-rank">${i + 1}</td>
                <td><a href="/${Core.escapeHtml(r.handle)}" target="_blank" rel="noopener">@${Core.escapeHtml(r.handle)}</a>
                  ${r.mutual ? '<span class="tpm-f-tag">mutual</span>' : ''}
                  ${r.private ? '<span class="tpm-f-tag">private</span>' : ''}
                </td>
                <td class="tpm-f-num">${r.following != null ? r.following.toLocaleString() : '—'}</td>
                <td class="tpm-f-num">${r.followers != null ? r.followers.toLocaleString() : '—'}</td>
                <td class="tpm-f-loc">${Core.escapeHtml(r.location || '—')}</td>
              </tr>`).join('');

            host.innerHTML = `
              <table class="tpm-f-table">
                <thead>
                  <tr>
                    <th>#</th><th>Handle</th>
                    <th title="How many accounts they follow">Following</th>
                    <th>Followers</th><th>Location</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>`;
        },

        exportCsv() {
            const sorted = this._exportRows();
            if (!sorted.length) return;
            const header = 'rank,handle,name,following,followers,location,mutual,private,enriched';
            const lines = sorted.map((r, i) => [
                i + 1,
                r.handle,
                JSON.stringify(r.name || ''),
                r.following ?? '',
                r.followers ?? '',
                JSON.stringify(r.location || ''),
                r.mutual ? 1 : 0,
                r.private ? 1 : 0,
                r.enriched ? 1 : 0
            ].join(','));
            this._download('tpm-following-sorted.csv', [header, ...lines].join('\n'), 'text/csv');
        },

        exportJson() {
            const sorted = this._exportRows();
            if (!sorted.length) return;
            this._download(
                'tpm-following-sorted.json',
                JSON.stringify({ at: new Date().toISOString(), sort: this.sortMode, rows: sorted }, null, 2),
                'application/json'
            );
        },

        _exportRows() {
            return this.sortRows();
        },

        _download(filename, text, mime) {
            const blob = new Blob([text], { type: mime });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        },

        _setBusy(busy) {
            const scan = UI.el('tpm-f-scan');
            const stop = UI.el('tpm-f-stop');
            const snap = UI.el('tpm-f-snap');
            if (scan) scan.disabled = busy;
            if (snap) snap.disabled = busy;
            if (stop) stop.disabled = !busy;
        }
    };
