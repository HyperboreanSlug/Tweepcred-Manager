/**
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
    if (typeof Antibot !== 'undefined') { Antibot.render(); }
    if (typeof Blocklist !== 'undefined') { Blocklist.render(); Blocklist.firstShow = false; }
    About.render();
    UI.switchTab('dashboard');

    console.log('%c🧭 Tweepcred Manager v' + Core.version + ' ready. @' + (Core.username || '?'),
        'color:#1d9bf0;font-weight:bold;font-size:14px');

