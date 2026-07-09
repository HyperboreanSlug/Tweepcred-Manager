/**
 * @module follow
 * @see docs/modules/follow.md
 */
    /* ===================================================================== *
     *  Shared DOM helpers for the X follow-list (used by Unfollow + Dashboard)*
     *  Ported verbatim from the Mass-Unfollow project so behaviour matches.  *
     * ===================================================================== */
    const Follow = {
        txt(el) { return (el?.innerText || el?.textContent || '').trim().toLowerCase(); },

        isMutual(cell) {
            const NEEDLES = ['follows you', 'شما را دنبال می‌کند'];
            if (cell.querySelector('[data-testid="userFollowIndicator"]')) return true;
            for (const el of cell.querySelectorAll('[aria-label]')) {
                const label = (el.getAttribute('aria-label') || '').toLowerCase();
                if (NEEDLES.some(n => label.includes(n))) return true;
            }
            const combined = (cell?.innerText || '').toLowerCase() + ' ' + (cell?.textContent || '').toLowerCase();
            return NEEDLES.some(n => combined.includes(n));
        },

        isPrivate(cell) {
            const svgs = cell.querySelectorAll('svg');
            for (const svg of svgs) {
                const label = (svg.getAttribute('aria-label') || '').toLowerCase();
                if (label.includes('protected') || label.includes('private') || label.includes('locked')) return true;
            }
            for (const el of cell.querySelectorAll('[aria-label]')) {
                const label = (el.getAttribute('aria-label') || '').toLowerCase();
                if (label.includes('protected') || label.includes('private') || label.includes('locked')) return true;
            }
            for (const title of cell.querySelectorAll('svg title')) {
                const t = this.txt(title);
                if (t.includes('protected') || t.includes('private') || t.includes('locked')) return true;
            }
            for (const path of cell.querySelectorAll('svg path[d]')) {
                const d = path.getAttribute('d') || '';
                if (d.includes('M12 4a3 3 0 0 0-3 3v2h6V7a3 3 0 0 0-3-3') ||
                    d.includes('M16.5 10H15V7a3 3') ||
                    (d.includes('M') && d.includes('a') && d.includes('H') && d.length > 30 && d.length < 120 &&
                        path.closest('svg')?.getAttribute('viewBox') === '0 0 24 24')) {
                    if (!path.closest('[role="button"], button')) return true;
                }
            }
            return false;
        },

        getUsername(cell) {
            const link = cell.querySelector('a[href^="/"][role="link"], a[href^="/"]:not([href*="status"]):not([href*="intent"])');
            return link ? (link.getAttribute('href').split('/')[1] || 'unknown') : 'unknown';
        },

        findUnfollowButton(cell) {
            const byTestId = cell.querySelector('[data-testid$="-unfollow"]');
            if (byTestId) return byTestId;
            const btns = cell.querySelectorAll('div[role="button"], button');
            return Array.from(btns).find(b => {
                const t = (b.innerText || b.textContent || '').trim().toLowerCase();
                if (t.length > 25) return false;
                return t.includes('following') || t.includes('unfollow') || t.includes('دنبال می‌کنید');
            });
        },

        async waitConfirm(timeout = 7000) {
            const start = Date.now();
            while (Date.now() - start < timeout) {
                const btn =
                    document.querySelector('[data-testid="confirmationSheetConfirm"]') ||
                    document.querySelector('div[role="button"][data-testid*="unfollow"]') ||
                    document.querySelector('button[data-testid*="unfollow"]') ||
                    Array.from(document.querySelectorAll('button')).find(b => this.txt(b).includes('unfollow'));
                if (btn) return btn;
                await Core.sleep(300);
            }
            return null;
        }
    };
