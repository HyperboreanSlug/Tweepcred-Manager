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
              <p>Scans your <strong>Followers</strong> page, looks up each account (1 request each), and flags bot-like followers. Nothing is blocked until you confirm. Export includes the private flag.</p>
              <label class="tpm-check"><input type="checkbox" id="tpm-ab-private" ${s.get('ab.private', true) ? 'checked' : ''}> Private / locked profile</label>
              <label class="tpm-check"><input type="checkbox" id="tpm-ab-minon" ${s.get('ab.minon', true) ? 'checked' : ''}> Fewer followers than this minimum</label>
              <input id="tpm-ab-min" type="number" class="tpm-input" min="0" value="${s.get('ab.min', 10)}" style="max-width:120px">
              <label class="tpm-check"><input type="checkbox" id="tpm-ab-avatar" ${s.get('ab.avatar', true) ? 'checked' : ''}> Default profile picture</label>
              <label class="tpm-check"><input type="checkbox" id="tpm-ab-handle" ${s.get('ab.handle', true) ? 'checked' : ''}> Random / bot-like @handle</label>
              <div class="tpm-btns">
                <button class="tpm-btn tpm-btn-primary" id="tpm-ab-scan" type="button">Scan followers</button>
                <button class="tpm-btn tpm-btn-ghost" id="tpm-ab-stop" type="button" disabled>Stop</button>
              </div>
              <div class="tpm-status idle" id="tpm-ab-status">Idle — open your Followers page first.</div>
              <div id="tpm-ab-results"></div>`;
            UI.el('tpm-ab-scan').onclick = () => this.scan();
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
            const r = [];
            if (f.private && row.private) r.push('private');
            if (f.minOn && f.min > 0 && row.followers != null && row.followers < f.min) r.push(`only ${row.followers} followers`);
            if (f.avatar && row.defaultImage) r.push('default avatar');
            if (f.handle) {
                const hs = this.handleSignals(row.handle);
                if (hs.length) r.push('handle: ' + hs.join(', '));
            }
            return r;
        },

        async scan() {
            if (this.running) return;
            const path = location.pathname.toLowerCase();
            if (!/\/(followers|verified_followers)\/?$/.test(path)) {
                this.setStatus('pause', 'Open your Followers page first');
                alert('Go to your profile → Followers, then run the anti-bot scan.');
                return;
            }
            const f = this.readFilters();
            this.running = true; this.stopFlag = false; Followers.stopFlag = false;
            UI.el('tpm-ab-scan').disabled = true; UI.el('tpm-ab-stop').disabled = false;
            this.setStatus('run', 'Collecting followers…');
            try {
                const accounts = await Followers.collectListHandles({ maxScrolls: 120 });
                if (this.stopFlag) { this.setStatus('stop', 'Stopped'); return; }
                this.setStatus('run', `Looking up ${accounts.length} accounts…`);
                this.rows = [];
                for (let i = 0; i < accounts.length && !this.stopFlag; i++) {
                    const acc = accounts[i];
                    Followers.setNow(`Anti-bot: looking up @${acc.handle} (${i + 1}/${accounts.length})`);
                    const p = await Core.fetchUserByScreenName(acc.handle);
                    const row = {
                        handle: acc.handle, name: p?.name || acc.name, id: p?.id || null,
                        private: acc.private || !!p?.protected,
                        followers: p?.followers ?? null,
                        defaultImage: p ? !!p.defaultProfileImage : null,
                        enriched: !!p
                    };
                    row.reasons = this.classify(row, f);
                    this.rows.push(row);
                    if (i % 10 === 0 || i === accounts.length - 1) this.renderResults();
                    await Core.sleep(900 + Core.rand(0, 400));
                }
                this.renderResults();
                const flagged = this.rows.filter(r => r.reasons.length).length;
                this.setStatus(this.stopFlag ? 'stop' : 'idle', `${flagged} of ${this.rows.length} followers flagged`);
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
            const flagged = this.rows.filter(r => r.reasons.length);
            const blockable = flagged.filter(r => r.id);
            const rowsHtml = flagged.map(r => `
              <tr>
                <td><a href="/${Core.escapeHtml(r.handle)}" target="_blank" rel="noopener">@${Core.escapeHtml(r.handle)}</a></td>
                <td>${r.private ? 'yes' : 'no'}</td>
                <td class="tpm-f-num">${r.followers != null ? r.followers.toLocaleString() : '—'}</td>
                <td>${r.defaultImage == null ? '—' : r.defaultImage ? 'yes' : 'no'}</td>
                <td style="color:var(--muted)">${Core.escapeHtml(r.reasons.join('; '))}</td>
              </tr>`).join('');
            host.innerHTML = `
              <div style="margin-top:10px">
                <p><strong>${flagged.length}</strong> flagged of ${this.rows.length} scanned${flagged.length > blockable.length ? ` (${blockable.length} blockable — the rest could not be looked up)` : ''}.</p>
                <div class="tpm-f-list" style="max-height:220px;overflow:auto">
                  <table class="tpm-f-table">
                    <thead><tr><th>Handle</th><th>Private</th><th>Followers</th><th>Default pic</th><th>Why flagged</th></tr></thead>
                    <tbody>${rowsHtml || '<tr><td colspan="5">Nothing flagged.</td></tr>'}</tbody>
                  </table>
                </div>
                <div class="tpm-btns">
                  <button class="tpm-btn tpm-btn-ghost" id="tpm-ab-csv" type="button">Export CSV</button>
                  <button class="tpm-btn tpm-btn-ghost" id="tpm-ab-json" type="button">Export JSON</button>
                </div>
                <label class="tpm-check"><input type="checkbox" id="tpm-ab-confirm"> I understand blocking removes these accounts from my followers.</label>
                <div class="tpm-btns"><button class="tpm-btn tpm-btn-danger" id="tpm-ab-block" type="button" disabled>Block ${blockable.length} flagged followers</button></div>
              </div>`;
            UI.el('tpm-ab-confirm').addEventListener('change', (e) => { UI.el('tpm-ab-block').disabled = !e.target.checked || blockable.length === 0; });
            UI.el('tpm-ab-block').onclick = () => this.blockAll();
            UI.el('tpm-ab-csv').onclick = () => {
                const header = 'handle,name,private,followers,default_profile_image,flagged,reasons';
                const lines = this.rows.map(r => [
                    r.handle, JSON.stringify(r.name || ''), r.private ? 1 : 0,
                    r.followers ?? '', r.defaultImage == null ? '' : (r.defaultImage ? 1 : 0),
                    r.reasons.length ? 1 : 0, JSON.stringify(r.reasons.join('; '))
                ].join(','));
                Followers._download('tpm-antibot-scan.csv', [header, ...lines].join('\n'), 'text/csv');
            };
            UI.el('tpm-ab-json').onclick = () => {
                Followers._download('tpm-antibot-scan.json', JSON.stringify({ at: new Date().toISOString(), rows: this.rows }, null, 2), 'application/json');
            };
        },

        async blockAll() {
            const targets = this.rows.filter(r => r.reasons.length && r.id);
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
