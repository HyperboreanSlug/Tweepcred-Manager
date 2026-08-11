/**
 * @module core
 * @see docs/modules/core.md
 */
    /* ===================================================================== *
     *  CORE — shared state, auth and utilities used by every module          *
     * ===================================================================== */
    const Core = {
        version: '1.5.0',
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

        // GraphQL operationName -> queryId, discovered at runtime (X rotates these,
        // so nothing is hardcoded). Filled by the passive sniffer and resolveQueryId.
        _queryIds: {},
        // operationName -> timestamp of a FAILED resolve, so unresolvable ops don't
        // re-download every client bundle on each call (5-minute negative cache).
        _queryIdMisses: {},

        init() {
            this.ct0 = this.getCookie('ct0');
            this.updateTransactionId();
            this.username = this.getUsernameFromUI();
            this.userId = this.getUserId();
            this.installQuerySniffer();
        },

        // Passively learn real queryIds from every GraphQL request the page (or we)
        // make. URLs look like /i/api/graphql/<queryId>/<OperationName>.
        installQuerySniffer() {
            if (window.__tpmSniffer) return;
            window.__tpmSniffer = true;
            const self = this;
            // Bind to window so the native fetch keeps its required receiver. A
            // bare fetch() call passes this=undefined under strict mode, and
            // re-invoking the hardened global with that throws "Illegal
            // invocation" in Chrome, which previously broke every API call
            // (including deletion). Binding here makes the override transparent.
            const origFetch = window.fetch.bind(window);
            window.fetch = function (input) {
                try {
                    const u = typeof input === 'string' ? input : (input && input.url) || '';
                    const m = u.match(/\/i\/api\/graphql\/([^/]+)\/([^/?]+)/);
                    if (m) self._queryIds[m[2]] = m[1];
                } catch (_) { }
                return origFetch.apply(null, arguments);
            };
        },

        // Resolve a queryId for an operation: use a sniffed one if seen, else scan
        // the loaded X JS bundles for it. Returns null if it can't be found.
        async resolveQueryId(operationName) {
            if (this._queryIds[operationName]) return this._queryIds[operationName];
            const miss = this._queryIdMisses[operationName];
            if (miss && Date.now() - miss < 300000) return null;
            const rank = (u) => (/\bapi[.\-]/.test(u) ? 3 : 0) + (/\bmain[.\-]/.test(u) ? 2 : 0) + (/endpoint/i.test(u) ? 2 : 0);
            let urls = [];
            try { urls = performance.getEntriesByType('resource').map(r => r.name); } catch (_) { }
            document.querySelectorAll('script[src]').forEach(s => urls.push(s.src));
            urls = [...new Set(urls)].filter(n => /abs\.twimg\.com\/responsive-web\/client-web.*\.js(\?|$)/.test(n));
            urls.sort((a, b) => rank(b) - rank(a));
            for (const u of urls) {
                try {
                    const res = await fetch(u, { credentials: 'omit' });
                    if (!res.ok) continue;
                    const id = this._extractQueryId(await res.text(), operationName);
                    if (id) { this._queryIds[operationName] = id; delete this._queryIdMisses[operationName]; return id; }
                } catch (_) { }
            }
            this._queryIdMisses[operationName] = Date.now();
            return this._queryIds[operationName] || null;
        },

        _extractQueryId(text, op) {
            const ID = '([a-zA-Z0-9_-]{10,})';
            const patterns = [
                new RegExp('queryId:"' + ID + '",operationName:"' + op + '"'),
                new RegExp('operationName:"' + op + '",queryId:"' + ID + '"'),
                new RegExp('"' + op + '"[\\s\\S]{0,240}?queryId:"' + ID + '"'),
                new RegExp('queryId:"' + ID + '"[\\s\\S]{0,240}?operationName:"' + op + '"')
            ];
            for (const re of patterns) { const m = text.match(re); if (m) return m[1]; }
            return null;
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
                // Re-read ct0 live: X rotates this cookie and long runs (hours,
                // with auto-pauses) outlive the copy captured at init.
                'x-csrf-token': this.getCookie('ct0') || this.ct0,
                'x-twitter-active-user': 'yes',
                'x-twitter-auth-type': 'OAuth2Session'
            };
        },

        // Search X for whether `screenName` has ever posted any of `terms`, using
        // the SearchTimeline GraphQL endpoint with a `from:user "term"` query.
        // Returns { matched: bool, term: string|null } or null on failure.
        // Cached per (user + terms) so re-runs and audit+start don't re-query.
        _searchCache: {},
        async userPostedTerm(screenName, terms) {
            const user = (screenName || '').toLowerCase();
            if (!user || !terms || !terms.length) return { matched: false, term: null };
            const cacheKey = user + '|' + terms.join(',').toLowerCase();
            if (this._searchCache[cacheKey] !== undefined) return this._searchCache[cacheKey];

            const queryId = await this.resolveQueryId('SearchTimeline');
            if (!queryId) { return null; }   // don't cache a transient resolve failure

            // Phrase-quote each term so the search matches the exact words, and OR
            // them so one request covers every term for this account.
            const ors = terms.map(t => `"${t.replace(/"/g, '')}"`).join(' OR ');
            const rawQuery = `from:${screenName} (${ors})`;

            const variables = JSON.stringify({
                rawQuery, count: 20, querySource: 'typed_query', product: 'Latest'
            });
            const features = JSON.stringify({
                rweb_tipjar_consumption_enabled: true, responsive_web_graphql_exclude_directive_enabled: true,
                verified_phone_label_enabled: false, creator_subscriptions_tweet_preview_api_enabled: true,
                responsive_web_graphql_timeline_navigation_enabled: true,
                responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
                communities_web_enable_tweet_community_results_fetch: true,
                c9s_tweet_anatomy_moderator_badge_enabled: true, articles_preview_enabled: true,
                responsive_web_edit_tweet_api_enabled: true, graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
                view_counts_everywhere_api_enabled: true, longform_notetweets_consumption_enabled: true,
                responsive_web_twitter_article_tweet_consumption_enabled: true, tweet_awards_web_tipping_enabled: false,
                freedom_of_speech_not_reach_fetch_enabled: true, standardized_nudges_misinfo: true,
                tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
                rweb_video_timestamps_enabled: true, longform_notetweets_rich_text_read_enabled: true,
                longform_notetweets_inline_media_enabled: true, responsive_web_enhance_cards_enabled: false
            });
            const url = `${this.baseUrl}/i/api/graphql/${queryId}/SearchTimeline?` + new URLSearchParams({ variables, features });
            try {
                const res = await fetch(url, {
                    headers: this.apiHeaders(), referrer: `${this.baseUrl}/search`,
                    referrerPolicy: 'strict-origin-when-cross-origin', method: 'GET', mode: 'cors',
                    credentials: 'include', signal: AbortSignal.timeout(8000)
                });
                if (res.status !== 200) {
                    if (res.status === 404) { delete this._queryIds['SearchTimeline']; delete this._queryIdMisses['SearchTimeline']; }
                    return null;
                }
                const data = await res.json();
                // Flatten all entries across the timeline instructions.
                const instructions = data?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions || [];
                const entries = [];
                for (const ins of instructions) {
                    if (Array.isArray(ins.entries)) entries.push(...ins.entries);
                    else if (ins.entry) entries.push(ins.entry);
                }
                let matchedTerm = null;
                for (const entry of entries) {
                    if (!String(entry?.entryId || '').startsWith('tweet-')) continue;
                    const result = entry?.content?.itemContent?.tweet_results?.result;
                    const legacy = result?.legacy || result?.tweet?.legacy;
                    const text = (legacy?.full_text || '').toLowerCase();
                    const hit = terms.find(t => text.includes(t.toLowerCase()));
                    if (hit) { matchedTerm = hit; break; }
                    // A returned tweet entry means the search matched this account for
                    // one of the terms even if we can't read the text; treat as a hit.
                    if (!matchedTerm) matchedTerm = terms[0];
                }
                const out = { matched: !!matchedTerm, term: matchedTerm };
                this._searchCache[cacheKey] = out;
                return out;
            } catch (_) {
                return null;
            }
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
                try { localStorage.setItem('tpm:' + key, JSON.stringify(val)); return true; } catch (_) { return false; }
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
        },

        // Shared GraphQL feature flags for UserByScreenName (also used by Dashboard).
        userByScreenNameFeatures() {
            return JSON.stringify({
                hidden_profile_subscriptions_enabled: true, rweb_tipjar_consumption_enabled: true,
                responsive_web_graphql_exclude_directive_enabled: true, verified_phone_label_enabled: false,
                subscriptions_verification_info_is_identity_verified_enabled: true,
                subscriptions_verification_info_verified_since_enabled: true, highlights_tweets_tab_ui_enabled: true,
                responsive_web_twitter_article_notes_tab_enabled: true, subscriptions_feature_can_gift_premium: true,
                creator_subscriptions_tweet_preview_api_enabled: true,
                responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
                responsive_web_graphql_timeline_navigation_enabled: true
            });
        },

        /**
         * Fetch a public user profile via UserByScreenName.
         * @param {string} handle screen name without @
         * @returns {Promise<object|null>} normalized profile or null
         */
        async fetchUserByScreenName(handle) {
            const screen_name = (handle || '').replace(/^@/, '').trim();
            if (!screen_name) return null;
            const queryId = await this.resolveQueryId('UserByScreenName');
            if (!queryId) return null;
            const variables = JSON.stringify({ screen_name, withSafetyModeUserFields: true });
            const features = this.userByScreenNameFeatures();
            const url = `${this.baseUrl}/i/api/graphql/${queryId}/UserByScreenName?` +
                new URLSearchParams({ variables, features });
            try {
                const res = await fetch(url, {
                    headers: this.apiHeaders(),
                    referrer: `${this.baseUrl}/${screen_name}`,
                    referrerPolicy: 'strict-origin-when-cross-origin',
                    method: 'GET', mode: 'cors', credentials: 'include',
                    signal: AbortSignal.timeout(8000)
                });
                if (res.status === 404) { delete this._queryIds['UserByScreenName']; delete this._queryIdMisses['UserByScreenName']; }
                if (res.status !== 200) return null;
                const result = (await res.json())?.data?.user?.result;
                const lg = result?.legacy;
                if (!lg) return null;
                return {
                    id: result.rest_id || lg.id_str,
                    screenName: lg.screen_name || screen_name,
                    name: lg.name || '',
                    followers: lg.followers_count ?? null,
                    following: lg.friends_count ?? null,
                    statuses: lg.statuses_count ?? null,
                    location: lg.location || '',
                    description: lg.description || '',
                    createdAt: lg.created_at || null,
                    verified: !!lg.verified,
                    protected: !!lg.protected,
                    raw: result
                };
            } catch (_) {
                return null;
            }
        }
    };
