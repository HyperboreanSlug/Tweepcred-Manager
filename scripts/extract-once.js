/**
 * One-shot extractor: splits tweepcredmanager.js into modular sources.
 * Run: node scripts/extract-once.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'tweepcredmanager.js'), 'utf8');
const lines = src.split(/\r?\n/);

function slice(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

for (const d of ['src', 'src/modules', 'docs', 'docs/modules', 'scripts', 'dist']) {
  fs.mkdirSync(path.join(root, d), { recursive: true });
}

// Userscript meta + banner (lines 1–40)
fs.writeFileSync(
  path.join(root, 'src/header.meta.js'),
  lines.slice(0, 40).join('\n') + '\n'
);

const bootstrap = `/**
 * @module bootstrap
 * @description IIFE entry + re-run guard. Ensures a single panel instance.
 * @see docs/modules/bootstrap.md
 */
(function () {
    'use strict';

    // Re-run guard: if the panel is already up, just surface it instead of
    // building a second one (and avoid clobbering an in-flight task).
    if (window.__tpmRunning) {
        const existing = document.getElementById('tpm-panel');
        if (existing) {
            existing.classList.remove('tpm-min');
            existing.animate?.([{ outline: '2px solid #1d9bf0' }, { outline: '2px solid transparent' }], { duration: 800 });
        }
        console.warn('[Tweepcred Manager] Already running — re-using the open panel.');
        return;
    }
    window.__tpmRunning = true;
`;
fs.writeFileSync(path.join(root, 'src/bootstrap.js'), bootstrap + '\n');

const modules = [
  { file: 'core.js', start: 58, end: 332 },
  { file: 'follow.js', start: 334, end: 407 },
  { file: 'ui.js', start: 409, end: 594 },
  { file: 'dashboard.js', start: 596, end: 889 },
  { file: 'unfollow.js', start: 891, end: 1400 },
  { file: 'cleanup.js', start: 1402, end: 2045 },
  { file: 'about.js', start: 2047, end: 2071 },
];

for (const m of modules) {
  const body = slice(m.start, m.end);
  const name = m.file.replace('.js', '');
  const out =
    '/**\n * @module ' +
    name +
    '\n * @see docs/modules/' +
    name +
    '.md\n */\n' +
    body +
    '\n';
  fs.writeFileSync(path.join(root, 'src/modules', m.file), out);
  console.log('wrote', m.file, 'lines', m.end - m.start + 1);
}

const boot = `/**
 * @module boot
 * @description Initializes Core, mounts UI, renders all tabs.
 * @see docs/modules/boot.md
 */
    Core.init();
    UI.build();
    Dashboard.render();
    Dashboard.firstShow = false;
    Dashboard.autofill();
    Unfollow.render(); Unfollow.firstShow = false; Unfollow.checkLocation();
    Cleanup.render(); Cleanup.firstShow = false;
    if (typeof Followers !== 'undefined') { Followers.render(); Followers.firstShow = false; }
    About.render();
    UI.switchTab('dashboard');

    console.log('%c🧭 Tweepcred Manager v' + Core.version + ' ready. @' + (Core.username || '?'),
        'color:#1d9bf0;font-weight:bold;font-size:14px');
`;
fs.writeFileSync(path.join(root, 'src/boot.js'), boot + '\n');
fs.writeFileSync(path.join(root, 'src/footer.js'), '})();\n');
console.log('extract complete');
