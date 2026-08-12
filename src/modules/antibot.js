/**
 * @module antibot
 * @see docs/modules/antibot.md
 */
    /* ===================================================================== *
     *  ANTIBOT — flag and block bot-like followers. Scans the Followers      *
     *  page, enriches each account, classifies it against the filters,      *
     *  previews everything, and only blocks after explicit confirm.          *
     * ===================================================================== */
    const Antibot = {
        rows: [],
        running: false,
        stopFlag: false,

        render() {
            const host = UI.el('tpm-antibot-host');
            if (!host) return;
            const s = Core.store;
            host.innerHTML = `
              <p>Scans your <strong>Followers</strong> page and targets <strong>locked</strong> followers — the lock is read straight from the list (no API call). Only locked accounts get an API lookup. An account is shown only if it matches <strong>every</strong> selected filter. Nothing is blocked until you confirm.</p>
              <label class="tpm-check"><input type="checkbox" id="tpm-ab-private" ${s.get('ab.private', true) ? 'checked' : ''}> Private / locked profile</label>
              <label class="tpm-check"><input type="checkbox" id="tpm-ab-minon" ${s.get('ab.minon', true) ? 'checked' : ''}> Fewer followers than this minimum</label>
              <input id="tpm-ab-min" type="number" class="tpm-input" min="0" value="${s.get('ab.min', 10)}" style="max-width:120px">
              <label class="tpm-check"><input type="checkbox" id="tpm-ab-avatar" ${s.get('ab.avatar', true) ? 'checked' : ''}> Default profile picture</label>
              <label class="tpm-check"><input type="checkbox" id="tpm-ab-handle" ${s.get('ab.handle', true) ? 'checked' : ''}> Random / bot-like @handle</label>
              <div class="tpm-btns">
                <button class="tpm-btn tpm-btn-primary" id="tpm-ab-scan" type="button">Scan followers</button>
                <button class="tpm-btn tpm-btn-ghost" id="tpm-ab-load" type="button">Load previous scan</button>
                <button class="tpm-btn tpm-btn-ghost" id="tpm-ab-stop" type="button" disabled>Stop</button>
              </div>
              <div class="tpm-status idle" id="tpm-ab-status">Idle — open your Followers page first.</div>
              <div id="tpm-ab-results"></div>`;
            UI.el('tpm-ab-scan').onclick = () => this.scan();
            UI.el('tpm-ab-load').onclick = () => this.loadPrevious();
            UI.el('tpm-ab-stop').onclick = () => { this.stopFlag = true; Followers.stopFlag = true; };
        },

        setStatus(kind, text) {
            const el = UI.el('tpm-ab-status');
            if (el) { el.className = 'tpm-status ' + kind; el.textContent = text; }
        },

        readFilters() {
            const s = Core.store;
            const f = {
                private: UI.el('tpm-ab-private').checked,
                minOn: UI.el('tpm-ab-minon').checked,
                min: parseInt(UI.el('tpm-ab-min').value, 10) || 0,
                avatar: UI.el('tpm-ab-avatar').checked,
                handle: UI.el('tpm-ab-handle').checked
            };
            s.set('ab.private', f.private); s.set('ab.minon', f.minOn); s.set('ab.min', f.min);
            s.set('ab.avatar', f.avatar); s.set('ab.handle', f.handle);
            return f;
        },

        // Bot-like @handle signals: X's default "user<digits>" names, digit
        // runs, mostly-digit names, word+random-digits, vowel-less letter soup.
        handleSignals(handle) {
            const r = [];
            const s = String(handle || '').replace(/_/g, '');
            const digits = (s.match(/\d/g) || []).length;
            if (/^user\d{5,}$/i.test(s)) r.push('default "user…" name');
            if (/\d{4,}/.test(s)) r.push('long digit run');
            if (s.length >= 6 && digits / s.length >= 0.4) r.push('mostly digits');
            if (/^[a-z]+\d{2,}$/i.test(s)) r.push('word + random digits');
            const letters = s.replace(/\d/g, '');
            if (letters.length >= 6 && !/[aeiou]/i.test(letters)) r.push('no vowels');
            return r;
        },

        classify(row, f) {
            const checks = [];
            if (f.private) checks.push(row.private ? 'private' : null);
            if (f.minOn && f.min > 0) checks.push((row.followers != null && row.followers < f.min) ? `only ${row.followers} followers` : null);
            if (f.avatar) checks.push(row.defaultImage === true ? 'default avatar' : null);
            if (f.handle) {
                const hs = this.handleSignals(row.handle);
                checks.push(hs.length ? 'handle: ' + hs.join(', ') : null);
            }
            // AND: a row only matches if EVERY selected filter matches it.
            // Nothing selected => nothing flagged.
            if (!checks.length) return [];
            return checks.every(c => c != null) ? checks : [];
        },

        // Rows decorated with match reasons under the CURRENT filters, so the
        // table always reflects whatever the user has ticked right now.
        matches() {
            const f = this.readFilters();
            return this.rows.map(row => Object.assign({}, row, { reasons: this.classify(row, f) }));
        },

        _dbKey() { return 'antibotScan:' + (Core.username || 'me').toLowerCase(); },

        // Re-show the last saved scan and re-apply the current filters — no API
        // calls, so the user can tune filters and instantly see different matches.
        loadPrevious() {
            if (this.running) return;
            const db = Core.store.get(this._dbKey(), null);
            if (!db || !db.rows || !db.rows.length) {
                this.setStatus('pause', 'No previous scan saved yet — run a scan first.');
                return;
            }
            this.rows = db.rows;
            this.renderResults();
            const flagged = this.matches().filter(x => x.reasons.length).length;
            const when = db.at ? new Date(db.at).toLocaleString() : 'unknown date';
            this.setStatus('idle', `Loaded previous scan (${when}): ${flagged} match all selected filters of ${this.rows.length} locked accounts.`);
        },

        async scan() {
            if (this.running) return;
            this.readFilters();
            this.running = true; this.stopFlag = false; Followers.stopFlag = false;
            UI.el('tpm-ab-scan').disabled = true; UI.el('tpm-ab-stop').disabled = false;
            this.setStatus('run', 'Collecting followers…');
            try {
                // API pagination first — scales to 100k+ followers and already
                // returns locked status, follower counts, avatar flag and ids
                // (works from any page). Falls back to the DOM walk, which reads
                // the lock icon from the list and looks up each locked account.
                let accounts = await Followers.collectFollowersApi({
                    onProgress: (n, waitS) => {
                        if (this.stopFlag) return;
                        if (waitS > 0) this.setStatus('pause', `Rate limited by X. Waiting ${Core.fmtDuration(waitS)} — ${n.toLocaleString()} followers collected. Press Stop to cancel.`);
                        else this.setStatus('run', `Collecting followers via API… ${n.toLocaleString()} so far.`);
                    }
                });
                let viaApi = Array.isArray(accounts) && accounts.length > 0;
                if (!viaApi) {
                    const path = location.pathname.toLowerCase();
                    if (!/\/(followers|verified_followers)\/?$/.test(path)) {
                        this.setStatus('pause', 'Open your Followers page first');
                        alert('The followers API is unavailable and the fallback needs your Followers page open. Go to your profile → Followers and scan again.');
                        return;
                    }
                    this.setStatus('run', 'API unavailable — collecting followers from the page…');
                    accounts = await Followers.collectListHandles({ maxScrolls: 100000, stagnantLimit: 6 });
                }
                if (this.stopFlag) { this.setStatus('stop', 'Stopped'); return; }
                if (!accounts || !accounts.length) { this.setStatus('stop', 'No followers collected.'); return; }

                // Feed the full follower list into the follower tracker so every
                // anti-bot scan doubles as a snapshot (diffable, exportable).
                const savedSnap = Followers.saveSnapshot(accounts, 'antibot');
                if (!savedSnap) console.warn('[TPM] Anti-bot snapshot save failed (browser storage full).');

                const locked = accounts.filter(a => a.private);
                this.rows = [];
                let failed = 0;
                if (viaApi) {
                    // Everything needed arrived with the list — no per-account lookups.
                    for (const a of locked) {
                        this.rows.push({
                            handle: a.handle, name: a.name, id: a.id || null,
                            private: true, followers: a.followers ?? null,
                            defaultImage: !!a.defaultImage, enriched: true
                        });
                    }
                } else {
                    this.setStatus('run', `${locked.length} locked of ${accounts.length} followers — looking up the locked ones…`);
                    for (let i = 0; i < locked.length && !this.stopFlag; i++) {
                        const acc = locked[i];
                        Followers.setNow(`Anti-bot: looking up locked @${acc.handle} (${i + 1}/${locked.length})`);
                        // On a 429 the lookup waits out the reset, then resumes from
                        // this same index — the scan never loses its place. Stop is
                        // honored even in the middle of the wait.
                        const p = await Core.fetchUserByScreenName(acc.handle, (s) => {
                            this.setStatus('pause', `Rate limited by X. Waiting ${Core.fmtDuration(s)} — resumes at locked account ${i + 1}/${locked.length}. Press Stop to cancel.`);
                        }, () => this.stopFlag);
                        if (!p) failed++;
                        this.rows.push({
                            handle: acc.handle, name: p?.name || acc.name, id: p?.id || null,
                            private: true,
                            followers: p?.followers ?? null,
                            defaultImage: p ? !!p.defaultProfileImage : null,
                            enriched: !!p
                        });
                        if (i % 10 === 0 || i === locked.length - 1) this.renderResults();
                        await Core.sleep(900 + Core.rand(0, 400));
                    }
                }
                // Persist the enriched scan so "Load previous scan" can re-apply
                // any filter combination later without new API calls.
                if (this.rows.length) {
                    const saved = Core.store.set(this._dbKey(), { at: new Date().toISOString(), rows: this.rows });
                    if (!saved) console.warn('[TPM] Anti-bot scan DB save failed (browser storage full).');
                }
                this.renderResults();
                const flagged = this.matches().filter(x => x.reasons.length).length;
                this.setStatus(this.stopFlag ? 'stop' : 'idle',
                    `${flagged} flagged of ${locked.length} locked (${accounts.length.toLocaleString()} followers collected${viaApi ? ' via API' : ''}${failed ? `, ${failed} lookups failed` : ''})`);
            } catch (e) {
                console.error('[TPM] Anti-bot scan failed:', e);
                this.setStatus('stop', 'Scan failed');
            } finally {
                this.running = false;
                UI.el('tpm-ab-scan').disabled = false; UI.el('tpm-ab-stop').disabled = true;
            }
        },

        renderResults() {
            const host = UI.el('tpm-ab-results');
            if (!host) return;
            if (!this.rows.length) { host.innerHTML = ''; return; }
            const all = this.matches();
            const flagged = all.filter(x => x.reasons.length);
            const blockable = flagged.filter(x => x.id);
            // Cap the rendered table — with huge follower lists a full table
            // would freeze the panel. Block/CSV still use every match.
            const shown = flagged.slice(0, 1000);
            const rowsHtml = shown.map(x => `
              <tr>
                <td><a href="/${Core.escapeHtml(x.handle)}" target="_blank" rel="noopener">@${Core.escapeHtml(x.handle)}</a></td>
                <td>${x.private ? 'yes' : 'no'}</td>
                <td class="tpm-f-num">${x.followers != null ? x.followers.toLocaleString() : '—'}</td>
                <td>${x.defaultImage == null ? '—' : x.defaultImage ? 'yes' : 'no'}</td>
                <td style="color:var(--muted)">${Core.escapeHtml(x.reasons.join('; '))}</td>
              </tr>`).join('');
            host.innerHTML = `
              <div style="margin-top:10px">
                <p><strong>${flagged.length}</strong> match all selected filters of ${this.rows.length} locked looked up${flagged.length > shown.length ? ` (showing first ${shown.length})` : ''}${flagged.length > blockable.length ? ` — ${blockable.length} blockable, the rest could not be looked up` : ''}.</p>
                <div class="tpm-f-list" style="max-height:220px;overflow:auto">
                  <table class="tpm-f-table">
                    <thead><tr><th>Handle</th><th>Private</th><th>Followers</th><th>Default pic</th><th>Matches</th></tr></thead>
                    <tbody>${rowsHtml || '<tr><td colspan="5">Nothing matches all selected filters.</td></tr>'}</tbody>
                  </table>
                </div>
                <div class="tpm-btns">
                  <button class="tpm-btn tpm-btn-ghost" id="tpm-ab-csv" type="button">Export CSV</button>
                  <button class="tpm-btn tpm-btn-ghost" id="tpm-ab-json" type="button">Export JSON</button>
                </div>
                <label class="tpm-check"><input type="checkbox" id="tpm-ab-confirm"> I understand blocking removes these accounts from my followers.</label>
                <div class="tpm-btns"><button class="tpm-btn tpm-btn-danger" id="tpm-ab-block" type="button" disabled>Block ${blockable.length} matching followers</button></div>
              </div>`;
            UI.el('tpm-ab-confirm').addEventListener('change', (e) => { UI.el('tpm-ab-block').disabled = !e.target.checked || blockable.length === 0; });
            UI.el('tpm-ab-block').onclick = () => this.blockAll();
            UI.el('tpm-ab-csv').onclick = () => {
                const header = 'handle,name,private,followers,default_profile_image,matches_all_filters,reasons';
                const lines = all.map(x => [
                    x.handle, JSON.stringify(x.name || ''), x.private ? 1 : 0,
                    x.followers ?? '', x.defaultImage == null ? '' : (x.defaultImage ? 1 : 0),
                    x.reasons.length ? 1 : 0, JSON.stringify(x.reasons.join('; '))
                ].join(','));
                Followers._download('tpm-antibot-scan.csv', [header, ...lines].join('\n'), 'text/csv');
            };
            UI.el('tpm-ab-json').onclick = () => {
                Followers._download('tpm-antibot-scan.json', JSON.stringify({ at: new Date().toISOString(), rows: all }, null, 2), 'application/json');
            };
        },

        async blockAll() {
            const targets = this.matches().filter(x => x.reasons.length && x.id);
            if (!targets.length) return;
            if (!window.confirm(`Block ${targets.length} flagged followers? Blocking removes them as followers. You can only undo it by unblocking manually.`)) return;
            this.stopFlag = false;
            UI.el('tpm-ab-block').disabled = true; UI.el('tpm-ab-stop').disabled = false;
            let done = 0, failed = 0;
            for (let i = 0; i < targets.length && !this.stopFlag; i++) {
                const t = targets[i];
                this.setStatus('run', `Blocking @${t.handle} (${i + 1}/${targets.length})…`);
                try {
                    const res = await fetch(`${Core.baseUrl}/i/api/1.1/blocks/create.json`, {
                        headers: Core.apiHeaders('application/x-www-form-urlencoded'),
                        referrer: `${Core.baseUrl}/${Core.username}`,
                        body: `user_id=${t.id}`, method: 'POST', mode: 'cors', credentials: 'include',
                        signal: AbortSignal.timeout(8000)
                    });
                    if (res.ok) done++;
                    else if (res.status === 429) {
                        const reset = parseInt(res.headers.get('x-rate-limit-reset'), 10);
                        let s = reset ? reset - Math.floor(Date.now() / 1000) : 60;
                        while (s > 0 && !this.stopFlag) { s = reset ? reset - Math.floor(Date.now() / 1000) : s - 1; this.setStatus('pause', `Rate limited. Waiting ${Math.max(0, s)}s…`); await Core.sleep(1000); }
                        i--; continue;
                    } else {
                        failed++;
                        console.warn(`[TPM] Block HTTP ${res.status} for @${t.handle}`);
                    }
                } catch (e) {
                    failed++;
                    console.warn(`[TPM] Block failed for @${t.handle}:`, e);
                }
                await Core.sleep(1500 + Core.rand(0, 1500));
            }
            UI.el('tpm-ab-stop').disabled = true;
            this.setStatus(this.stopFlag ? 'stop' : 'idle', `Blocked ${done}, failed ${failed}. Reload your followers list to confirm.`);
        }
    };
