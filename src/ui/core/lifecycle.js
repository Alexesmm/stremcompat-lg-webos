// App visibility changes (Quick Start+ resume).
/* QuickStart+ can leave the webview alive while webOS stops its local service.
   Verify and recover the service only when the app becomes visible again. */
(function () {
  var prop = '',
    event = '',
    hiddenAt = 0;
  if ('hidden' in document) {
    prop = 'hidden';
    event = 'visibilitychange';
  } else if ('webkitHidden' in document) {
    prop = 'webkitHidden';
    event = 'webkitvisibilitychange';
  }
  if (!event) return;
  on(
    document,
    event,
    function () {
      if (document[prop]) {
        hiddenAt = Date.now();
        try {
          stopIdleTrailer();
        } catch (e) {}
        if (SCR === 'login') login.suspendQr();
        clientDiag('app_hidden', {});
      } else if (hiddenAt) {
        clientDiag('app_visible', { awaySec: Math.max(0, ((Date.now() - hiddenAt) / 1000) | 0) });
        hiddenAt = 0;
        if (SCR === 'login') login.resumeQr();
        setTimeout(runtimeRecover, 120);
      }
    },
    true
  );
})();
