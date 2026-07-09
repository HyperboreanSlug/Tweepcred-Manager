/**
 * @module ui
 * @see docs/modules/ui.md
 */
    /* ===================================================================== *
     *  UI — one panel, tabbed. Builds the chrome; each module fills a tab.    *
     * ===================================================================== */
    const UI = {
        id: 'tpm-panel',

        build() {
            const old = document.getElementById(this.id);
            if (old) old.remove();

            const panel = document.createElement('div');
            panel.id = this.id;
            panel.innerHTML = this.styles() + `
              <div class="tpm-header" id="tpm-header">
                <div class="tpm-badge">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 21v-6h6v6"/></svg>
                </div>
                <div class="tpm-htext">
                  <h2>Tweepcred Manager</h2>
                  <div class="tpm-sub">manage your X reputation score</div>
                </div>
                <button class="tpm-iconbtn" id="tpm-min" title="Minimize" type="button"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg></button>
                <button class="tpm-iconbtn" id="tpm-close" title="Close" type="button"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
              </div>
              <nav class="tpm-tabs" id="tpm-tabs">
                <button class="tpm-tab tpm-active" data-tab="dashboard" type="button">Dashboard</button>
                <button class="tpm-tab" data-tab="unfollow" type="button">Unfollow</button>
                <button class="tpm-tab" data-tab="followers" type="button">Followers</button>
                <button class="tpm-tab" data-tab="cleanup" type="button">Cleanup</button>
                <button class="tpm-tab" data-tab="about" type="button">About</button>
              </nav>
              <div class="tpm-body">
                <section class="tpm-pane tpm-active" id="tpm-pane-dashboard"></section>
                <section class="tpm-pane" id="tpm-pane-unfollow"></section>
                <section class="tpm-pane" id="tpm-pane-followers"></section>
                <section class="tpm-pane" id="tpm-pane-cleanup"></section>
                <section class="tpm-pane" id="tpm-pane-about"></section>
              </div>`;
            document.body.insertBefore(panel, document.body.firstChild);

            document.getElementById('tpm-min').onclick = () => panel.classList.toggle('tpm-min');
            document.getElementById('tpm-close').onclick = () => { panel.remove(); window.__tpmRunning = false; };
            document.getElementById('tpm-tabs').addEventListener('click', (e) => {
                const tab = e.target.closest('.tpm-tab');
                if (tab) this.switchTab(tab.dataset.tab);
            });

            this.makeDraggable(panel, document.getElementById('tpm-header'));
        },

        switchTab(name) {
            document.querySelectorAll('#tpm-tabs .tpm-tab').forEach(t =>
                t.classList.toggle('tpm-active', t.dataset.tab === name));
            document.querySelectorAll('.tpm-pane').forEach(p =>
                p.classList.toggle('tpm-active', p.id === `tpm-pane-${name}`));
            if (name === 'dashboard') Dashboard.onShow();
            if (name === 'unfollow') Unfollow.onShow();
            if (name === 'followers' && typeof Followers !== 'undefined') Followers.onShow();
        },

        makeDraggable(panel, header) {
            let dragging = false, offX = 0, offY = 0;
            header.addEventListener('pointerdown', (e) => {
                if (e.target.closest('.tpm-iconbtn')) return;
                dragging = true;
                const r = panel.getBoundingClientRect();
                panel.style.transform = 'none';
                panel.style.left = `${r.left}px`;
                panel.style.top = `${r.top}px`;
                panel.style.right = 'auto';
                offX = e.clientX - r.left;
                offY = e.clientY - r.top;
                header.setPointerCapture(e.pointerId);
            });
            header.addEventListener('pointermove', (e) => {
                if (!dragging) return;
                const w = panel.offsetWidth, h = panel.offsetHeight;
                panel.style.left = `${Math.max(6, Math.min(window.innerWidth - w - 6, e.clientX - offX))}px`;
                panel.style.top = `${Math.max(6, Math.min(window.innerHeight - h - 6, e.clientY - offY))}px`;
            });
            const end = (e) => { if (dragging) { dragging = false; try { header.releasePointerCapture(e.pointerId); } catch (_) { } } };
            header.addEventListener('pointerup', end);
            header.addEventListener('pointercancel', end);
        },

        styles() {
            const p = `#${this.id}`;
            return `<style>
            ${p},${p} *{box-sizing:border-box}
            ${p}{
              --acc:#1d9bf0;--ok:#17bf63;--warn:#f7931a;--danger:#f4212e;
              --text:#e7e9ea;--muted:#71767b;--card:rgba(255,255,255,.05);--border:rgba(255,255,255,.12);
              position:fixed;top:16px;right:16px;width:min(440px,calc(100vw - 24px));
              max-height:calc(100vh - 32px);overflow:hidden;display:flex;flex-direction:column;
              z-index:2147483647;margin:0;padding:0;
              background:rgba(21,24,28,.95);backdrop-filter:blur(14px) saturate(150%);-webkit-backdrop-filter:blur(14px) saturate(150%);
              color:var(--text);font-family:"TwitterChirp",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
              font-size:15px;line-height:1.45;text-align:left;
              border:1px solid var(--border);border-radius:20px;box-shadow:0 18px 50px rgba(0,0,0,.55);
              -webkit-font-smoothing:antialiased;animation:tpm-in .25s ease both;
            }
            @keyframes tpm-in{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:translateY(0)}}
            ${p} .tpm-header{display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:grab;user-select:none;border-bottom:1px solid var(--border);flex:0 0 auto}
            ${p} .tpm-header:active{cursor:grabbing}
            ${p} .tpm-badge{flex:0 0 auto;width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--acc),#5cc0ff);color:#fff;box-shadow:0 4px 12px rgba(29,155,240,.4)}
            ${p} .tpm-htext{flex:1 1 auto;min-width:0}
            ${p} .tpm-htext h2{margin:0;font-size:17px;font-weight:800;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
            ${p} .tpm-sub{font-size:12px;color:var(--muted);font-weight:500}
            ${p} .tpm-iconbtn{flex:0 0 auto;width:32px;height:32px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--muted);background:transparent;transition:.15s}
            ${p} .tpm-iconbtn:hover{background:rgba(255,255,255,.1);color:var(--text)}
            ${p} #tpm-close:hover{background:rgba(244,33,46,.15);color:var(--danger)}
            ${p} .tpm-tabs{display:flex;gap:2px;padding:8px 10px 0;flex:0 0 auto}
            ${p} .tpm-tab{flex:1;padding:9px 4px;background:transparent;border:none;border-bottom:2px solid transparent;color:var(--muted);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;border-radius:8px 8px 0 0;transition:.15s}
            ${p} .tpm-tab:hover{color:var(--text);background:rgba(255,255,255,.05)}
            ${p} .tpm-tab.tpm-active{color:var(--acc);border-bottom-color:var(--acc)}
            ${p} .tpm-body{padding:16px;overflow-y:auto;flex:1 1 auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.25) transparent}
            ${p} .tpm-body::-webkit-scrollbar{width:8px}
            ${p} .tpm-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.2);border-radius:8px}
            ${p}.tpm-min{width:min(320px,calc(100vw - 24px))}
            ${p}.tpm-min .tpm-tabs,${p}.tpm-min .tpm-body{display:none}
            ${p} .tpm-pane{display:none}
            ${p} .tpm-pane.tpm-active{display:block}
            ${p} .tpm-section{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:12px}
            ${p} .tpm-section h4{margin:0 0 6px;font-size:14px;font-weight:700}
            ${p} .tpm-section p{margin:0 0 10px;font-size:13px;color:var(--muted)}
            ${p} .tpm-section ul{margin:6px 0 0;padding-left:18px;font-size:13px;color:var(--muted)}
            ${p} .tpm-section li{margin:4px 0}
            ${p} .tpm-label{display:block;font-size:13px;color:var(--muted);margin:12px 0 6px}
            ${p} .tpm-label:first-child{margin-top:0}
            ${p} .tpm-input{width:100%;padding:9px 12px;border-radius:10px;border:1px solid var(--border);background:rgba(0,0,0,.25);color:var(--text);font-size:14px;font-family:inherit;outline:none;transition:.15s}
            ${p} textarea.tpm-input{resize:vertical;min-height:64px}
            ${p} select.tpm-input{appearance:none;-webkit-appearance:none;cursor:pointer}
            ${p} select.tpm-input option{background:#15181c;color:var(--text)}
            ${p} .tpm-input:focus{border-color:var(--acc);box-shadow:0 0 0 3px rgba(29,155,240,.25)}
            ${p} .tpm-row{display:flex;gap:10px}
            ${p} .tpm-row>div{flex:1}
            ${p} .tpm-check{display:flex;align-items:flex-start;gap:8px;margin-top:12px;font-size:13px;color:var(--muted);cursor:pointer;line-height:1.4}
            ${p} .tpm-check input{flex:0 0 auto;width:16px;height:16px;margin-top:1px;accent-color:var(--acc);cursor:pointer}
            ${p} .tpm-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:10px 16px;border-radius:999px;border:1px solid transparent;cursor:pointer;font-size:14px;font-weight:700;font-family:inherit;transition:.15s}
            ${p} .tpm-btn-primary{background:var(--acc);color:#fff}
            ${p} .tpm-btn-primary:hover{background:#1a8cd8}
            ${p} .tpm-btn-ghost{background:transparent;border-color:var(--border);color:var(--text)}
            ${p} .tpm-btn-ghost:hover{background:rgba(255,255,255,.08)}
            ${p} .tpm-btn-warn{background:var(--warn);color:#111}
            ${p} .tpm-btn-warn:hover{filter:brightness(1.08)}
            ${p} .tpm-btn-danger{background:transparent;border-color:rgba(244,33,46,.5);color:var(--danger)}
            ${p} .tpm-btn-danger:hover{background:rgba(244,33,46,.12)}
            ${p} .tpm-btn[disabled]{opacity:.45;cursor:not-allowed}
            ${p} .tpm-btns{display:flex;gap:10px;margin-top:8px}
            ${p} a{color:var(--acc);text-decoration:none}
            ${p} a:hover{text-decoration:underline}
            /* score gauge */
            ${p} .tpm-score{display:flex;align-items:center;gap:16px}
            ${p} .tpm-score-num{font-size:46px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
            ${p} .tpm-score-meta{flex:1}
            ${p} .tpm-score-label{font-size:13px;font-weight:700;margin-bottom:6px}
            ${p} .tpm-track{height:10px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden}
            ${p} .tpm-fill{height:100%;width:0;border-radius:999px;transition:width .5s ease}
            ${p} .tpm-factor{margin:8px 0}
            ${p} .tpm-factor-top{display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px}
            ${p} .tpm-factor-top span:last-child{color:var(--muted);font-variant-numeric:tabular-nums}
            ${p} .tpm-mini-track{height:6px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}
            ${p} .tpm-mini-fill{height:100%;border-radius:999px;background:var(--acc)}
            /* stats */
            ${p} .tpm-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
            ${p} .tpm-stat{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 8px;text-align:center}
            ${p} .tpm-stat-v{font-size:24px;font-weight:800;color:var(--acc);font-variant-numeric:tabular-nums}
            ${p} .tpm-stat-l{font-size:11px;color:var(--muted);margin-top:4px}
            ${p} .tpm-status{text-align:center;padding:9px;border-radius:10px;font-size:13px;font-weight:700;margin-top:6px}
            ${p} .tpm-status.run{background:rgba(23,191,99,.18);color:var(--ok)}
            ${p} .tpm-status.pause{background:rgba(247,147,26,.18);color:var(--warn)}
            ${p} .tpm-status.stop{background:rgba(244,33,46,.18);color:var(--danger)}
            ${p} .tpm-status.idle{background:rgba(255,255,255,.06);color:var(--muted)}
            ${p} .tpm-now{background:rgba(29,155,240,.1);border:1px solid rgba(29,155,240,.3);border-radius:10px;padding:10px;margin:10px 0;font-size:13px;text-align:center}
            ${p} .tpm-note{font-size:12px;color:var(--muted);margin-top:10px;line-height:1.5}
            ${p} .tpm-warn-box{background:rgba(247,147,26,.12);border:1px solid rgba(247,147,26,.35);color:#ffd9a8;border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:12px}
            ${p} #tpm-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:22px 16px;border:2px dashed var(--border);border-radius:14px;cursor:pointer;text-align:center;color:var(--muted);background:var(--card);transition:.15s}
            ${p} #tpm-drop:hover,${p} #tpm-drop.tpm-dragover{border-color:var(--acc);color:var(--text);background:rgba(29,155,240,.08)}
            ${p} #tpm-drop strong{color:var(--text);font-weight:700}
            ${p} #tpm-file{position:absolute;width:1px;height:1px;opacity:0;clip:rect(0 0 0 0)}
            ${p} .tpm-pct{font-size:18px;font-weight:800;color:var(--acc)}
            ${p} .tpm-foot{margin-top:6px;text-align:center;font-size:11px;color:var(--muted)}
            /* Followers tracker table */
            ${p} .tpm-f-list{max-height:280px;overflow:auto;margin-top:4px}
            ${p} .tpm-f-table{width:100%;border-collapse:collapse;font-size:12px}
            ${p} .tpm-f-table th{position:sticky;top:0;background:#1a1d22;text-align:left;padding:6px 4px;color:var(--muted);font-weight:700;border-bottom:1px solid var(--border)}
            ${p} .tpm-f-table td{padding:6px 4px;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:top}
            ${p} .tpm-f-num{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
            ${p} .tpm-f-rank{color:var(--muted);width:28px}
            ${p} .tpm-f-loc{color:var(--muted);max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
            ${p} .tpm-f-tag{display:inline-block;margin-left:4px;padding:1px 5px;border-radius:999px;font-size:10px;background:rgba(29,155,240,.15);color:var(--acc)}
            @media (max-width:480px){${p}{top:8px;right:8px;left:8px;width:auto;border-radius:16px}}
            </style>`;
        },

        // small helper to fetch panel-scoped element by id
        el(id) { return document.getElementById(id); }
    };
