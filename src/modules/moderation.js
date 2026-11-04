/**
 * @module moderation
 * @description Paced moderation: download the live blocklist, then block,
 * unblock, or mute at one action per pace (default 6 s = 150 per 15 min,
 * under X's ~200 limit). @see docs/modules/moderation.md
 */
    /* ==== MODERATION — blocklist export + paced block / unblock / mute ==== */
    const Moderation = {
        pace: 6,
        running: false,
        stopFlag: false,
        blocked: [],
        keep: new Set(),
        stateKey: 'mod.progress',

        // Endpoints. v1.1 form-encoded, same auth core as the block tab.
        ENDPOINTS: {
            block: '/i/api/1.1/blocks/create.json',
            unblock: '/i/api/1.1/blocks/destroy.json',
            mute: '/i/api/1.1/mutes/users/create.json',
            unmute: '/i/api/1.1/mutes/users/destroy.json',
        },

        onShow() {
            if (!UI.el('tpm-mod-section')) this.mount();
        },

        mount() {
            const pane = UI.el('tpm-pane-blocklist');
            if (!pane) return;
            const host = document.createElement('div');
            host.className = 'tpm-section';
            host.id = 'tpm-mod-section';
            host.innerHTML = `
              <h4>Current blocklist</h4>
              <p>Download the live blocklist, mark who stays blocked, then convert the
                 rest from blocked to muted. One action every ${this.pace} seconds
                 (150 per 15 min, under X's ~200 cap). Unblock plus mute is two
                 actions per account, so 12 seconds each at this pace.</p>
              <div class="tpm-btns">
                <button class="tpm-btn tpm-btn-ghost" id="tpm-mod-dl" type="button">Download current blocklist</button>
              </div>
              <p id="tpm-mod-count">No blocklist loaded.</p>
              <label class="tpm-label" for="tpm-mod-keep">Keep blocked: handles, one per line or a CSV column</label>
              <textarea id="tpm-mod-keep" class="tpm-input" rows="4" placeholder="BlakeKresses&#10;somehandle"></textarea>
              <div class="tpm-row">
                <div><label class="tpm-label">Seconds per action</label><input id="tpm-mod-pace" type="number" min="4" step="0.5" class="tpm-input" value="${this.pace}"></div>
              </div>
              <div class="tpm-status idle" id="tpm-mod-status">Idle.</div>
              <div class="tpm-btns"><button class="tpm-btn tpm-btn-danger" id="tpm-mod-convert" type="button" disabled>Unblock and mute everyone not kept</button></div>
              <div class="tpm-btns"><button class="tpm-btn tpm-btn-ghost" id="tpm-mod-stop" type="button" disabled>Stop</button></div>`;
            pane.insertBefore(host, pane.firstChild);
            UI.el('tpm-mod-dl').onclick = () => this.download();
            UI.el('tpm-mod-keep').addEventListener('input', () => this.readKeep());
            UI.el('tpm-mod-pace').addEventListener('change', () => {
                const n = parseFloat(UI.el('tpm-mod-pace').value);
                this.pace = isNaN(n) ? 6 : Math.max(4, n);
            });
            UI.el('tpm-mod-convert').onclick = () => this.convert();
            UI.el('tpm-mod-stop').onclick = () => { this.stopFlag = true; };
            const saved = Core.store.get(this.stateKey, null);
            if (saved && saved.done && saved.done.length) {
                this.setStatus('pause', `${saved.done.length.toLocaleString()} accounts already converted in a previous run. Download the blocklist again to continue.`);
            }
        },

        setStatus(kind, text) {
            const el = UI.el('tpm-mod-status');
            if (el) { el.className = 'tpm-status ' + kind; el.textContent = text; }
        },

        sleep(ms) { return new Promise((r) => setTimeout(r, ms)); },

        async api(kind, userId) {
            const path = this.ENDPOINTS[kind];
            if (!path) throw new Error('unknown action ' + kind);
            const res = await fetch(`${Core.baseUrl}${path}`, {
                headers: Core.apiHeaders('application/x-www-form-urlencoded'),
                referrer: `${Core.baseUrl}/${Core.username}`,
                body: `user_id=${encodeURIComponent(userId)}`,
                method: 'POST', mode: 'cors', credentials: 'include',
                signal: AbortSignal.timeout(10000),
            });
            return res;
        },

        // Paginate the live blocklist. v1.1 allows ~15 calls per 15 minutes,
        // so pages are spaced and a 429 waits for the reset header.
        async download() {
            if (this.running) return;
            this.running = true;
            this.stopFlag = false;
            UI.el('tpm-mod-stop').disabled = false;
            this.setStatus('run', 'Reading the blocklist…');
            const users = [];
            const seen = new Set();
            let cursor = '';
            try {
                for (let page = 1; page <= 400 && !this.stopFlag; page++) {
                    const q = new URLSearchParams({
                        count: '200', skip_status: 'true', include_user_entities: 'false',
                    });
                    if (cursor) q.set('cursor', cursor);
                    const res = await fetch(`${Core.baseUrl}/i/api/1.1/blocks/list.json?${q}`, {
                        headers: Core.apiHeaders(),
                        referrer: `${Core.baseUrl}/${Core.username}`,
                        credentials: 'include', signal: AbortSignal.timeout(15000),
                    });
                    if (res.status === 429 || res.status === 420) {
                        const reset = parseInt(res.headers.get('x-rate-limit-reset'), 10);
                        let s = reset ? reset - Math.floor(Date.now() / 1000) : 60;
                        while (s > 0 && !this.stopFlag) {
                            this.setStatus('pause', `Blocklist read is rate limited. Waiting ${Math.max(0, s)}s… ${users.length} read.`);
                            await this.sleep(1000);
                            s = reset ? reset - Math.floor(Date.now() / 1000) : s - 1;
                        }
                        page--;
                        continue;
                    }
                    if (!res.ok) { this.setStatus('stop', `Blocklist read failed (HTTP ${res.status}).`); return; }
                    const data = await res.json();
                    const batch = data.users || [];
                    for (const u of batch) {
                        const id = String(u.id_str || u.id || '');
                        if (id && !seen.has(id)) { seen.add(id); users.push(u); }
                    }
                    this.setStatus('run', `Reading the blocklist: ${users.length} so far (page ${page})…`);
                    const next = data.next_cursor;
                    if (!batch.length || next == null || next === '0' || next === 0) break;
                    cursor = String(next);
                    await this.sleep(5000);
                }
            } finally {
                this.running = false;
                UI.el('tpm-mod-stop').disabled = true;
            }
            this.blocked = users;
            this.renderCount();
            this.exportCsv();
            this.setStatus(this.stopFlag ? 'stop' : 'idle',
                `${users.length.toLocaleString()} blocked accounts read${this.stopFlag ? ' (stopped early)' : ''}.`);
        },

        renderCount() {
            const el = UI.el('tpm-mod-count');
            if (!el) return;
            const kept = this.keepTargets();
            el.innerHTML = this.blocked.length
                ? `<strong>${this.blocked.length.toLocaleString()}</strong> blocked · <strong>${kept.keep.length.toLocaleString()}</strong> kept · <strong>${kept.convert.length.toLocaleString()}</strong> to unblock and mute`
                : 'No blocklist loaded.';
            const btn = UI.el('tpm-mod-convert');
            if (btn) btn.disabled = !kept.convert.length || this.running;
        },

        readKeep() {
            const raw = (UI.el('tpm-mod-keep') || {}).value || '';
            const set = new Set();
            for (const line of raw.split(/\r?\n/)) {
                const cell = (line.split(',')[0] || '').replace(/^@/, '').replace(/^"|"$/g, '').trim();
                if (cell && !/^handle$/i.test(cell)) set.add(cell.toLowerCase());
            }
            this.keep = set;
            this.renderCount();
        },

        keepTargets() {
            const keep = [], convert = [];
            for (const u of this.blocked) {
                const handle = String(u.screen_name || '').toLowerCase();
                if (this.keep.has(handle)) keep.push(u);
                else convert.push(u);
            }
            return { keep, convert };
        },

        exportCsv() {
            if (!this.blocked.length) return;
            const header = 'handle,user_id,name,location,followers,kept';
            const lines = this.blocked.map((u) => {
                const kept = this.keep.has(String(u.screen_name || '').toLowerCase()) ? 1 : 0;
                return [u.screen_name || '', u.id_str || u.id || '', JSON.stringify(u.name || ''),
                    JSON.stringify(u.location || ''), u.followers_count ?? '', kept].join(',');
            });
            Followers._download('tpm-current-blocklist.csv', [header, ...lines].join('\n'), 'text/csv');
        },

        // One action every this.pace seconds. Each account costs two actions
        // here (unblock, then mute), so the gap is applied to both calls.
        async run(kind, ids) {
            let done = 0, failed = 0, errors = 0;
            const saved = Core.store.get(this.stateKey, { done: [] });
            const already = new Set(saved.done || []);
            for (let i = 0; i < ids.length && !this.stopFlag; i++) {
                const id = ids[i];
                if (already.has(id)) continue;
                const tick = Date.now();
                this.setStatus('run', `${kind} ${i + 1}/${ids.length} (${done} done, ${failed} failed)…`);
                try {
                    const res = await this.api(kind, id);
                    if (res.ok) {
                        done++; errors = 0;
                        already.add(id);
                        Core.store.set(this.stateKey, { done: [...already], at: Date.now() });
                    } else if (res.status === 429 || res.status === 420) {
                        const reset = parseInt(res.headers.get('x-rate-limit-reset'), 10);
                        let s = reset ? reset - Math.floor(Date.now() / 1000) : 60;
                        while (s > 0 && !this.stopFlag) {
                            this.setStatus('pause', `Rate limited. Waiting ${Math.max(0, s)}s… ${done} ${kind} done.`);
                            await this.sleep(1000);
                            s = reset ? reset - Math.floor(Date.now() / 1000) : s - 1;
                        }
                        i--;
                        continue;
                    } else {
                        failed++; errors++;
                        console.warn(`[TPM] ${kind} HTTP ${res.status} for ${id}`);
                        if (errors >= 8) { this.setStatus('stop', `8 consecutive failures, stopped at ${i + 1}/${ids.length}.`); break; }
                    }
                } catch (e) {
                    failed++; errors++;
                    console.warn(`[TPM] ${kind} failed for ${id}:`, e);
                }
                const gap = this.pace * 1000 - (Date.now() - tick);
                if (gap > 0) await this.sleep(gap);
            }
            return { done, failed };
        },

        async convert() {
            if (this.running) return;
            const { convert } = this.keepTargets();
            if (!convert.length) return;
            const perAccount = 2 * this.pace;
            const mins = Math.round((convert.length * perAccount) / 60);
            if (!window.confirm(
                `Unblock and mute ${convert.length.toLocaleString()} accounts? ` +
                `That is ${convert.length * 2} actions at ${this.pace}s each, about ${mins} minutes. ` +
                `The ${this.keep.size} kept handles stay blocked.`)) return;

            this.running = true;
            this.stopFlag = false;
            UI.el('tpm-mod-stop').disabled = false;
            UI.el('tpm-mod-convert').disabled = true;
            const ids = convert.map((u) => String(u.id_str || u.id || '')).filter(Boolean);
            const un = await this.run('unblock', ids);
            this.setStatus('run', `Unblocked ${un.done}. Now muting…`);
            const mu = await this.run('mute', ids);
            UI.el('tpm-mod-stop').disabled = true;
            this.running = false;
            this.renderCount();
            this.setStatus(this.stopFlag ? 'stop' : 'idle',
                `Unblocked ${un.done.toLocaleString()} (${un.failed} failed), muted ${mu.done.toLocaleString()} (${mu.failed} failed). Kept ${this.keep.size} blocked.`);
        },
    };
