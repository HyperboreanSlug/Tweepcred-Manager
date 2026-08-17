/**
 * @module csvparse
 * @description Header-aware CSV parsing for the Block list tab: reads
 * handle / user id / name / private / followers / matches_all_filters
 * columns so an already-checked CSV can go straight to blocking.
 * @see docs/modules/csvparse.md
 */
    /* ===================================================================== *
     *  CSVP — header-aware CSV column parse (Block list fast lane).          *
     * ===================================================================== */
    const CSVP = {
        cells(line) {
            const out = [];
            let cur = '', inQ = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (inQ) {
                    if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
                    else cur += ch;
                } else if (ch === '"') inQ = true;
                else if (ch === ',') { out.push(cur); cur = ''; }
                else cur += ch;
            }
            out.push(cur);
            return out;
        },

        // Returns { header, entries } when the first row names recognized
        // columns; null when the file has no usable header.
        parse(text) {
            const lines = String(text || '').split(/\r?\n/);
            if (!lines.length) return null;
            const head = this.cells(lines[0]).map(h => h.trim().toLowerCase());
            const find = (names) => head.findIndex(h => names.includes(h));
            const id = find(['user_id', 'accountid', 'account_id', 'userid', 'user-id', 'id_str', 'user_id_str']);
            const handle = find(['handle', 'username', 'screen_name', 'screenname', '@handle']);
            const name = find(['name']);
            const privateCol = find(['private', 'is_private', 'protected', 'is_protected']);
            const followers = find(['followers', 'followers_count', 'follower_count']);
            const prechecked = find(['matches_all_filters', 'matches', 'flagged', 'match']);
            if (id < 0 && handle < 0) return null;
            const seen = new Set();
            const entries = [];
            for (const line of lines.slice(1)) {
                if (!line.trim()) continue;
                const c = this.cells(line).map(x => x.trim());
                const get = (i) => (i >= 0 ? c[i] : undefined);
                const idVal = get(id);
                const hVal = (get(handle) || '').replace(/^@/, '');
                const key = idVal || hVal.toLowerCase();
                if (!key || seen.has(key)) continue;
                seen.add(key);
                const parseFlag = (v) => { if (v === undefined || v === '') return null; return v === '1' || /^true$/i.test(v); };
                entries.push({
                    id: idVal && /^\d{5,}$/.test(idVal) ? idVal : null,
                    handle: /^(?=.*[a-z])[a-z0-9_]{1,15}$/i.test(hVal) ? hVal : null,
                    name: get(name) || '',
                    private: parseFlag(get(privateCol)),
                    followers: get(followers) && /^\d+$/.test(get(followers)) ? parseInt(get(followers), 10) : null,
                    prechecked: parseFlag(get(prechecked)) === true
                });
            }
            return { header: { id, handle, name, privateCol, followers, prechecked }, entries };
        }
    };
