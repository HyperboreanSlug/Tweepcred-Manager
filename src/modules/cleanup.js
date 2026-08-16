/**
 * @module cleanup
 * @see docs/modules/cleanup.md
 */
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
        entries: [],
        idKey: '',
        _fails: 0,
        // Slow-delete session persistence: long runs leak memory inside X's own
        // page code until the tab crashes ("out of memory"). The session is
        // stored here so a wedged page can reload and resume where it left off.
        slowSessionKey: 'cleanup.slowSession',
        tweetResultQueryId: '7xflPyRiUxGVbJd4uWmbKg',
        deleteConvoURL: '/i/api/1.1/dm/conversation/USER_ID-CONVERSATION_ID/delete.json',
        bookmarksURL: '/i/api/graphql/L7vvM2UluPgWOW4GDvWyvw/Bookmarks?',

        onShow() { if (this.firstShow) { this.render(); this.firstShow = false; } },

        render() {
            UI.el('tpm-pane-cleanup').innerHTML = `
              <div class="tpm-section" id="tpm-slow-resume" style="display:none">
                <h4>Slow delete session in progress</h4>
                <p class="tpm-warn-box" style="margin:0 0 10px"><strong id="tpm-slow-resume-n">0</strong> deleted so far. If the timeline stays crashed for 60 minutes the page reloads itself to clear X's memory — resume the session here. <strong id="tpm-slow-resume-crash"></strong></p>
                <div class="tpm-btns">
                  <button class="tpm-btn tpm-btn-primary" id="tpm-slow-resume-go" type="button">Resume deleting</button>
                  <button class="tpm-btn tpm-btn-ghost" id="tpm-slow-resume-stop" type="button">Stop session</button>
                </div>
              </div>
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
                <div id="tpm-clean-preview" style="display:none">
                  <div class="tpm-warn-box" id="tpm-clean-summary"></div>
                  <label class="tpm-check"><input type="checkbox" id="tpm-clean-confirm"> I understand this permanently deletes the items above. This cannot be undone.</label>
                  <div class="tpm-btns">
                    <button class="tpm-btn tpm-btn-ghost" id="tpm-clean-cancel" type="button">Cancel</button>
                    <button class="tpm-btn tpm-btn-danger" id="tpm-clean-start" type="button" disabled>Start deleting</button>
                  </div>
                </div>
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

            // Offer a one-click resume when a slow-delete session survived a reload.
            const session = Core.store.get(this.slowSessionKey, null);
            if (session && session.active) {
                UI.el('tpm-slow-resume').style.display = '';
                UI.el('tpm-slow-resume-n').textContent = (session.deleted || 0).toLocaleString();
                // No heartbeat for 5+ minutes means the previous page died (OOM,
                // tab closed, browser restart) — tell the user instead of implying
                // the run is still going.
                if (session.beat && Date.now() - session.beat > 300000) {
                    UI.el('tpm-slow-resume-crash').textContent = 'The page appears to have crashed — resume to continue.';
                }
                // Crash recoveries reload with autoResume set: continue hands-free.
                if (session.autoResume) {
                    const onProfile = Core.username && location.pathname.toLowerCase().includes(`/${Core.username.toLowerCase()}`);
                    if (onProfile) {
                        this.info('Resuming slow delete session…');
                        this.slowDelete(true);
                    } else if (Core.username && !Core.isReservedName(Core.username)) {
                        location.replace(`${Core.baseUrl}/${Core.username}`);
                    }
                }
            }
            UI.el('tpm-slow-resume-go').onclick = () => { this.info('Resuming…'); this.slowDelete(true); };
            UI.el('tpm-slow-resume-stop').onclick = () => {
                Core.store.set(this.slowSessionKey, null);
                UI.el('tpm-slow-resume').style.display = 'none';
                this.info('Slow delete session stopped.');
            };

            // Start/cancel for the previewed deletion run. The Start button stays
            // disabled until the user ticks the irreversible-action confirmation.
            UI.el('tpm-clean-confirm').addEventListener('change', (e) => {
                UI.el('tpm-clean-start').disabled = !e.target.checked;
            });
            UI.el('tpm-clean-start').onclick = () => this.startRun();
            UI.el('tpm-clean-cancel').onclick = () => this.cancelRun();

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
            this._fails = 0;
            this._netRetries = {};
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
            if (!entries.length || !entries.some(x => x.tweet && x.tweet.favorite_count !== undefined)) {
                this.info('This file has no like counts. Use tweets.js to spare tweets by likes.');
                return entries;
            }
            const before = entries.length;
            const kept = entries.filter(x => {
                const count = x.tweet && x.tweet.favorite_count;
                if (count === undefined || count === null) return false;
                return !(parseInt(count, 10) > spareLikes);
            });
            console.log(`Sparing ${before - kept.length} tweet(s) (like count unknown or with more than ${spareLikes} likes).`);
            return kept;
        },

        needsTweetsFileForLikes(json) {
            if (UI.el('tpm-liveLikes')?.checked) return false;
            const likes = parseInt(UI.el('tpm-spareLikes')?.value, 10);
            if (isNaN(likes) || likes <= 0) return false;
            return !json.length || !json.some(x => x.tweet && x.tweet.favorite_count !== undefined);
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
                self.action = '';
                let filestart, json;
                try {
                    const cutpoint = evt.target.result.indexOf('= ');
                    filestart = evt.target.result.slice(0, cutpoint);
                    json = JSON.parse(evt.target.result.slice(cutpoint + 1));
                } catch (_) {
                    self.info('Could not read that file. Use an unmodified file from the X data export.');
                    return;
                }

                if (filestart.includes('.tweet_headers.')) {
                    if (self.needsTweetsFileForLikes(json)) { self.promptForTweetsFile(); return; }
                    self.action = 'untweet';
                    self.entries = json;
                    self.idKey = 'tweet_id';
                    self.total = json.length;
                } else if (filestart.includes('.tweets.') || filestart.includes('.tweet.')) {
                    self.action = 'untweet';
                    self.entries = json;
                    self.idKey = 'id_str';
                    self.total = json.length;
                } else if (filestart.includes('.like.')) {
                    self.action = 'unfav';
                    self.tIds = json.map(x => x.like.tweetId);
                    self.total = self.tIds.length;
                } else if (filestart.includes('.direct_message_headers.') || filestart.includes('.direct_message_group_headers.') ||
                    filestart.includes('.direct_messages.') || filestart.includes('.direct_message_groups.')) {
                    self.action = 'undm';
                    if (self.deleteDMsOneByOne) {
                        self.tIds = json.map(c => c.dmConversation.messages.map(m => m.messageCreate ? m.messageCreate.id : 0)).flat().filter(i => i != 0);
                    } else {
                        self.tIds = json.map(c => c.dmConversation.conversationId);
                    }
                    self.total = self.tIds.length;
                } else {
                    self.info('File content not recognized. Use a file from the Twitter data export.');
                }

                if (!self.action) return;   // unrecognized file; nothing to preview

                // Parse only. Build a run closure but DON'T delete yet — wait for the
                // explicit Start button so an irreversible action is never automatic.
                // The like/day filters are read again at Start, so a threshold typed
                // in after the file loads still applies.

                const labels = { untweet: 'tweets', unfav: 'likes', undm: 'DM conversations' };
                // A run must never die silently: any throw inside the async delete
                // engines surfaces in the info line instead of an unhandled rejection.
                const failGuard = (p) => p.catch(err => {
                    console.error('[TPM] Run failed:', err);
                    self.info(`Run failed: ${(err && err.message) || err}. Check the console for details.`);
                });
                self._pendingRun = () => {
                    self.readSettings();
                    self.createProgressBar();
                    if (self.action === 'untweet') {
                        failGuard(self.ensureTweetCount().then(() => {
                            // Re-apply the like/day filters now: settings may have
                            // changed after the file loaded.
                            self.tIds = self.filterByDays(self.filterByLikes(self.entries).map(x => x.tweet[self.idKey]));
                            self.total = self.tIds.length;
                            const skipVal = UI.el('tpm-skipCount').value;
                            if (skipVal.length < 1) {
                                self.skip = Math.max(0, self.total - self.TweetCount - parseInt(self.total / 20));
                            } else self.skip = parseInt(skipVal, 10);
                            console.log(`Skipping oldest ${self.skip} Tweets.`);
                            self.tIds.reverse();
                            self.tIds = self.tIds.slice(self.skip);
                            self.dCount = self.skip;
                            self.startCount = self.skip;
                            self.tIds.reverse();
                            return self.deleteTweets();
                        }));
                    } else if (self.action === 'unfav') {
                        self.skip = UI.el('tpm-skipCount').value.length > 0 ? parseInt(UI.el('tpm-skipCount').value, 10) : 0;
                        self.tIds = self.tIds.slice(self.skip);
                        self.dCount = self.skip;
                        self.startCount = self.skip;
                        self.tIds.reverse();
                        failGuard(self.deleteFavs());
                    } else if (self.action === 'undm') {
                        self.skip = UI.el('tpm-skipCount').value.length > 0 ? parseInt(UI.el('tpm-skipCount').value, 10) : 0;
                        self.tIds = self.tIds.slice(self.skip);
                        self.dCount = self.skip;
                        self.startCount = self.skip;
                        self.tIds.reverse();
                        failGuard(self.deleteDMsOneByOne ? self.deleteDMs() : self.deleteConvos());
                    }
                };

                self.showPreview(`Loaded <strong>${self.total.toLocaleString()}</strong> ${labels[self.action] || 'items'} from this file. Review the filters below, then start.`);
            };
            fr.readAsText(tn.files[0]);
        },

        // Reveal the confirm + Start controls after a file is parsed.
        showPreview(summaryHtml) {
            const box = UI.el('tpm-clean-summary'); if (box) box.innerHTML = summaryHtml;
            const wrap = UI.el('tpm-clean-preview'); if (wrap) wrap.style.display = '';
            const cb = UI.el('tpm-clean-confirm'); if (cb) cb.checked = false;
            const start = UI.el('tpm-clean-start'); if (start) start.disabled = true;
        },

        hidePreview() {
            const wrap = UI.el('tpm-clean-preview'); if (wrap) wrap.style.display = 'none';
        },

        // Fired by the Start button: run the stashed deletion.
        startRun() {
            if (!this._pendingRun) return;
            const run = this._pendingRun;
            this._pendingRun = null;
            this.hidePreview();
            run();
        },

        // Discard a parsed-but-not-started run and reset the file picker.
        cancelRun() {
            this._pendingRun = null;
            this.action = '';
            this.tIds = [];
            this.entries = [];
            this.idKey = '';
            this.hidePreview();
            const fi = UI.el('tpm-file'); if (fi) fi.value = '';
            this.info('Cancelled. Drop a file to start over.');
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

        // Resolve a GraphQL endpoint URL using the LIVE query id when we can find
        // it (X rotates these; a stale id makes the API return 200 with an error
        // body and silently delete nothing). Falls back to the known-good id.
        async graphqlUrl(opName, fallbackId) {
            const id = (await Core.resolveQueryId(opName)) || fallbackId;
            return `${Core.baseUrl}/i/api/graphql/${id}/${opName}`;
        },

        async sendRequest(url, body = `{"variables":{"tweet_id":"${this.tId}","dark_request":false},"queryId":"${url.split('/')[6]}"}`) {
            return new Promise(async (resolve) => {
                try {
                    const response = await fetch(url, {
                        headers: Core.apiHeaders(), referrer: `${Core.baseUrl}/${Core.username}/with_replies`,
                        referrerPolicy: 'strict-origin-when-cross-origin', body, method: 'POST', mode: 'cors',
                        credentials: 'include', signal: AbortSignal.timeout(8000)
                    });
                    if (response.status === 200) {
                        // GraphQL returns HTTP 200 even when the mutation FAILS. Inspect
                        // the body so a failed delete is never counted as a success — the
                        // exact bug where the bar advanced but nothing was deleted.
                        let payload = null;
                        try { payload = await response.clone().json(); } catch (_) { }
                        if (payload && Array.isArray(payload.errors) && payload.errors.length) {
                            const msg = payload.errors[0]?.message || 'unknown GraphQL error';
                            this._fails = (this._fails || 0) + 1;
                            console.warn(`[TPM] Delete FAILED for ${this.tId}: ${msg}`, payload.errors);
                            this.info(`Delete failed: ${msg} (${this.dCount} done).`);
                            // Sustained failures => stale query id, expired login or rotated
                            // CSRF. Stop instead of burning the rest of the list doing nothing.
                            if (this._fails >= 15) {
                                this.tIds = [];
                                this.info(`Stopped: ${this._fails} consecutive failures. "${msg}". The delete query id or your login/CSRF token is likely stale — reload X and rerun.`);
                                console.error('[TPM] Aborting: repeated GraphQL failures.');
                            }
                            resolve('error');
                            return;
                        }
                        this._fails = 0;
                        this.dCount++;
                        if (this.dCount <= 3 || this.dCount % 50 === 0) console.log(`[TPM] Deleted ${this.dCount} (last id ${this.tId}).`);
                        this.updateProgressBar(); await this.maybePause();
                        if (response.headers.get('x-rate-limit-remaining') != null && response.headers.get('x-rate-limit-remaining') < 1) {
                            this.ratelimitreset = response.headers.get('x-rate-limit-reset');
                            let s = this.ratelimitreset - Math.floor(Date.now() / 1000);
                            while (s > 0) { s = this.ratelimitreset - Math.floor(Date.now() / 1000); this.info(`Ratelimited. Waiting ${s}s. ${this.dCount} deleted.`); await Core.sleep(1000); }
                            resolve('deleted and waiting');
                        } else resolve('deleted');
                    } else if (response.status === 429) {
                        // Push the id back and wait out the reset instead of retrying hot.
                        this.tIds.push(this.tId);
                        const reset = parseInt(response.headers.get('x-rate-limit-reset'), 10);
                        let s = reset ? reset - Math.floor(Date.now() / 1000) : 60;
                        while (s > 0) { s = reset ? reset - Math.floor(Date.now() / 1000) : s - 1; this.info(`Ratelimited (429). Waiting ${Math.max(0, s)}s. ${this.dCount} deleted.`); await Core.sleep(1000); }
                        resolve('ratelimited');
                    } else {
                        let detail = '';
                        try { detail = (await response.clone().text()).slice(0, 200); } catch (_) { }
                        this._fails = (this._fails || 0) + 1;
                        console.warn(`[TPM] Delete HTTP ${response.status} for ${this.tId}. ${detail}`);
                        this.info(`Delete failed (HTTP ${response.status}). ${this.dCount} done.`);
                        if (this._fails >= 15) {
                            this.tIds = [];
                            this.info(`Stopped: 15 consecutive HTTP ${response.status} errors. Reload X / re-log in and retry.`);
                        }
                        resolve('error');
                    }
                } catch (error) {
                    // Timeout or network error: retry the id a few times (queued last),
                    // then drop it — a hard cap so one bad id can't hang the run.
                    const isTimeout = error.name === 'AbortError' || error.Name === 'AbortError';
                    console.warn('[TPM] Delete request failed:', error);
                    this._netRetries = this._netRetries || {};
                    const n = (this._netRetries[this.tId] || 0) + 1;
                    if (n < 3) {
                        this._netRetries[this.tId] = n;
                        this.tIds.unshift(this.tId);
                        let s = isTimeout ? 15 : 3;
                        while (s > 0) { s--; this.info(`${isTimeout ? 'Timeout' : 'Network error'}. Waiting ${s}s. ${this.dCount} deleted.`); await Core.sleep(1000); }
                    } else {
                        delete this._netRetries[this.tId];
                        console.warn(`[TPM] Giving up on ${this.tId} after ${n} network failures.`);
                    }
                    resolve('error');
                }
            });
        },

        async deleteTweets() {
            const url = await this.graphqlUrl('DeleteTweet', 'VaenaVgh5q5ih7kvyVjgtg');
            console.log(`[TPM] Deleting ${this.tIds.length} tweets via ${url.split('/').slice(5).join('/')}`);
            while (this.tIds.length > 0) {
                this.tId = this.tIds.pop();
                if (this.liveLikes && this.spareThreshold > 0) {
                    const likes = await this.getLikeCount(this.tId);
                    // Unknown like count (lookup failed) must spare, never delete.
                    if (likes === null || likes > this.spareThreshold) {
                        this.sparedCount++; if (this.total > 0) this.total--;
                        console.log(likes === null
                            ? `Spared ${this.tId} (like count unknown).`
                            : `Spared ${this.tId} (${likes} likes).`);
                        this.updateProgressBar(); continue;
                    }
                }
                await this.sendRequest(url);
            }
            this.tId = ''; this.updateProgressBar();
            this.info(`Done. Deleted ${this.dCount.toLocaleString()} tweets.`);
        },

        async deleteFavs() {
            const url = await this.graphqlUrl('UnfavoriteTweet', 'ZYKSe-w7KEslx3JhSIk5LA');
            while (this.tIds.length > 0) { this.tId = this.tIds.pop(); await this.sendRequest(url); }
            this.tId = ''; this.updateProgressBar(); this.info(`Done. Removed ${this.dCount.toLocaleString()} likes.`);
        },

        async deleteDMs() {
            const url = await this.graphqlUrl('DMMessageDeleteMutation', 'BJ6DtxA2llfjnRoRjaiIiw');
            while (this.tIds.length > 0) {
                this.tId = this.tIds.pop();
                await this.sendRequest(url, `{"variables":{"messageId":"${this.tId}"},"requestId":""}`);
            }
            this.tId = ''; this.updateProgressBar();
        },

        async deleteConvos() {
            const retries = {};
            while (this.tIds.length > 0) {
                this.tId = this.tIds.pop();
                const url = Core.baseUrl + this.deleteConvoURL.replace('USER_ID-CONVERSATION_ID', this.tId);
                let response;
                try {
                    response = await fetch(url, {
                        headers: Core.apiHeaders('application/x-www-form-urlencoded'), referrer: `${Core.baseUrl}/messages`,
                        body: 'dm_secret_conversations_enabled=false&krs_registration_enabled=true&cards_platform=Web-12&include_cards=1&include_ext_alt_text=true&include_ext_limited_action_results=true&include_quote_count=true&include_reply_count=1&tweet_mode=extended&include_ext_views=true&dm_users=false&include_groups=true&include_inbox_timelines=true&include_ext_media_color=true&supports_reactions=true&supports_edit=true&include_conversation_info=true',
                        method: 'POST', mode: 'cors', credentials: 'include', signal: AbortSignal.timeout(5000)
                    });
                } catch (error) {
                    // Timeout/network error: retry a few times, then skip — one bad
                    // request must not kill the whole run.
                    console.warn('[TPM] Convo delete request failed:', error);
                    retries[this.tId] = (retries[this.tId] || 0) + 1;
                    if (retries[this.tId] < 3) { this.tIds.unshift(this.tId); await Core.sleep(5000); }
                    continue;
                }
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
            let fails = 0;
            while (this.bookmarksNext.length > 0 || this.bookmarks.length === 0) {
                variables = this.bookmarksNext.length > 0
                    ? `{"count":20,"cursor":"${this.bookmarksNext}","includePromotedContent":false}`
                    : '{"count":20,"includePromotedContent":false}';
                try {
                    const response = await fetch(Core.baseUrl + this.bookmarksURL + new URLSearchParams({
                        variables,
                        features: '{"graphql_timeline_v2_bookmark_timeline":true,"rweb_tipjar_consumption_enabled":true,"responsive_web_graphql_exclude_directive_enabled":true,"verified_phone_label_enabled":false,"creator_subscriptions_tweet_preview_api_enabled":true,"responsive_web_graphql_timeline_navigation_enabled":true,"responsive_web_graphql_skip_user_profile_image_extensions_enabled":false,"communities_web_enable_tweet_community_results_fetch":true,"c9s_tweet_anatomy_moderator_badge_enabled":true,"articles_preview_enabled":true,"responsive_web_edit_tweet_api_enabled":true,"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"view_counts_everywhere_api_enabled":true,"longform_notetweets_consumption_enabled":true,"responsive_web_twitter_article_tweet_consumption_enabled":true,"tweet_awards_web_tipping_enabled":false,"creator_subscriptions_quote_tweet_preview_enabled":false,"freedom_of_speech_not_reach_fetch_enabled":true,"standardized_nudges_misinfo":true,"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":true,"rweb_video_timestamps_enabled":true,"longform_notetweets_rich_text_read_enabled":true,"longform_notetweets_inline_media_enabled":true,"responsive_web_enhance_cards_enabled":false}'
                    }), { headers: Core.apiHeaders(), referrer: `${Core.baseUrl}/i/bookmarks`, referrerPolicy: 'strict-origin-when-cross-origin', method: 'GET', mode: 'cors', credentials: 'include' });

                    if (response.status === 200) {
                        const data = await response.json();
                        const entries = data?.data?.bookmark_timeline_v2?.timeline?.instructions?.[0]?.entries || [];
                        entries.forEach((item) => {
                            if (item.entryId?.includes('tweet')) { this.dCount++; this.bookmarks.push(item.content?.itemContent?.tweet_results?.result); }
                            else if (item.entryId?.includes('cursor-bottom')) { this.bookmarksNext = this.bookmarksNext !== item.content.value ? item.content.value : ''; }
                        });
                        this.info(`${this.dCount} bookmarks collected`);
                        fails = 0;
                        const remaining = response.headers.get('x-rate-limit-remaining');
                        if (remaining != null && remaining < 1) {
                            this.ratelimitreset = response.headers.get('x-rate-limit-reset');
                            let s = this.ratelimitreset - Math.floor(Date.now() / 1000);
                            while (s > 0) { s = this.ratelimitreset - Math.floor(Date.now() / 1000); this.info(`Ratelimited. Waiting ${s}s. ${this.dCount} collected.`); await Core.sleep(1000); }
                        }
                    } else {
                        console.log(response);
                        if (++fails >= 5) { this.info(`Bookmark export stopped after ${fails} failed requests (${this.bookmarks.length} collected).`); break; }
                        await Core.sleep(3000);
                    }
                } catch (error) {
                    console.warn('[TPM] Bookmark export error:', error);
                    if (++fails >= 5) { this.info(`Bookmark export stopped after repeated errors (${this.bookmarks.length} collected).`); break; }
                    await Core.sleep(3000);
                }
            }
            if (!this.bookmarks.length) { this.info('No bookmarks collected.'); return; }
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

        // Best-effort post date from a rendered tweet. Prefers the <time> tag,
        // falls back to the snowflake id in the permalink. Null = unknown.
        tweetDate(tweetEl) {
            const dt = tweetEl.querySelector('time[datetime]')?.getAttribute('datetime');
            const t = dt ? Date.parse(dt) : NaN;
            if (!isNaN(t)) return new Date(t);
            const id = this.tweetStatusId(tweetEl);
            return id ? Core.snowflakeToDate(id) : null;
        },

        tweetStatusId(tweetEl) {
            const m = (tweetEl?.querySelector('a[href*="/status/"]')?.getAttribute('href') || '').match(/status\/(\d+)/);
            return m ? m[1] : null;
        },

        async slowDelete(resume = false) {
            let session = Core.store.get(this.slowSessionKey, null);
            if (resume) {
                if (!session || !session.active) return;
            } else {
                // Irreversible: require an explicit confirm before touching the profile.
                if (!window.confirm('Slow delete will permanently delete tweets straight from your profile. This cannot be undone. Continue?')) return;
                session = {
                    active: true, deleted: 0,
                    skipDays: UI.el('tpm-skipDays').value, spareLikes: UI.el('tpm-spareLikes').value,
                    liveLikes: UI.el('tpm-liveLikes').checked, pauseEvery: UI.el('tpm-pauseEvery').value,
                    pauseMinutes: UI.el('tpm-pauseMinutes').value
                };
            }
            // Restore the session's settings so this page lifetime continues the same job.
            UI.el('tpm-skipDays').value = session.skipDays || '';
            UI.el('tpm-spareLikes').value = session.spareLikes || '';
            UI.el('tpm-liveLikes').checked = !!session.liveLikes;
            UI.el('tpm-pauseEvery').value = session.pauseEvery || 190;
            UI.el('tpm-pauseMinutes').value = session.pauseMinutes || 15;
            // autoResume is consumed here; only the crash-recovery reloads set it again.
            session.autoResume = 0;
            Core.store.set(this.slowSessionKey, session);
            const endSession = () => Core.store.set(this.slowSessionKey, null);
            const rb = UI.el('tpm-slow-resume'); if (rb) rb.style.display = 'none';

            // X's heap can blow up mid-run ("Uncaught out of memory"). Watch for
            // those errors so the crash clock starts at the real moment of death
            // — a crashed-but-alive page reloads itself after 60 minutes crashed.
            if (!this._oomWatch) {
                this._oomWatch = (e) => {
                    const text = String((e && (e.message || e.reason)) || '');
                    if (!/out of memory|oom/i.test(text)) return;
                    const cur = Core.store.get(this.slowSessionKey, null);
                    if (cur && cur.active && !cur.crashedAt) {
                        cur.crashedAt = Date.now();
                        Core.store.set(this.slowSessionKey, cur);
                    }
                };
                window.addEventListener('error', this._oomWatch);
                window.addEventListener('unhandledrejection', this._oomWatch);
            }

            this.readSettings();
            const skipDays = parseInt(UI.el('tpm-skipDays')?.value, 10) || 0;
            const cutoff = Date.now() - skipDays * 86400000;
            const drop = UI.el('tpm-drop'); if (drop) drop.style.display = 'none';
            this.dCount = session.deleted || 0;
            let pageDeletes = 0;
            await this.ensureTweetCount();
            this.total = this.TweetCount;
            this.createProgressBar();

            const list = document.querySelectorAll('[data-testid="ScrollSnap-List"] a');
            if (list[1]) list[1].click();
            await Core.sleep(2000);

            // Guard against running on the wrong timeline (e.g. the infinite home
            // feed): slow delete only makes sense on your own profile page. If
            // we're elsewhere, go there and auto-start instead of bailing.
            if (Core.username && !location.pathname.toLowerCase().includes(`/${Core.username.toLowerCase()}`)) {
                session.autoResume = 1;
                Core.store.set(this.slowSessionKey, session);
                this.info('Opening your profile page to start the delete…');
                await Core.sleep(1000);
                location.replace(`${Core.baseUrl}/${Core.username}`);
                return;
            }

            let consecutiveErrors = 0;
            const maxConsecutiveErrors = 8;
            const more = '[data-testid="tweet"] [data-testid="caret"]';
            let emptyScans = 0;
            const maxEmptyScans = 12;
            let stuckCount = 0, lastTopId = '';
            let exitReason = '';
            let waitRounds = 0;
            const waitSeconds = 300;
            const stallReloadAfter = 3600;   // 1h of dead timeline => reload the page

            try {
            while (true) {
                await Core.sleep(1200);
                // Crash clock: once X has been out of memory for a full hour the
                // page will never recover on its own — reload for a clean heap.
                const live = Core.store.get(this.slowSessionKey, null);
                if (live && live.crashedAt && Date.now() - live.crashedAt >= 3600000) {
                    live.crashedAt = 0;
                    live.autoResume = 1;
                    Core.store.set(this.slowSessionKey, live);
                    this.info('Crashed for 60 minutes — reloading the page to recover. It resumes automatically.');
                    await Core.sleep(2000);
                    location.reload();
                    return;
                }
                document.querySelectorAll('section [data-testid="cellInnerDiv"]>div>div>div').forEach(x => x.remove());
                document.querySelectorAll('section [data-testid="cellInnerDiv"]>div>div>[role="link"]').forEach(x => x.remove());

                if (document.querySelectorAll(more).length === 0) {
                    const retry = Array.from(document.querySelectorAll('[role="button"], button')).find(b => /retry|try again|reload/i.test(b.textContent));
                    if (retry) retry.click();
                    window.scrollTo(0, document.body.scrollHeight);
                    if (++emptyScans >= maxEmptyScans) {
                        if (waitRounds * waitSeconds >= stallReloadAfter) {
                            // An hour of dead timeline: either the list is exhausted or the
                            // page is wedged (X leaks memory until it crashes). If this page
                            // lifetime deleted nothing AND the reload before it also deleted
                            // nothing, call it end-of-list; otherwise reload for a clean heap.
                            if (pageDeletes === 0) {
                                session.staleReloads = (session.staleReloads || 0) + 1;
                                if (session.staleReloads >= 2) {
                                    exitReason = 'the timeline stayed dead for over 2 hours across a reload — the list looks fully deleted';
                                    break;
                                }
                            } else session.staleReloads = 0;
                            session.crashedAt = 0;
                            session.autoResume = 1;
                            session.beat = Date.now();
                            Core.store.set(this.slowSessionKey, session);
                            this.info('Timeline dead for 60 minutes — reloading the page to recover. It resumes automatically.');
                            await Core.sleep(2000);
                            location.reload();
                            return;
                        }
                        // X rate-limits the timeline itself during bulk deletes.
                        // Wait it out, then keep trying instead of quitting.
                        waitRounds++;
                        session.beat = Date.now();
                        Core.store.set(this.slowSessionKey, session);
                        let s = waitSeconds;
                        while (s > 0) { s--; this.info(`Timeline stopped loading. Retrying in ${Core.fmtDuration(s)} (stalled ${Math.round((waitRounds * waitSeconds) / 60)}m of 60m). ${this.dCount} deleted.`); await Core.sleep(1000); }
                        emptyScans = 0;
                    }
                    await Core.sleep(6000); continue;
                }
                emptyScans = 0; waitRounds = 0;

                const caretEl = document.querySelector(more);
                const tweetEl = caretEl ? caretEl.closest('[data-testid="tweet"]') : document.querySelector('[data-testid="tweet"]');

                // Hang watchdog: if the same post sits on top for too many passes,
                // nothing advances (X silently refusing deletes, or a re-rendered
                // row). Try one recovery, then stop cleanly instead of spinning.
                const topId = this.tweetStatusId(tweetEl) || '';
                if (topId && topId === lastTopId) stuckCount++;
                else { stuckCount = 0; lastTopId = topId; }
                if (stuckCount === 10) {
                    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                    window.scrollTo(0, document.body.scrollHeight);
                }
                if (stuckCount >= 20) {
                    this.info(`Stopped: the same post stayed on top for 20 passes (likely an X rate limit). Wait 10-15 minutes, then press Resume above. ${this.dCount} deleted.`);
                    return;
                }

                if (tweetEl && Core.username) {
                    const author = this.tweetAuthorHandle(tweetEl);
                    if (author && author !== Core.username.toLowerCase()) { tweetEl.remove(); continue; }
                }
                if (tweetEl && skipDays > 0) {
                    const date = this.tweetDate(tweetEl);
                    // Unknown date => spare it; deleting on a guess is irreversible.
                    if (!date || date.getTime() > cutoff) { this.sparedCount++; if (this.total > 0) this.total--; tweetEl.remove(); this.updateProgressBar(); continue; }
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
                            const notMine = moreElement.closest('[data-testid="tweet"]') || document.querySelector('[data-testid="tweet"]');
                            if (notMine) notMine.remove();
                        } else {
                            menu.click();
                            const confirmation = await Core.waitForElem('[data-testid="confirmationSheetConfirm"]');
                            if (!confirmation) throw new Error('delete confirmation did not appear');
                            confirmation.click();
                        }
                    }
                    this.dCount++; pageDeletes++;
                    session.deleted = this.dCount;
                    session.staleReloads = 0;
                    session.beat = Date.now();
                    Core.store.set(this.slowSessionKey, session);
                    this.updateProgressBar(); await this.maybePause();
                    consecutiveErrors = 0;
                    if (this.dCount % 100 === 0) console.log(`${new Date().toUTCString()} Deleted ${this.dCount} Tweets`);
                } catch (error) {
                    consecutiveErrors++;
                    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                    const backoff = Math.min(60000, 4000 * consecutiveErrors);
                    this.info(`Hit a snag (likely a rate limit). Waiting ${Math.round(backoff / 1000)}s. ${this.dCount} deleted.`);
                    await Core.sleep(backoff);
                    if (consecutiveErrors >= maxConsecutiveErrors) {
                        exitReason = `${maxConsecutiveErrors} consecutive UI errors (usually an X rate limit on deletions)`;
                        break;
                    }
                }
            }
            if (!exitReason) {
                endSession();
                this.info(`Finished. Total deleted: ${this.dCount} Tweets. Reload to confirm.`);
            } else if (exitReason.includes('fully deleted')) {
                endSession();
                this.info(`Finished. Total deleted: ${this.dCount} Tweets. ${exitReason}. Reload to confirm.`);
            } else {
                this.info(`Stopped early: ${exitReason}. ${this.dCount} deleted so far. Wait 10-15 minutes, then press Resume above.`);
            }
            } catch (err) {
                // OOM or DOM failure mid-run: keep the session alive so the user
                // can resume instead of losing the place in the list.
                console.error('[TPM] Slow delete crashed:', err);
                this.info(`Slow delete crashed (${(err && err.message) || err}). The session is saved — press Resume above to continue.`);
            }
        }
    };
