/**
 * @module slowgql
 * @see docs/modules/slowgql.md
 */
    /* ===================================================================== *
     *  SLOWGQL — list own tweets via GraphQL, no timeline scrolling          *
     * ===================================================================== */
    const SlowGql = {
        _features() {
            return {
                rweb_tipjar_consumption_enabled: true,
                responsive_web_graphql_exclude_directive_enabled: true,
                verified_phone_label_enabled: false,
                creator_subscriptions_tweet_preview_api_enabled: true,
                responsive_web_graphql_timeline_navigation_enabled: true,
                responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
                communities_web_enable_tweet_community_results_fetch: true,
                c9s_tweet_anatomy_moderator_badge_enabled: true,
                articles_preview_enabled: true,
                responsive_web_edit_tweet_api_enabled: true,
                graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
                view_counts_everywhere_api_enabled: true,
                longform_notetweets_consumption_enabled: true,
                responsive_web_twitter_article_tweet_consumption_enabled: true,
                tweet_awards_web_tipping_enabled: false,
                freedom_of_speech_not_reach_fetch_enabled: true,
                standardized_nudges_misinfo: true,
                tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
                rweb_video_timestamps_enabled: true,
                longform_notetweets_rich_text_read_enabled: true,
                longform_notetweets_inline_media_enabled: true,
                responsive_web_enhance_cards_enabled: false,
                creator_subscriptions_quote_tweet_preview_enabled: false,
                profile_label_improvements_pcf_label_in_post_enabled: false
            };
        },

        _walk(obj, uid, out) {
            if (!obj) return;
            if (Array.isArray(obj)) { obj.forEach((v) => this._walk(v, uid, out)); return; }
            if (typeof obj !== 'object') return;
            const res = obj.tweet_results || obj.tweetResult;
            let result = res && res.result;
            if (result && result.__typename === 'TweetWithVisibilityResults') result = result.tweet;
            if (result && result.legacy) {
                const owner = String((((result.core || {}).user_results || {}).result || {}).rest_id || '');
                const id = String(result.rest_id || result.legacy.id_str || '');
                if (id && owner === uid) {
                    out.push({
                        id,
                        likes: parseInt(result.legacy.favorite_count, 10) || 0,
                        reply: !!result.legacy.in_reply_to_status_id_str
                    });
                }
            }
            Object.values(obj).forEach((v) => { if (v && typeof v === 'object') this._walk(v, uid, out); });
        },

        // Bottom only. ShowMoreThreads expands one thread and stalls the profile scan.
        _cursors(obj, out) {
            if (!obj) return;
            if (Array.isArray(obj)) { obj.forEach((v) => this._cursors(v, out)); return; }
            if (typeof obj !== 'object') return;
            if (obj.cursorType === 'Bottom' && obj.value) out.push(obj.value);
            Object.values(obj).forEach((v) => { if (v && typeof v === 'object') this._cursors(v, out); });
        },

        async _post(op, variables) {
            const fallback = 'bnsYxFljT6y98rFwiGr3fw';
            const qid = (await Core.resolveQueryId(op)) || fallback;
            const url = `${Core.baseUrl}/i/api/graphql/${qid}/${op}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: Core.apiHeaders(),
                credentials: 'include',
                referrer: `${Core.baseUrl}/${Core.username || ''}`,
                body: JSON.stringify({ variables, features: this._features(), queryId: qid }),
                signal: AbortSignal.timeout(30000)
            });
            return res;
        },

        // UserTweets (posts only) returns about eight pages, then an empty page
        // with the same Bottom cursor. Older posts still exist on
        // UserTweetsAndReplies. Both tabs use that timeline. eligible() splits them.
        async collect(tab, onPage) {
            const uid = String(Core.userId || Core.getUserId() || '');
            if (!uid) throw new Error('Not logged in (no twid cookie).');
            const op = 'UserTweetsAndReplies';
            const seen = {};
            let cursor = null;
            let emptyRun = 0;
            let page = 0;
            while (page < 4000) {
                if (Cleanup.stopFlag) break;
                await Cleanup.waitWhilePaused();
                const variables = {
                    userId: uid, count: 100, includePromotedContent: false,
                    withCommunity: true, withVoice: true, withV2Timeline: true
                };
                if (cursor) variables.cursor = cursor;
                let res;
                try { res = await this._post(op, variables); }
                catch (e) {
                    Cleanup.info(`List network error. Waiting 8s… (${Object.keys(seen).length} found)`);
                    await Core.sleep(8000);
                    continue;
                }
                if (res.status === 429) {
                    const reset = parseInt(res.headers.get('x-rate-limit-reset'), 10);
                    let s = reset ? reset - Math.floor(Date.now() / 1000) : 60;
                    while (s > 0 && !Cleanup.stopFlag) {
                        Cleanup.info(`Listing ratelimited. Waiting ${Math.max(0, s)}s. ${Object.keys(seen).length} found.`);
                        await Core.sleep(1000);
                        s = reset ? reset - Math.floor(Date.now() / 1000) : s - 1;
                    }
                    continue;
                }
                if (!res.ok) throw new Error(`List HTTP ${res.status}`);
                page += 1;
                const data = await res.json();
                const batch = [];
                this._walk(data, uid, batch);
                if (Array.isArray(data.errors) && data.errors.length && !batch.length) {
                    throw new Error(data.errors[0].message || 'List failed');
                }
                let neu = 0;
                batch.forEach((t) => { if (!seen[t.id]) { seen[t.id] = t; neu++; } });
                const cursors = [];
                this._cursors(data, cursors);
                if (onPage) onPage(page, neu, Object.keys(seen).length);
                const next = cursors.length ? cursors[cursors.length - 1] : null;
                if (!next || next === cursor) break;
                emptyRun = neu === 0 ? emptyRun + 1 : 0;
                if (emptyRun >= 5) break;
                cursor = next;
                await Core.sleep(800);
            }
            return Object.values(seen);
        },

        eligible(t, tab, skipDays, spareLikes) {
            if (tab === 'posts' && t.reply) return false;
            if (tab === 'replies' && !t.reply) return false;
            if (skipDays > 0) {
                const d = Core.snowflakeToDate(t.id);
                if (!d) return false;
                if (d.getTime() > Date.now() - skipDays * 86400000) return false;
            }
            if (spareLikes > 0 && t.likes > spareLikes) return false;
            return true;
        }
    };
