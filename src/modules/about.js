/**
 * @module about
 * @see docs/modules/about.md
 */
    /* ===================================================================== *
     *  ABOUT                                                                  *
     * ===================================================================== */
    const About = {
        render() {
            UI.el('tpm-pane-about').innerHTML = `
              <div class="tpm-section">
                <h4>What is tweepcred?</h4>
                <p>Tweepcred is X/Twitter's internal reputation score (0–100). It's derived from a PageRank over the follow graph and adjusted by signals like your follower/following ratio, account age, profile completeness and safety flags. Accounts under roughly <strong>65</strong> have fewer of their tweets included in the search index.</p>
              </div>
              <div class="tpm-section">
                <h4>How this toolkit helps</h4>
                <ul>
                  <li><strong>Dashboard</strong> estimates your score and what to fix.</li>
                  <li><strong>Unfollow</strong> repairs your follower/following ratio — the biggest lever.</li>
                  <li><strong>Followers</strong> snapshots who follows you and sorts your Following list by following-count.</li>
                  <li><strong>Cleanup</strong> removes old, low-engagement tweets that drag down your average.</li>
                </ul>
              </div>
              <div class="tpm-section">
                <h4>Modular source</h4>
                <p>Each feature lives under <code>src/modules/</code> with its own doc in <code>docs/modules/</code>. Rebuild with <code>node scripts/build.js</code>. The built file works as a console paste and as a Greasemonkey/Tampermonkey userscript.</p>
              </div>
              <div class="tpm-section">
                <h4>Credits</h4>
                <p>Unfollow engine by <strong>Shayan Taherkhani</strong>. Cleanup engine (TweetXer) by <strong>Luca Hammer</strong> and contributors. Unified into Tweepcred Manager by HyperboreanSlug. See CREDITS.md.</p>
              </div>
              <div class="tpm-warn-box">Automating X is against its Terms of Service and may get your account locked or banned. Everything here runs locally in your browser using your own logged-in session. Use conservative settings, at your own risk.</div>
              <div class="tpm-foot">Tweepcred Manager v${Core.version}</div>`;
        }
    };
