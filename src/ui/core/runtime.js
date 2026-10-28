// Client diagnostics (/log) and recovery of the local Node service after Quick Start+.
function clientDiag(event, data) {
  try {
    var q = [
      'ev=' + encodeURIComponent(String(event || 'shell')),
      'screen=' + encodeURIComponent(String(SCR || ''))
    ];
    data = data || {};
    for (var k in data)
      if (Object.prototype.hasOwnProperty.call(data, k) && data[k] != null)
        q.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(data[k]).slice(0, 160)));
    var im = new Image();
    im.src = '/log?' + q.join('&') + '&_=' + Date.now();
  } catch (e) {}
}
var runtimeRecovering = false;
function runtimePing(cb) {
  var done = false;
  function finish(ok) {
    if (done) return;
    done = true;
    cb(ok);
  }
  try {
    var x = new XMLHttpRequest();
    x.open('GET', '/health?resume=' + Date.now(), true);
    x.onreadystatechange = function () {
      if (x.readyState === 4) finish(x.status >= 200 && x.status < 300);
    };
    x.timeout = 900;
    x.ontimeout = function () {
      finish(false);
    };
    x.onerror = function () {
      finish(false);
    };
    x.send();
    setTimeout(function () {
      finish(false);
    }, 1100);
  } catch (e) {
    finish(false);
  }
}
function runtimeStart(cb) {
  var done = false,
    bridge = null;
  function finish(ok) {
    if (done) return;
    done = true;
    bridge = null;
    cb(ok);
  }
  try {
    if (typeof PalmServiceBridge === 'undefined') {
      finish(false);
      return;
    }
    bridge = new PalmServiceBridge();
    bridge.onservicecallback = function () {
      finish(true);
    };
    bridge.call('luna://' + TV_PROFILE.serviceId + '/start', '{}');
    setTimeout(function () {
      finish(false);
    }, 2600);
  } catch (e) {
    finish(false);
  }
}
function runtimeRecover() {
  if (runtimeRecovering) return;
  runtimeRecovering = true;
  runtimePing(function (up) {
    if (up) {
      runtimeRecovering = false;
      clientDiag('resume_ok', {});
      return;
    }
    toast(tx('runtimeRestoring'));
    clientDiag('resume_restart', {});
    runtimeStart(function () {
      var tries = 0;
      function check() {
        runtimePing(function (ok) {
          if (ok) {
            clientDiag('resume_recovered', { tries: tries });
            location.reload();
            return;
          }
          tries++;
          if (tries < 20) {
            setTimeout(check, 500);
            return;
          }
          runtimeRecovering = false;
          toast(tx('runtimeUnavailable'));
          clientDiag('resume_failed', { tries: tries });
        });
      }
      check();
    });
  });
}
window.__STREMIO_RESUME_CHECK__ = runtimeRecover;
function reloadUi() {
  var url = '/beta?recover=' + Date.now();
  try {
    location.replace(url);
  } catch (e) {
    try {
      location.reload();
    } catch (ignore) {
      runtimeRecovering = false;
    }
  }
}
function clearTemporaryUiState() {
  var keys = storageKeys(),
    kill = [],
    i;
  stopIdleTrailer();
  try {
    if (disc && disc.request && disc.request.abort) disc.request.abort();
    if (disc) {
      disc.gen++;
      disc.request = null;
      disc.loading = false;
    }
  } catch (e) {}
  try {
    if (search && search.requests) {
      for (i = 0; i < search.requests.length; i++)
        if (search.requests[i] && search.requests[i].abort) search.requests[i].abort();
      search.requests = [];
      search.gen++;
    }
  } catch (e) {}
  metaMem = {};
  metaMemOrder = [];
  warmed = {};
  warmedN = 0;
  for (i = 0; i < keys.length; i++)
    if (
      keys[i].indexOf('beta_cat_') === 0 ||
      keys[i].indexOf('beta_meta_') === 0 ||
      keys[i].indexOf('beta_discover_v3_') === 0
    )
      kill.push(keys[i]);
  for (i = 0; i < kill.length; i++)
    try {
      localStorage.removeItem(kill[i]);
    } catch (ignore) {}
}
function manualRecover() {
  if (runtimeRecovering) return;
  runtimeRecovering = true;
  toast(tx('reloadingApp'));
  clientDiag('manual_reload', { reason: 'settings' });
  clearTemporaryUiState();
  runtimePing(function (up) {
    if (up) {
      setTimeout(reloadUi, 80);
      return;
    }
    clientDiag('manual_restart', {});
    runtimeStart(function () {
      var tries = 0;
      function check() {
        runtimePing(function (ok) {
          if (ok) {
            clientDiag('manual_recovered', { tries: tries });
            reloadUi();
            return;
          }
          tries++;
          if (tries < 20) {
            setTimeout(check, 500);
            return;
          }
          runtimeRecovering = false;
          toast(tx('runtimeUnavailable'));
          clientDiag('manual_failed', { tries: tries });
        });
      }
      check();
    });
  });
}
window.__STREMIO_MANUAL_RECOVER__ = manualRecover;
