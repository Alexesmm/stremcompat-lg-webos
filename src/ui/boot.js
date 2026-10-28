// Startup: choose login or Home, restore deep links and start the silent syncs.
/* ================= boot ================= */
function boot() {
  try {
    window.__STREMIO_PHASE__('B0');
    if (!user()) {
      window.__STREMIO_PHASE__('L0');
      showScr('login');
      login.enter();
      window.__STREMIO_BOOT_DONE__ = true;
      window.__STREMIO_PHASE__('READY');
      $('boot').style.display = 'none';
      return;
    }
    var h = location.hash || '';
    var m = h.match(/^#detail\/([^\/]+)\/([^\/]+)(?:\/(.+))?$/);
    var ms = h.match(/^#sim\/([^\/]+)\/([^\/]+)$/);
    showScr('home');
    home.enter();
    if (m) {
      goScr('detail', { type: m[1], id: m[2], vid: m[3] ? decodeURIComponent(m[3]) : null });
    } else if (ms) {
      goScr('sim', { type: ms[1], id: ms[2] });
    }
    try {
      history.replaceState(history.state, '', '/beta');
    } catch (e) {}
    setTimeout(function () {
      window.__STREMIO_BOOT_DONE__ = true;
      window.__STREMIO_PHASE__('READY');
      $('boot').style.display = 'none';
    }, 120);
    /* silent account syncs: library (Continue Watching / watched) + addon collection */
    setTimeout(function () {
      pullLib(function () {
        invalidateBoards();
        if (SCR === 'home' || SCR === 'lib') refreshCurBoard();
      });
    }, 700);
    setTimeout(function () {
      syncAddons(function (changed) {
        if (changed) {
          toast(tx('addonsUpdated'));
          buildHomeRows(true);
        }
      });
    }, 900);
    /* the long-press menu has no visible entry point: explain it once, on Home */
    setTimeout(function () {
      if (lsRaw('holdOkHintShown', '') || SCR !== 'home' || streamsUI.open || cwMenu.open) return;
      lsRawSet('holdOkHintShown', '1');
      toast(tx('holdOkHint'), 6000);
    }, 4000);
  } catch (error) {
    window.__STREMIO_BOOT_ERROR__((error && error.message) || String(error), 'BOOT');
  }
}
/* This script is the last parser-blocking element in body, so every UI node already
   exists. Boot synchronously: old webOS WebAppManager builds can miss a late
   DOMContentLoaded listener after navigating from the packaged bootstrap to localhost. */
window.__STREMIO_PHASE__('B_CALL');
boot();
