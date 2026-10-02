/**
 * @module listgql
 * @see docs/modules/listgql.md
 */
    /* ===================================================================== *
     *  LISTGQL — paginate Followers / Following. POST only. GET 404s.       *
     * ===================================================================== */
    const ListGql = {
        // Flags copied from the logged-in client operation metadata.
        // X rejects a Followers call when a listed flag is missing.
        _features() {
            const on = [
                'rweb_video_screen_enabled', 'rweb_cashtags_enabled',
                'profile_label_improvements_pcf_label_in_post_enabled',
                'responsive_web_profile_redirect_enabled', 'rweb_tipjar_consumption_enabled',
                'creator_subscriptions_tweet_preview_api_enabled',
                'responsive_web_graphql_timeline_navigation_enabled',
                'communities_web_enable_tweet_community_results_fetch',
                'c9s_tweet_anatomy_moderator_badge_enabled',
                'responsive_web_grok_analyze_button_fetch_trends_enabled',
                'responsive_web_grok_analyze_post_followups_enabled',
                'rweb_cashtags_composer_attachment_enabled', 'responsive_web_jetfuel_frame',
                'rweb_sports_post_context_enabled', 'responsive_web_grok_share_attachment_enabled',
                'responsive_web_grok_annotations_enabled', 'articles_preview_enabled',
                'responsive_web_edit_tweet_api_enabled', 'rweb_conversational_replies_downvote_enabled',
                'graphql_is_translatable_rweb_tweet_is_translatable_enabled',
                'view_counts_everywhere_api_enabled', 'longform_notetweets_consumption_enabled',
                'responsive_web_twitter_article_tweet_consumption_enabled',
                'content_disclosure_indicator_enabled', 'content_disclosure_ai_generated_indicator_enabled',
                'responsive_web_grok_show_grok_translated_post',
                'responsive_web_grok_analysis_button_from_backend', 'post_ctas_fetch_enabled',
                'freedom_of_speech_not_reach_fetch_enabled', 'standardized_nudges_misinfo',
                'tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled',
                'longform_notetweets_rich_text_read_enabled', 'longform_notetweets_inline_media_enabled',
                'responsive_web_nested_quote_preview_enabled',
                'responsive_web_grok_image_annotation_enabled',
                'responsive_web_grok_imagine_annotation_enabled',
                'responsive_web_grok_community_note_auto_translation_is_enabled'
            ];
            const features = {};
            on.forEach((k) => { features[k] = true; });
            features.verified_phone_label_enabled = false;
            features.premium_content_api_read_enabled = false;
            features.responsive_web_enhance_cards_enabled = false;
            return features;
        },

        _toggles() {
            return {
                withPayments: false, withAuxiliaryUserLabels: false,
                withArticleRichContentState: false, withArticlePlainText: false,
                withGrokAnalyze: false, withDisallowedReplyControls: false
            };
        },

        // List rows no longer carry legacy.screen_name. Read core + privacy.
        mapUser(user) {
            if (!user || (user.__typename && user.__typename !== 'User')) return null;
            const lg = user.legacy || {};
            const core = user.core || {};
            const priv = user.privacy || {};
            const handle = lg.screen_name || core.screen_name || '';
            if (!handle) return null;
            const counts = user.relationship_counts || {};
            const avatar = (user.avatar && user.avatar.image_url) || '';
            const rel = user.relationship_perspectives || {};
            let loc = lg.location;
            if (loc == null) {
                const node = user.location;
                loc = node && typeof node === 'object' ? (node.location || '') : (node || '');
            }
            let protectedFlag = lg.protected;
            if (protectedFlag == null) protectedFlag = priv.protected;
            return {
                handle,
                name: lg.name || core.name || handle,
                mutual: !!(rel.following && rel.followed_by),
                private: !!protectedFlag,
                followers: lg.followers_count != null ? lg.followers_count : (counts.followers != null ? counts.followers : null),
                following: lg.friends_count != null ? lg.friends_count : (counts.following != null ? counts.following : null),
                defaultImage: lg.default_profile_image != null ? !!lg.default_profile_image : /default_profile/i.test(avatar),
                bio: lg.description || (user.profile_bio && user.profile_bio.description) || '',
                location: loc || '',
                createdAt: lg.created_at || core.created_at || null,
                id: user.rest_id || lg.id_str || null
            };
        },

        _parse(data) {
            const instructions = data?.data?.user?.result?.timeline?.timeline?.instructions || [];
            const accounts = [];
            let cursor = '';
            for (const ins of instructions) {
                for (const entry of ins.entries || []) {
                    const eid = entry.entryId || '';
                    const content = entry.content || {};
                    if (eid.indexOf('cursor-bottom') === 0 || content.cursorType === 'Bottom') {
                        cursor = content.value || cursor;
                        continue;
                    }
                    if (eid.indexOf('user-') !== 0) continue;
                    const result = content.itemContent?.user_results?.result;
                    const mapped = this.mapUser(result);
                    if (mapped) accounts.push(mapped);
                }
            }
            return { accounts, cursor };
        },

        async _post(op, queryId, variables) {
            const res = await fetch(`${Core.baseUrl}/i/api/graphql/${queryId}/${op}`, {
                method: 'POST',
                headers: Core.apiHeaders(),
                credentials: 'include',
                referrer: `${Core.baseUrl}/${Core.username || ''}`,
                body: JSON.stringify({
                    variables, features: this._features(), fieldToggles: this._toggles(), queryId
                }),
                signal: AbortSignal.timeout(30000)
            });
            return res;
        },

        /**
         * Cursor-paginate a follow list. The server returns about 50 rows per
         * page even when count is higher. Returns null when the first page fails.
         */
        async collect(op, queryId, userId, opts, shouldStop) {
            const onProgress = (opts && opts.onProgress) || function () { };
            const stop = shouldStop || function () { return false; };
            const seen = new Map();
            let cursor = '';
            let pages = 0;
            let firstOk = false;
            let qid = queryId;
            let refreshed = false;
            const maxPages = (opts && opts.maxPages) || 8000;
            while (pages < maxPages && !stop()) {
                const variables = {
                    userId: String(userId), count: 50,
                    includePromotedContent: false, withGrokTranslatedBio: false
                };
                if (cursor) variables.cursor = cursor;
                let res;
                try {
                    res = await this._post(op, qid, variables);
                } catch (e) {
                    console.warn(`[TPM] ${op} request threw:`, e);
                    if (!firstOk) return null;
                    break;
                }
                // A stale query id returns 404. Resolve once and retry the same page.
                if (res.status === 404 && !refreshed) {
                    delete Core._queryIds[op];
                    delete Core._queryIdMisses[op];
                    refreshed = true;
                    const fresh = await Core.resolveQueryId(op);
                    if (fresh) { qid = fresh; continue; }
                }
                if (res.status === 429) {
                    const reset = parseInt(res.headers.get('x-rate-limit-reset'), 10);
                    let s = reset ? reset - Math.floor(Date.now() / 1000) : 60;
                    while (s > 0 && !stop()) {
                        onProgress(seen.size, s);
                        await Core.sleep(1000);
                        s = reset ? reset - Math.floor(Date.now() / 1000) : s - 1;
                    }
                    continue;
                }
                if (res.status === 404) {
                    delete Core._queryIds[op];
                    delete Core._queryIdMisses[op];
                }
                if (res.status !== 200) {
                    let body = '';
                    try { body = (await res.text()).slice(0, 300); } catch (_) { }
                    console.warn(`[TPM] ${op} HTTP ${res.status}: ${body}`);
                    if (!firstOk) return null;
                    break;
                }
                let data;
                try { data = await res.json(); } catch (e) {
                    console.warn(`[TPM] ${op} bad JSON:`, e);
                    if (!firstOk) return null;
                    break;
                }
                firstOk = true;
                if (Array.isArray(data?.errors) && data.errors.length && !data?.data) {
                    console.warn(`[TPM] ${op} GraphQL errors:`, data.errors);
                    break;
                }
                const page = this._parse(data);
                if (!page.accounts.length && pages === 0) {
                    console.warn(`[TPM] ${op} page 1 had no entries — response shape:`, JSON.stringify(data).slice(0, 400));
                }
                let added = 0;
                for (const acc of page.accounts) {
                    const key = acc.handle.toLowerCase();
                    if (seen.has(key)) continue;
                    seen.set(key, acc);
                    added++;
                }
                pages++;
                onProgress(seen.size, 0);
                if (!page.cursor || page.cursor === cursor || added === 0) break;
                cursor = page.cursor;
                await Core.sleep(400 + Core.rand(0, 300));
            }
            return [...seen.values()];
        }
    };
