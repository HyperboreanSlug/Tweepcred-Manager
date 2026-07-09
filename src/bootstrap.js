/**
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

