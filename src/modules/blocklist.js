/**
 * @module blocklist
 * @description Block accounts from CSV / archive / handle lists; CSVs with
 * ids skip live checks. @see docs/modules/blocklist.md
 */
    /* ==== BLOCKLIST — block from CSV / handle list / archive follower list ==== */
    const Blocklist = {
        firstShow: true,
        rows: [],
        _pending: [],
        running: false,
        stopFlag: false,

        onShow() { if (this.firstShow) { this.render(); this.firstShow = false; } },

        setStatus(kind, text) {
            const el = UI.el('tpm-bl-status');
            if (el) { el.className = 'tpm-status ' + kind; el.textContent = text; }
        },

        setNow(text) {
            const el = UI.el('tpm-bl-now');
            if (el) { el.style.display = text ? 'block' : 'none'; el.textContent = text || ''; }
        },
        render() {
            const pane = UI.el('tpm-pane-blocklist');
            if (!pane) return;
            const s = Core.store;
            pane.innerHTML = `
              <div class="tpm-warn-box">Blocks count toward X's ~200 actions / 15 min limit, same as unfollows. Keep the default auto-pause below. Nothing blocks until you confirm.</div>

              <div class="tpm-section">
                <h4>Load a list to block</h4>
                <p>Drop a <strong>CSV</strong> (with a header), a plain <strong>handle list</strong>, or your X data archive's <strong>follower.js / following.js</strong>. A CSV with ids goes straight to blocking — no live checks. Other lists are looked up once, using the same filters as the <strong>Anti-bot</strong> scan (shared settings).</p>
                <label class="tpm-label" for="tpm-bl-file">Follower list file</label>
                <label id="tpm-bl-drop" for="tpm-bl-file">
                  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="var(--acc)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0l-4 4m4-4l4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
                  <strong>Choose a list file</strong>
                  <span>CSV · handles.txt · follower.js / following.js (archive)</span>
                </label>
                <input type="file" id="tpm-bl-file" accept=".csv,.txt,.js,text/csv">
                <label class="tpm-label" for="tpm-bl-max">Max accounts to look up (0 = all; lookups are rate-limited)</label>
                <input id="tpm-bl-max" type="number" class="tpm-input" min="0" value="200">
              </div>

              <div class="tpm-section">
                <h4>Filters</h4>
                <p>An account matches only if it matches <strong>every</strong> selected filter — same behavior as the Anti-bot scan.</p>
                <label class="tpm-check"><input type="checkbox" id="tpm-bl-private" ${s.get('ab.private', true) ? 'checked' : ''}> Private / locked profile</label>
                <label class="tpm-check"><input type="checkbox" id="tpm-bl-minon" ${s.get('ab.minon', true) ? 'checked' : ''}> Fewer followers than this minimum</label>
                <input id="tpm-bl-min" type="number" class="tpm-input" min="0" value="${s.get('ab.min', 10)}" style="max-width:120px">
                <label class="tpm-check"><input type="checkbox" id="tpm-bl-avatar" ${s.get('ab.avatar', true) ? 'checked' : ''}> Default profile picture</label>
                <label class="tpm-check"><input type="checkbox" id="tpm-bl-handle" ${s.get('ab.handle', true) ? 'checked' : ''}> Random / bot-like @handle</label>
                <label class="tpm-check"><input type="checkbox" id="tpm-bl-bio" ${s.get('ab.bio', true) ? 'checked' : ''}> Empty bio</label>
                <label class="tpm-check"><input type="checkbox" id="tpm-bl-joinon" ${s.get('ab.joinon', true) ? 'checked' : ''}> Joined within the last N months</label>
                <input id="tpm-bl-joinmonths" type="number" class="tpm-input" min="1" value="${s.get('ab.joinmonths', 12)}" style="max-width:120px">
                <label class="tpm-label">Auto-pause after every / minutes</label>
                <div class="tpm-row">
                  <div><input id="tpm-bl-pauseEvery" type="number" class="tpm-input" value="190"></div>
                  <div><input id="tpm-bl-pauseMinutes" type="number" class="tpm-input" value="15"></div>
                </div>
              </div>

              <div class="tpm-section">
                <h4>Live lookup</h4>
                <div class="tpm-status idle" id="tpm-bl-status">Idle — load a list first.</div>
                <div class="tpm-now" id="tpm-bl-now" style="display:none"></div>
                <div class="tpm-btns"><button class="tpm-btn tpm-btn-ghost" id="tpm-bl-stop" type="button" disabled>Stop</button></div>
              </div>

              <div class="tpm-section">
                <h4>Accounts and blocking</h4>
                <div id="tpm-bl-results"></div>
              </div>
              <div class="tpm-foot">Private-follower blocking · v${Core.version}</div>`;

            UI.el('tpm-bl-file').addEventListener('change', (e) => this.loadFile(e.target.files && e.target.files[0]), false);
            UI.el('tpm-bl-stop').onclick = () => { this.stopFlag = true; };
            ['tpm-bl-private', 'tpm-bl-minon', 'tpm-bl-avatar', 'tpm-bl-handle', 'tpm-bl-bio', 'tpm-bl-joinon'].forEach(id => UI.el(id).addEventListener('change', () => this.renderResults()));
            const drop = UI.el('tpm-bl-drop'), fi = UI.el('tpm-bl-file');
            const dnd = (ev, cls) => { ev.preventDefault(); ev.stopPropagation(); drop.classList.toggle('tpm-dragover', cls); };
            for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => dnd(e, true));
            for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, (e) => dnd(e, false));
            drop.addEventListener('drop', (e) => {
                if (e.dataTransfer.files && e.dataTransfer.files.length) { fi.files = e.dataTransfer.files; this.loadFile(e.dataTransfer.files[0]); }
            });
        },

        // Same filter set and storage keys as Antibot — tuning one tab tunes both.
        readFilters() {
            const s = Core.store;
            const f = {
                private: UI.el('tpm-bl-private').checked, minOn: UI.el('tpm-bl-minon').checked,
                min: parseInt(UI.el('tpm-bl-min').value, 10) || 0, avatar: UI.el('tpm-bl-avatar').checked,
                handle: UI.el('tpm-bl-handle').checked, emptyBio: UI.el('tpm-bl-bio').checked,
                joinOn: UI.el('tpm-bl-joinon').checked, joinMonths: parseInt(UI.el('tpm-bl-joinmonths').value, 10) || 12
            };
            [['ab.private', f.private], ['ab.minon', f.minOn], ['ab.min', f.min], ['ab.avatar', f.avatar],
             ['ab.handle', f.handle], ['ab.bio', f.emptyBio], ['ab.joinon', f.joinOn], ['ab.joinmonths', f.joinMonths]]
                .forEach(([k, v]) => s.set(k, v));
            return f;
        },

        // Parse CSV / plain list / archive follower.js into {handle}|{id} entries ({kind, count, header?}).
        parseEntries(text) {
            const t = String(text || '');
            const cut = t.indexOf('= ');
            if (cut !== -1 && /window\.YTD\.(follower|following)\b/.test(t.slice(0, cut))) {
                let json;
                try { json = JSON.parse(t.slice(cut + 1)); } catch (_) { return null; }
                const key = t.slice(0, cut).includes('.following.') ? 'following' : 'follower';
                const seen = new Set(), entries = [];
                for (const rec of json) {
                    const obj = rec && rec[key];
                    const id = obj && String(obj.accountId || '').trim();
                    if (id && /^\d{5,}$/.test(id) && !seen.has(id)) { seen.add(id); entries.push({ id }); }
                }
                return { entries, kind: 'archive', count: json.length };
            }
            const parsed = (typeof CSVP !== 'undefined') ? CSVP.parse(t) : null;
            if (parsed && parsed.entries.length) return { ...parsed, kind: 'csv', count: parsed.entries.length, header: true };
            const seen = new Set(), entries = [];
            const headWords = new Set(['handle', 'username', 'screen_name', 'name', 'account_id', 'accountid', 'user_id', 'userid', 'id', 'private', 'mutual', 'followers', 'follower', 'following']);
            for (const line of t.split(/\r?\n/)) {
                const cell = (line.split(',')[0] || '').replace(/^@/, '').replace(/^"|"$/g, '').trim();
                if (!cell || cell.startsWith('#')) continue;
                if (entries.length === 0 && headWords.has(cell.toLowerCase())) continue;
                const key = cell.toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                if (/^\d{5,}$/.test(cell)) entries.push({ id: cell });
                else if (/^(?=.*[a-z])[a-z0-9_]{1,15}$/i.test(cell)) entries.push({ handle: cell });
            }
            return { entries, kind: 'csv', count: entries.length };
        },

        loadFile(file) {
            if (!file) return;
            if (this.running) { this.setStatus('stop', 'Wait for the current run to finish first.'); return; }
            const reader = new FileReader();
            reader.onloadend = () => {
                const parsed = this.parseEntries(reader.result);
                if (!parsed || !parsed.entries.length) { this.setStatus('stop', 'No recognizable handles or user ids found in that file.'); return; }
                this._pending = parsed.entries;
                this.rows = [];
                if (parsed.header) {
                    // CSV with columns: build rows from the file, no live checks; preflagged rows are ready to block, rows without a user id are skipped.
                    this.rows = parsed.entries.map(e => ({ handle: e.handle || null, id: e.id || null, name: e.name || '',
                        private: e.private, followers: e.followers ?? null, defaultImage: null, bio: null, createdAt: null,
                        resolved: !!e.id, local: true, prechecked: !!e.prechecked }));
                    this._pending = [];
                    const ready = this.rows.filter(r => r.resolved).length;
                    this.setStatus('idle', `${this.rows.length.toLocaleString()} accounts read straight from the CSV — no live checks. ${ready.toLocaleString()} have user ids and are ready to block.`);
                    this.renderResults();
                    return;
                }
                this.setStatus('run', `${parsed.entries.length.toLocaleString()} accounts from ${parsed.kind === 'archive' ? 'the archive list' : 'the list'} — looking up profiles…`);
                this.renderResults();
                this.resolve();
            };
            reader.readAsText(file);
        },

        async resolve() {
            this.running = true;
            this.stopFlag = false;
            UI.el('tpm-bl-stop').disabled = false;
            const cap = parseInt(UI.el('tpm-bl-max')?.value, 10) || 0;
            const targets = cap > 0 ? this._pending.slice(0, cap) : this._pending;
            const total = targets.length;
            const start = Date.now();
            let failed = 0;
            for (let i = 0; i < total && !this.stopFlag; i++) {
                const e = targets[i];
                this.setNow(`Checking ${e.handle ? '@' + e.handle : 'account ' + e.id} (${i + 1}/${total})…`);
                let p = null;
                const onWait = (sec) => this.setStatus('pause', `Rate limited. Waiting ${Core.fmtDuration(sec)} — resumes at ${i + 1}/${total}.`);
                if (e.id && !e.handle) p = await Core.fetchUserByRestId(e.id, onWait, () => this.stopFlag);
                else if (e.handle) p = await Core.fetchUserByScreenName(e.handle, onWait, () => this.stopFlag);
                this.setStatus('run', `Checking ${i + 1}/${total} — ${this.rows.filter(r => r.resolved && r.private).length} confirmed private so far.`);
                if (!p) { failed++; this.rows.push({ handle: e.handle || null, id: e.id || null, name: '', private: null, resolved: false }); }
                else { const r = { handle: p.screenName || e.handle, id: p.id || e.id, name: p.name || '', private: !!p.protected,
                        followers: p.followers ?? null, defaultImage: !!p.defaultProfileImage, bio: p.description || '', createdAt: p.createdAt || null, resolved: true }; this.rows.push(r); }
                if (i % 10 === 0 || i === total - 1) this.renderResults();
                await Core.sleep(900 + Core.rand(0, 400));
            }
            this.setNow('');
            UI.el('tpm-bl-stop').disabled = true;
            this.running = false;
            const flagged = this.matches().length;
            this.renderResults();
            const doneTxt = this.stopFlag ? 'Stopped' : `Done in ${((Date.now() - start) / 60000).toFixed(1)} min`;
            this.setStatus(this.stopFlag ? 'stop' : 'idle', `${doneTxt} — ${flagged} match the filters of ${this.rows.length} checked (${failed} unresolvable).`);
        },

        // CSV rows carry no live data — evaluate only what the file itself provides.
        localReasons(row, f) {
            if (row.prechecked) return ['csv_prechecked'];
            const reasons = [];
            if (f.private && row.private === true) reasons.push('private');
            if (f.minOn && row.followers != null && row.followers < f.min) reasons.push('followers_lt_' + f.min);
            return reasons;
        },

        matches() {
            const f = this.readFilters();
            const classify = (typeof Antibot !== 'undefined') ? (r) => Antibot.classify(r, f) : (r) => r.private ? ['private'] : [];
            return this.rows.map(row => Object.assign({}, row, { reasons: row.local ? this.localReasons(row, f) : classify(row) })).filter(r => r.resolved && r.id && r.reasons.length);
        },

        renderResults() {
            const host = UI.el('tpm-bl-results');
            if (!host) return;
            const flagged = this.matches(), unresolvable = this.rows.filter(r => !r.resolved).length;
            if (!this.rows.length) { host.innerHTML = '<p class="tpm-note">Load a list to see accounts here.</p>'; return; }
            const shown = this.rows.slice(0, 1000);
            const rowsHtml = shown.map(r => `
              <tr>
                <td>${r.handle ? '<a href="/' + Core.escapeHtml(r.handle) + '" target="_blank" rel="noopener">@' + Core.escapeHtml(r.handle) + '</a>' : Core.escapeHtml(r.id || '')}</td>
                <td>${r.resolved ? (r.private ? '<span style="color:var(--danger)">private</span>' : '<span style="color:var(--muted)">open</span>')
                    : (r.local ? '<span style="color:var(--warn)">no user id — skipped</span>' : '<span style="color:var(--warn)">not found</span>')}</td>
                <td class="tpm-f-num">${r.followers != null ? r.followers.toLocaleString() : '—'}</td><td style="color:var(--muted)">${r.resolved ? Core.escapeHtml(r.reasons && r.reasons.length ? r.reasons.join('; ') : '—') : ''}</td>
              </tr>`).join('');
            host.innerHTML = `
              <p><strong>${this.rows.length.toLocaleString()}</strong> ${this.rows[0] && this.rows[0].local ? 'loaded from the CSV (no live checks)' : 'looked up'} · <strong>${flagged.length.toLocaleString()}</strong> match all selected filters · ${unresolvable} ${this.rows[0] && this.rows[0].local ? 'without a user id (skipped)' : 'unresolvable'}${this.rows.length > shown.length ? ' (showing first ' + shown.length.toLocaleString() + ')' : ''}.</p>
              <div class="tpm-f-list" style="max-height:220px;overflow:auto">
                <table class="tpm-f-table">
                  <thead><tr><th>Account</th><th>Status</th><th>Followers</th><th>Matches</th></tr></thead>
                  <tbody>${rowsHtml || '<tr><td colspan="4">No accounts yet.</td></tr>'}</tbody>
                </table>
              </div>
              <div class="tpm-btns"><button class="tpm-btn tpm-btn-ghost" id="tpm-bl-export" type="button" ${flagged.length ? '' : 'disabled'}>Export CSV</button></div>
              <label class="tpm-check"><input type="checkbox" id="tpm-bl-confirm"> I understand blocking removes these accounts as my followers and cannot be undone here.</label>
              <div class="tpm-btns"><button class="tpm-btn tpm-btn-danger" id="tpm-bl-block" type="button" disabled>Block ${flagged.length.toLocaleString()} matching accounts</button></div>`;
            UI.el('tpm-bl-confirm').addEventListener('change', (e) => { UI.el('tpm-bl-block').disabled = !e.target.checked || flagged.length === 0; });
            UI.el('tpm-bl-block').onclick = () => this.blockAll();
            UI.el('tpm-bl-export').onclick = () => this.exportCsv();
        },

        exportCsv() {
            const rows = this.matches();
            if (!rows.length) return;
            const header = 'handle,user_id,name,private,followers,matches_all_filters,reasons';
            const lines = rows.map(r => [
                r.handle || '', r.id, JSON.stringify(r.name || ''), r.private ? 1 : 0,
                r.followers ?? '', 1, JSON.stringify(r.reasons.join('; '))
            ].join(','));
            Followers._download('tpm-blocklist.csv', [header, ...lines].join('\n'), 'text/csv');
        },

        async blockAll() {
            const targets = this.matches();
            if (!targets.length) return;
            if (!window.confirm(`Block ${targets.length.toLocaleString()} accounts? Blocking removes them as followers. You can only undo it by unblocking manually.`)) return;
            this.stopFlag = false;
            const every = parseInt(UI.el('tpm-bl-pauseEvery')?.value, 10) || 0, mins = parseFloat(UI.el('tpm-bl-pauseMinutes')?.value) || 15;
            UI.el('tpm-bl-block').disabled = true;
            UI.el('tpm-bl-stop').disabled = false;
            let done = 0, failed = 0, cnt = 0;
            for (let i = 0; i < targets.length && !this.stopFlag; i++) {
                const t = targets[i];
                this.setStatus('run', `Blocking @${t.handle || t.id} (${i + 1}/${targets.length})…`);
                try {
                    const res = await fetch(`${Core.baseUrl}/i/api/1.1/blocks/create.json`, {
                        headers: Core.apiHeaders('application/x-www-form-urlencoded'),
                        referrer: `${Core.baseUrl}/${Core.username}`,
                        body: `user_id=${t.id}`, method: 'POST', mode: 'cors', credentials: 'include',
                        signal: AbortSignal.timeout(8000)
                    });
                    if (res.ok) done++;
                    else if (res.status === 429 || res.status === 420) {
                        const reset = parseInt(res.headers.get('x-rate-limit-reset'), 10);
                        let s = reset ? reset - Math.floor(Date.now() / 1000) : 60;
                        while (s > 0 && !this.stopFlag) { s = reset ? reset - Math.floor(Date.now() / 1000) : s - 1; this.setStatus('pause', `Rate limited. Waiting ${Math.max(0, s)}s… ${done} blocked.`); await Core.sleep(1000); }
                        i--; continue;
                    } else {
                        failed++;
                        console.warn(`[TPM] Block HTTP ${res.status} for @${t.handle || t.id}`);
                    }
                } catch (e) {
                    failed++;
                    console.warn(`[TPM] Block failed for @${t.handle || t.id}:`, e);
                }
                await Core.sleep(1500 + Core.rand(0, 1500));
                cnt++;
                if (every > 0 && cnt % every === 0 && !this.stopFlag) {
                    let s = Math.round(mins * 60);
                    while (s > 0 && !this.stopFlag) { this.setStatus('pause', `Pausing ${Core.fmtDuration(s)} after ${done.toLocaleString()} blocks…`); await Core.sleep(1000); s--; }
                }
            }
            UI.el('tpm-bl-stop').disabled = true;
            this.setStatus(this.stopFlag ? 'stop' : 'idle', `Blocked ${done.toLocaleString()}, failed ${failed}. Reload your followers list to confirm.`);
        }
    };