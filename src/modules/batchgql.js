/**
 * @module batchgql
 * @see docs/modules/batchgql.md
 */
    /* ===================================================================== *
     *  BATCHGQL — UsersByRestIds. POST. 100 ids per request.                *
     * ===================================================================== */
    const BatchGql = {
        // Small flag set from a live UsersByRestIds call that returned profiles.
        _features() {
            return {
                profile_label_improvements_pcf_label_in_post_enabled: true,
                responsive_web_profile_redirect_enabled: true,
                rweb_tipjar_consumption_enabled: true,
                verified_phone_label_enabled: false,
                responsive_web_graphql_timeline_navigation_enabled: true
            };
        },

        async _post(queryId, ids) {
            return fetch(`${Core.baseUrl}/i/api/graphql/${queryId}/UsersByRestIds`, {
                method: 'POST',
                headers: Core.apiHeaders(),
                credentials: 'include',
                referrer: `${Core.baseUrl}/${Core.username || ''}`,
                body: JSON.stringify({
                    variables: { userIds: ids },
                    features: this._features(),
                    fieldToggles: { withPayments: false, withAuxiliaryUserLabels: true },
                    queryId
                }),
                signal: AbortSignal.timeout(30000)
            });
        },

        async _wait(res, shouldStop, onWait) {
            const reset = parseInt(res.headers.get('x-rate-limit-reset'), 10);
            let s = reset ? reset - Math.floor(Date.now() / 1000) : 60;
            if (s < 1) s = 5;
            if (s > 1200) s = 1200;
            while (s > 0 && !shouldStop()) {
                if (onWait) onWait(s);
                await Core.sleep(1000);
                s = reset ? reset - Math.floor(Date.now() / 1000) : s - 1;
            }
        },

        /**
         * Look up numeric ids in batches of 100.
         * Returns a Map of id -> profile, or null if the call cannot start.
         * A missing id in the Map means that account did not resolve.
         */
        async collect(ids, opts, shouldStop) {
            const stop = shouldStop || function () { return false; };
            const onProgress = (opts && opts.onProgress) || function () { };
            const onWait = (opts && opts.onWait) || null;
            const unique = [...new Set((ids || []).map(String))].filter(id => /^\d{5,}$/.test(id));
            let qid = await Core.resolveQueryId('UsersByRestIds');
            if (!qid) return null;
            const out = new Map();
            let refreshed = false;
            for (let i = 0; i < unique.length && !stop();) {
                const chunk = unique.slice(i, i + 100);
                let res;
                try {
                    res = await this._post(qid, chunk);
                } catch (e) {
                    console.warn('[TPM] UsersByRestIds request threw:', e);
                    if (i === 0) return null;
                    break;
                }
                if (res.status === 429) {
                    await this._wait(res, stop, onWait);
                    continue;
                }
                if (res.status === 404 && !refreshed) {
                    delete Core._queryIds.UsersByRestIds;
                    delete Core._queryIdMisses.UsersByRestIds;
                    refreshed = true;
                    const fresh = await Core.resolveQueryId('UsersByRestIds');
                    if (fresh) { qid = fresh; continue; }
                }
                if (res.status !== 200) {
                    console.warn('[TPM] UsersByRestIds HTTP ' + res.status);
                    if (i === 0) return null;
                    break;
                }
                let data;
                try { data = await res.json(); } catch (e) {
                    console.warn('[TPM] UsersByRestIds bad JSON:', e);
                    if (i === 0) return null;
                    break;
                }
                const users = (data && data.data && data.data.users) || [];
                users.forEach((item) => {
                    const result = (item && item.result) || {};
                    const mapped = Core.mapProfile(result, result.rest_id);
                    if (mapped && mapped.id) out.set(String(mapped.id), mapped);
                });
                i += chunk.length;
                onProgress(Math.min(i, unique.length), unique.length);
                const remaining = parseInt(res.headers.get('x-rate-limit-remaining'), 10);
                if (remaining <= 1) await this._wait(res, stop, onWait);
                else await Core.sleep(250);
            }
            return out;
        },

        /**
         * Resolve list entries. Ids use the batch call. Handles with no id
         * use UserByScreenName. Returns a Map of entry -> profile or null.
         * Entries that were not checked are absent from the Map.
         */
        async lookupEntries(entries, hooks) {
            const stop = (hooks && hooks.stop) || function () { return false; };
            const note = (hooks && hooks.note) || function () { };
            const pause = (hooks && hooks.pause) || function () { };
            const run = (hooks && hooks.run) || function () { };
            const found = new Map();
            const hasId = (e) => e.id && /^\d{5,}$/.test(String(e.id));
            const idEntries = entries.filter(hasId);
            const nameEntries = entries.filter(e => !hasId(e) && e.handle);
            if (idEntries.length && !stop()) {
                run(`Looking up ${idEntries.length.toLocaleString()} ids…`);
                const batch = await this.collect(idEntries.map(e => String(e.id)), {
                    onProgress: (n, all) => note(`Id lookup ${n.toLocaleString()}/${all.toLocaleString()}…`),
                    onWait: (sec) => pause(`Rate limited. Waiting ${Core.fmtDuration(sec)}.`)
                }, stop);
                if (batch) {
                    idEntries.forEach((e) => {
                        const id = String(e.id);
                        if (batch.has(id)) found.set(e, batch.get(id));
                        else if (!stop()) found.set(e, null);
                    });
                } else {
                    for (let i = 0; i < idEntries.length && !stop(); i++) {
                        const e = idEntries[i];
                        found.set(e, await Core.fetchUserByRestId(
                            e.id,
                            (sec) => pause(`Rate limited. Waiting ${Core.fmtDuration(sec)}.`),
                            stop
                        ));
                    }
                }
            }
            if (nameEntries.length && !stop()) run(`Checking ${nameEntries.length.toLocaleString()} handles…`);
            for (let i = 0; i < nameEntries.length && !stop(); i++) {
                const e = nameEntries[i];
                note(`Checking @${e.handle} (${i + 1}/${nameEntries.length})…`);
                found.set(e, await Core.fetchUserByScreenName(
                    e.handle,
                    (sec) => pause(`Rate limited. Waiting ${Core.fmtDuration(sec)} — resumes at ${i + 1}/${nameEntries.length}.`),
                    stop
                ));
                await Core.sleep(900 + Core.rand(0, 400));
            }
            return found;
        }
    };
