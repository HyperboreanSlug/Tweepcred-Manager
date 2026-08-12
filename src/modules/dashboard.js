/**
 * @module dashboard
 * @see docs/modules/dashboard.md
 */
    /* ===================================================================== *
     *  DASHBOARD — estimates tweepcred from public signals + recommendations *
     * ===================================================================== */
    const Dashboard = {
        firstShow: true,
        _statsFetched: false,
        _statsFetching: false,

        onShow() {
            if (this.firstShow) {
                this.render();
                this.firstShow = false;
            }
            // Re-run on every visit so values fill in once you've reached your
            // profile (and so the API fetch gets another chance). Existing/edited
            // fields are never overwritten.
            this.autofill();
        },

        render() {
            UI.el('tpm-pane-dashboard').innerHTML = `
              <div class="tpm-section">
                <h4>Tweepcred (legacy 2023 algorithm)</h4>
                <p>This reproduces X's open-source <code>UserMass</code> + reputation adjustment <strong>exactly</strong>. The score X actually published also ran a global PageRank over the follow graph, which can't be computed in a browser, so this is the per-user mass that <em>seeds</em> that PageRank. Below ~65, the old search filter cut an account's eligible tweets to about 3.</p>
                <div class="tpm-score">
                  <div class="tpm-score-num" id="tpm-score-num">–</div>
                  <div class="tpm-score-meta">
                    <div class="tpm-score-label" id="tpm-score-label">Enter your numbers below</div>
                    <div class="tpm-track"><div class="tpm-fill" id="tpm-score-fill"></div></div>
                  </div>
                </div>
                <div id="tpm-factors" style="margin-top:14px"></div>
              </div>

              <div class="tpm-section">
                <h4>Account</h4>
                <p>Look up any public handle, or use your own (auto-filled). Numbers stay editable.</p>
                <label class="tpm-label" for="tpm-d-handle">Handle</label>
                <div class="tpm-row">
                  <div style="flex:2"><input id="tpm-d-handle" type="text" class="tpm-input" placeholder="@username"></div>
                  <div><button class="tpm-btn tpm-btn-ghost" id="tpm-d-lookup" type="button">Look up</button></div>
                </div>
                <div class="tpm-row">
                  <div><label class="tpm-label">Followers</label><input id="tpm-d-followers" type="number" class="tpm-input" placeholder="0"></div>
                  <div><label class="tpm-label">Following</label><input id="tpm-d-following" type="number" class="tpm-input" placeholder="0"></div>
                </div>
                <label class="tpm-label" for="tpm-d-age">Account age (days) — only the first ~30 days matter</label>
                <input id="tpm-d-age" type="number" class="tpm-input" placeholder="e.g. 365">
                <label class="tpm-check"><input type="checkbox" id="tpm-d-verified"> Legacy verified (old blue check; sets mass to 100). X Premium does NOT count here.</label>
                <label class="tpm-check"><input type="checkbox" id="tpm-d-device" checked> Valid device / verified phone (assumed; can't be read)</label>
                <label class="tpm-check"><input type="checkbox" id="tpm-d-restricted"> Account restricted (×0.1 penalty)</label>
                <div class="tpm-btns">
                  <button class="tpm-btn tpm-btn-primary" id="tpm-d-calc" type="button">Recalculate</button>
                </div>
              </div>

              <div class="tpm-section">
                <h4>Recommendations</h4>
                <ul id="tpm-recs"><li>Fill in your numbers and recalculate.</li></ul>
              </div>
              <div class="tpm-foot">Exact reproduction of UserMass.scala + Reputation.scala (minus the global PageRank stage).</div>`;

            UI.el('tpm-d-calc').onclick = () => this.calculate();
            UI.el('tpm-d-lookup').onclick = () => {
                const h = (UI.el('tpm-d-handle').value || '').replace(/^@/, '').trim();
                if (h) this.fetchProfileStats(h, true);
            };
            ['tpm-d-followers', 'tpm-d-following', 'tpm-d-age'].forEach(id => {
                UI.el(id).addEventListener('input', () => this.calculate());
            });
            ['tpm-d-verified', 'tpm-d-device', 'tpm-d-restricted'].forEach(id => {
                UI.el(id).addEventListener('change', () => this.calculate());
            });
        },

        // Fill only blank fields, so we never clobber values the user typed.
        setIfEmpty(id, val) {
            if (val == null || val === '') return;
            const el = UI.el(id);
            if (el && el.value.trim() === '') el.value = val;
        },

        // Read what the page DOM exposes, then fetch authoritative numbers from
        // the API (works from any page and reliably provides account age + the
        // verified flag the score needs).
        autofill() {
            const grab = (suffixes) => {
                for (const sfx of suffixes) {
                    const a = document.querySelector(`a[href$="${sfx}"]`);
                    if (a) {
                        const strong = a.querySelector('span');
                        const n = Core.parseCount(a.getAttribute('title') || (strong && strong.textContent) || a.textContent);
                        if (n != null) return n;
                    }
                }
                return null;
            };
            this.setIfEmpty('tpm-d-followers', grab(['/verified_followers', '/followers']));
            this.setIfEmpty('tpm-d-following', grab(['/following']));
            if (Core.username && !Core.isReservedName(Core.username)) this.setIfEmpty('tpm-d-handle', '@' + Core.username);

            this.calculate();
            this.fetchProfileStats();
        },

        // Authoritative profile stats via UserByScreenName for `handle` (defaults
        // to the logged-in user). `force` re-runs even after a prior fetch and
        // overwrites fields (used by the "Look up" button). Fails quietly.
        async fetchProfileStats(handle, force = false) {
            const screen_name = (handle || Core.username || '').replace(/^@/, '').trim();
            if (!screen_name || Core.isReservedName(screen_name)) return;
            if (!force && (this._statsFetched || this._statsFetching)) return;
            this._statsFetching = true;
            try {
                const variables = JSON.stringify({ screen_name, withSafetyModeUserFields: true });
                const features = JSON.stringify({
                    hidden_profile_subscriptions_enabled: true, rweb_tipjar_consumption_enabled: true,
                    responsive_web_graphql_exclude_directive_enabled: true, verified_phone_label_enabled: false,
                    subscriptions_verification_info_is_identity_verified_enabled: true,
                    subscriptions_verification_info_verified_since_enabled: true, highlights_tweets_tab_ui_enabled: true,
                    responsive_web_twitter_article_notes_tab_enabled: true, subscriptions_feature_can_gift_premium: true,
                    creator_subscriptions_tweet_preview_api_enabled: true,
                    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
                    responsive_web_graphql_timeline_navigation_enabled: true
                });
                const queryId = await Core.resolveQueryId('UserByScreenName');
                if (!queryId) {
                    console.log('[TPM] Could not resolve the UserByScreenName query id from the page bundles. Open any X profile once and retry.');
                    return;
                }
                const url = `${Core.baseUrl}/i/api/graphql/${queryId}/UserByScreenName?` + new URLSearchParams({ variables, features });
                const res = await fetch(url, {
                    headers: Core.apiHeaders(), referrer: `${Core.baseUrl}/${screen_name}`,
                    referrerPolicy: 'strict-origin-when-cross-origin', method: 'GET', mode: 'cors',
                    credentials: 'include', signal: AbortSignal.timeout(8000)
                });
                if (res.status !== 200) {
                    // A stale sniffed/cached id can 404; drop it so the next try re-resolves.
                    if (res.status === 404) { delete Core._queryIds['UserByScreenName']; delete Core._queryIdMisses['UserByScreenName']; }
                    console.log(`[TPM] Profile fetch failed (HTTP ${res.status}) for @${screen_name}.`);
                    return;
                }
                const result = (await res.json())?.data?.user?.result;
                const lg = result?.legacy;
                if (!lg) return;
                const set = (id, v) => { const el = UI.el(id); if (el && v != null) el.value = v; };
                const fill = force ? set : ((id, v) => this.setIfEmpty(id, v));
                fill('tpm-d-followers', lg.followers_count);
                fill('tpm-d-following', lg.friends_count);
                if (lg.created_at) {
                    const days = Math.max(0, Math.round((Date.now() - new Date(lg.created_at).getTime()) / 86400000));
                    fill('tpm-d-age', days);
                }
                // The 2023 mass formula's isVerified is LEGACY verification only
                // (safety.verified), NOT X Premium / blue. Reproduce that exactly.
                UI.el('tpm-d-verified').checked = !!lg.verified;
                if (!force) this._statsFetched = true;
                this.calculate();
            } catch (e) {
                console.log('[TPM] Profile fetch error:', e);
            } finally {
                this._statsFetching = false;
            }
        },

        // Exact reproduction of the 2023 open-source tweepcred maths:
        //   UserMass.getUserMass  +  Reputation.adjustReputationsPostCalculation
        // Constants and operators are copied verbatim from the source. The only
        // stage we cannot run is the global PageRank that consumes this mass, so
        // the number shown is the per-user mass/prior, not the PageRank output.
        computeMass(inp) {
            // --- UserMass.scala constants ---
            const deviceWeightAdditive = 0.5;
            const restrictedWeightMultiplicative = 0.1;
            const threshAbsNumFriendsUMass = 500;
            const threshFriendsToFollowersRatioUMass = 0.6;
            const constDivUMass = 5.0;

            const { followers, following, ageDays, verified, suspended, validDevice, restricted } = inp;
            const steps = [];

            let mass;
            if (suspended) {
                mass = 0;
                steps.push({ k: 'Suspended', v: 'mass = 0' });
            } else if (verified) {
                mass = 100;
                steps.push({ k: 'Legacy verified', v: 'mass = 100' });
            } else {
                let score = deviceWeightAdditive * 0.1 + (validDevice ? deviceWeightAdditive : 0);
                steps.push({ k: 'Base (device)', v: `${(score * 100).toFixed(0)} / 100` });
                const normalizedAge = ageDays > 30 ? 1.0 : Math.min(1.0, Math.log(1.0 + ageDays / 15.0));
                score *= normalizedAge;
                if (ageDays <= 30) steps.push({ k: 'New-account deboost', v: `×${normalizedAge.toFixed(2)} (age ${ageDays}d)` });
                if (score < 0.01) score = 0.01;
                if (restricted) { score *= restrictedWeightMultiplicative; steps.push({ k: 'Restricted', v: '×0.1' }); }
                score = Math.max(Math.min(score, 1.0), 0);
                score *= 100;
                mass = score;
            }

            // Ratio penalty from UserMass (following > 500 AND friends/followers > 0.6)
            const ratio = (1.0 + following) / (1.0 + followers);
            if (following > threshAbsNumFriendsUMass && ratio > threshFriendsToFollowersRatioUMass) {
                const div = Math.exp(constDivUMass * (ratio - threshFriendsToFollowersRatioUMass));
                mass = mass / div;
                steps.push({ k: 'Following-ratio penalty', v: `÷${div.toFixed(2)} (ratio ${ratio.toFixed(2)})` });
            }

            // Reputation.adjustReputationsPostCalculation (following > 2500)
            const threshAbsNumFriendsReps = 2500;
            const maxDivFactorReps = 50;
            if (following > threshAbsNumFriendsReps) {
                const divFactor = Math.exp(3.0 * (ratio - 0.6) * Math.log(Math.log(following)));
                const denom = Math.max(Math.min(divFactor, maxDivFactorReps), 1.0);
                mass = mass / denom;
                steps.push({ k: 'High-following penalty', v: `÷${denom.toFixed(2)} (>2500 following)` });
            }

            return { score: Math.max(0, Math.min(100, Math.round(mass))), ratio, steps };
        },

        calculate() {
            const followers = parseInt(UI.el('tpm-d-followers').value, 10);
            const following = parseInt(UI.el('tpm-d-following').value, 10);
            if (isNaN(followers) || isNaN(following)) return;
            const ageDays = parseInt(UI.el('tpm-d-age').value, 10);

            const inp = {
                followers, following,
                ageDays: isNaN(ageDays) ? 9999 : ageDays,   // unknown age => past the 30-day cliff
                verified: UI.el('tpm-d-verified').checked,
                suspended: false,
                validDevice: UI.el('tpm-d-device').checked,
                restricted: UI.el('tpm-d-restricted').checked
            };

            const { score, ratio, steps } = this.computeMass(inp);
            this.paint(score, steps, { followers, following, ratio, verified: inp.verified, validDevice: inp.validDevice });
        },

        paint(score, steps, ctx) {
            const color = score >= 65 ? 'var(--ok)' : score >= 45 ? 'var(--warn)' : 'var(--danger)';
            const num = UI.el('tpm-score-num');
            num.textContent = score;
            num.style.color = color;
            const fill = UI.el('tpm-score-fill');
            fill.style.width = `${score}%`;
            fill.style.background = color;
            UI.el('tpm-score-label').innerHTML = score >= 65
                ? '✅ At/above ~65 — all your tweets stay eligible for ranking'
                : '⚠️ Below ~65 — the legacy search filter cut eligible tweets to ~3';

            // Show the actual computation steps from the source formula.
            UI.el('tpm-factors').innerHTML = steps.map(st => `
              <div class="tpm-factor-top" style="margin:6px 0">
                <span>${Core.escapeHtml(st.k)}</span><span>${Core.escapeHtml(st.v)}</span>
              </div>`).join('') || '<div class="tpm-note">No adjustments applied.</div>';

            this.recommend(score, ctx);
        },

        recommend(score, ctx) {
            const recs = [];
            const { followers, following, ratio, verified, validDevice } = ctx;

            // The two real ratio penalties: > 0.6 friends/followers with > 500 following.
            if (following > 500 && ratio > 0.6) {
                // following count that brings the ratio back to the 0.6 threshold
                const targetFollowing = Math.max(0, Math.floor(0.6 * (1 + followers) - 1));
                const cut = Math.max(0, following - targetFollowing);
                recs.push(`The follow-ratio penalty is active (following/followers = ${ratio.toFixed(2)} &gt; 0.6 with 500+ following). Unfollowing about <strong>${cut.toLocaleString()}</strong> non-followers clears it. <a href="#" id="tpm-rec-unfollow">Open the Unfollow tool →</a>`);
            } else if (following > 2500) {
                recs.push(`You follow over 2,500 accounts, which triggers the high-following reputation penalty. Trimming non-followers reduces it. <a href="#" id="tpm-rec-unfollow">Open the Unfollow tool →</a>`);
            }

            if (!verified) {
                recs.push('In the legacy formula a <strong>legacy-verified</strong> account (the old manually-granted blue check) has its mass set to <strong>100</strong> outright, the single biggest lever in this model. Note: X Premium / blue is a different flag and did not feed this formula.');
            }
            if (!validDevice) {
                recs.push('Verify a phone / use a valid device. Without one the base mass drops from 55 to 5 before any other factor.');
            }

            // Honest note on what tweethunter adds that the source does NOT.
            recs.push('Note: third-party calculators also weight <em>engagement</em> and <em>posting consistency</em>. Those aren\'t in X\'s open-source mass formula (they belong to the live ranking model), so they\'re excluded from this exact-reproduction score but still matter in practice.');

            if (score >= 65 && !(following > 500 && ratio > 0.6)) {
                recs.unshift('You\'re at or above the ~65 line. Keep your follow ratio healthy to stay there.');
            }

            UI.el('tpm-recs').innerHTML = recs.map(r => `<li>${r}</li>`).join('');
            const ru = UI.el('tpm-rec-unfollow'); if (ru) ru.onclick = (e) => { e.preventDefault(); UI.switchTab('unfollow'); };
        }
    };
