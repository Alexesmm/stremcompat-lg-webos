// Startup: choose login or Home, restore deep links and start the silent syncs.
/* ================= boot ================= */
var HOME_WAIT_MS = 7000;
function boot() {
  try {
    window.__SC_PHASE__('B0');
    if (TV_PROFILE.lowMemory) bodyAdd('lowmem');
    applyLook();
    applyTextSize();
    /* 4.0 keeps accounts differently: every TV signs in again once, on its first start of this
       version, and never again after it */
    if (!lsRaw('signedInFor40', '')) {
      lsRawSet('signedInFor40', '1');
      if (user() || authKey()) return settings.logout();
    }
    if (!user()) {
      window.__SC_PHASE__('L0');
      showScr('login');
      login.enter();
      window.__SC_BOOT_DONE__ = true;
      window.__SC_PHASE__('READY');
      $('boot').style.display = 'none';
      return;
    }
    /* a Nuvio account says who is watching before Home is built */
    if (isNuvioAccount()) startProfiles(startHome);
    else startHome();
  } catch (error) {
    window.__SC_BOOT_ERROR__((error && error.message) || String(error), 'BOOT');
  }
}
/* A profile seen for the first time on this TV has no library here yet: Home waits for it (as
   long as Home waits for its rows), so Continue Watching and My list are there when it appears
   instead of after. */
function startHome() {
  if (allLib().length) return showHome(false);
  var started = false;
  function go() {
    if (started) return;
    started = true;
    showHome(true);
  }
  pullLib(go);
  setTimeout(go, HOME_WAIT_MS);
}
function showHome(libraryPulled) {
  try {
    var h = location.hash || '';
    var m = h.match(/^#detail\/([^\/]+)\/([^\/]+)(?:\/(.+))?$/);
    var ms = h.match(/^#sim\/([^\/]+)\/([^\/]+)$/);
    /* the player leaves a flag when it hands back to the interface */
    var fromPlayer = false;
    try {
      fromPlayer = sessionStorage.getItem('tvBack') === '1';
      sessionStorage.removeItem('tvBack');
    } catch (e) {}
    showScr('home');
    home.enter();
    if (m) {
      goScr('detail', {
        type: m[1],
        id: m[2],
        vid: m[3] ? decodeURIComponent(m[3]) : null,
        restored: fromPlayer
      });
    } else if (ms) {
      goScr('sim', { type: ms[1], id: ms[2] });
    }
    try {
      history.replaceState(history.state, '', appUrl('/beta'));
    } catch (e) {}
    var revealed = false;
    var reveal = function () {
      if (revealed) return;
      revealed = true;
      window.__SC_BOOT_DONE__ = true;
      window.__SC_PHASE__('READY');
      $('boot').style.display = 'none';
      setupPanel.maybeShow();
      /* shown by Settings > Diagnostics: from opening this page to Home on screen */
      try {
        window.__SC_VISIBLE_MS__ = Date.now() - performance.timing.navigationStart;
      } catch (e) {}
    };
    /* Home appears once its first rows are in, and the artwork has had a moment; a title page
       opened from a link shows at once; slow addons never keep the opening screen past 7 s */
    if (m || ms) setTimeout(reveal, 120);
    else {
      var limit = setTimeout(reveal, HOME_WAIT_MS);
      onHomeFilled = function () {
        clearTimeout(limit);
        setTimeout(reveal, 350);
      };
      if (homeFilled) onHomeFilled();
    }
    /* silent account syncs: library (Continue Watching / watched) + addon collection */
    if (!libraryPulled)
      setTimeout(function () {
        pullLib(function () {
          invalidateBoards();
          if (SCR === 'home' || SCR === 'lib') refreshCurBoard();
        });
      }, 700);
    setTimeout(function () {
      syncAddons(function (changed) {
        syncCollections(function (collectionsChanged) {
          if (changed) toast(tx('addonsUpdated'));
          if (changed || collectionsChanged) buildHomeRows(true);
        });
      });
    }, 900);
    /* new episodes of followed series, at most once a day; shown on the next Home build */
    setTimeout(function () {
      checkNewEpisodes(function (changed) {
        if (changed) home.built = false;
      });
    }, 8000);
    /* the last start stopped before Home or login: say where, for a report */
    var lastPhase = window.__SC_LAST_PHASE__;
    if (lastPhase && lastPhase !== 'READY' && !window.__SC_BOOT_FAILED__)
      setTimeout(function () {
        toast(tx('lastStartStopped', lastPhase), 8000);
      }, 2500);
    /* what this version brought, once after updating; then a newer version, once per version */
    setTimeout(function () {
      xhrJson(
        '/update',
        function (answer) {
          var current = answer && answer.current,
            seen = lsRaw('versionSeen', ''),
            told = false;
          if (current && current !== seen) {
            lsRawSet('versionSeen', current);
            told = seen && SCR !== 'login' && !setupPanel.open;
            if (told) toast(tx('whatsNew', current), 9000);
          }
          var version = answer && answer.version;
          if (!version) return;
          /* the Update item in the side menu stays until it is installed */
          pendingUpdate = answer;
          bodyAdd('hasupdate');
          if (told || lsRaw('updateShown', '') === version || SCR === 'login') return;
          lsRawSet('updateShown', version);
          toast(tx('updateAvailable', version), 8000);
        },
        8000
      );
    }, 12000);
    /* the long-press menu has no visible entry point: explain it once, on Home */
    setTimeout(function () {
      if (lsRaw('holdOkHintShown', '') || SCR !== 'home' || streamsUI.open || cwMenu.open) return;
      lsRawSet('holdOkHintShown', '1');
      toast(tx('holdOkHint'), 6000);
    }, 4000);
  } catch (error) {
    window.__SC_BOOT_ERROR__((error && error.message) || String(error), 'BOOT');
  }
}
/* This script is the last parser-blocking element in body, so every UI node already
   exists. Boot synchronously: old webOS WebAppManager builds can miss a late
   DOMContentLoaded listener after navigating from the packaged bootstrap to localhost. */
window.__SC_PHASE__('B_CALL');
boot();
