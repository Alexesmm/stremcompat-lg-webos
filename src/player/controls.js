// Control bar, buffering state, toasts, diagnostics and local service recovery.
function updatePP() {
  var b = document.getElementById('b_pp');
  b.innerHTML = v.paused ? '<i class=ic-play></i>' : '<i class=ic-pause></i>';
}
v.addEventListener('play', updatePP);
v.addEventListener('pause', updatePP);
if (NEXTVID) {
  document.getElementById('b_next').style.display = '';
}
var btns = [];
(function () {
  var ids = ['b_rw', 'b_pp', 'b_ff', 'b_next', 'b_set'];
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (el && el.style.display !== 'none') {
      el._base = el.className;
      btns.push(el);
    }
  }
})();
function rememberNextSource() {
  if (!ID || !NEXTVID) return;
  try {
    localStorage.setItem(
      'tvnextpref_' + ID + '_' + NEXTVID,
      JSON.stringify({ at: Date.now(), addon: ADDON, quality: QUALITY, compat: COMPAT, text: SNAME })
    );
  } catch (e) {}
}
function nextEp() {
  if (NEXTHREF) {
    try {
      saveProgress();
      markWatchedLocal();
      rememberNextSource();
    } catch (e) {}
    location.replace(NEXTHREF);
  }
}
var mode = 'video',
  bIdx = 1,
  mIdx = 0,
  menuItems = [],
  hideT = null;
function fmt(s) {
  s = Math.max(0, s | 0);
  var h = (s / 3600) | 0,
    m = ((s % 3600) / 60) | 0,
    x = s % 60;
  function p(n) {
    return (n < 10 ? '0' : '') + n;
  }
  return (h ? h + ':' + p(m) : m) + ':' + p(x);
}
function showBar() {
  bar.className = 'show';
  if (hideT) clearTimeout(hideT);
  hideT = setTimeout(function () {
    if (mode === 'video') {
      bar.className = '';
    }
  }, 4000);
}
function paintBtns() {
  for (var i = 0; i < btns.length; i++)
    btns[i].className = btns[i]._base + (mode === 'controls' && i === bIdx ? ' f' : '');
  if (seekBar) seekBar.className = (seekTarget >= 0 ? 'seeking' : '') + (mode === 'seek' ? ' f' : '');
}
function hideLoad() {
  load.style.display = 'none';
}
v.addEventListener('playing', hideLoad);
v.addEventListener('loadeddata', function () {
  setTimeout(hideLoad, 300);
});
v.addEventListener('error', function () {
  if (retryStartup('error')) return;
  lname.textContent = P.playbackError;
  diag('media_error', {
    code: v.error ? v.error.code : 0,
    ready: v.readyState,
    network: v.networkState,
    compat: COMPAT
  });
});
// buffering: dim the frozen frame and breathe the art (the same look as initial load)
var bufEl = document.getElementById('buf');
function showBuf() {
  if (load.style.display === 'none' && !v.paused) {
    bufEl.style.display = '-webkit-flex';
    bufEl.style.display = 'flex';
  }
}
function hideBuf() {
  bufEl.style.display = 'none';
}
// a pause fires "waiting"/"stalled" on this TV too; only treat it as buffering while playing
v.addEventListener('waiting', showBuf);
v.addEventListener('stalled', showBuf);
v.addEventListener('playing', hideBuf);
v.addEventListener('canplay', hideBuf);
v.addEventListener('seeked', hideBuf);
v.addEventListener('pause', hideBuf);
v.addEventListener('timeupdate', function () {
  if (seekTarget < 0 && !v.paused) hideBuf();
  if (v.duration && seekTarget < 0) {
    var pct = (v.currentTime / v.duration) * 100;
    fill.style.width = pct + '%';
    knob.style.left = pct + '%';
    timeEl.textContent = fmt(v.currentTime) + ' / ' + fmt(v.duration);
  }
  renderSub();
});
// poll on a TIMER, not timeupdate: cues keep arriving while paused / after playback ends
setInterval(function () {
  if (embN >= 0) pollEmbCues();
}, 4000);
function setPlaying(play) {
  try {
    if (play) {
      var result = v.play();
      if (result && result.catch)
        result.catch(function () {
          diag('play_rejected', {});
          showToast(P.couldNotResume);
        });
    } else v.pause();
    setTimeout(updatePP, 0);
  } catch (e) {
    diag('play_toggle_error', {});
    showToast(P.controlUnavailable);
  }
  showBar();
}
function tog() {
  setPlaying(!!(v.paused || v.ended));
}
var seekEl = document.getElementById('seekind'),
  knob = document.getElementById('knob'),
  seekBar = document.getElementById('seek'),
  seekHideT = null,
  seekTarget = -1,
  seekTimer = null;
var toastEl = document.getElementById('toast'),
  toastT = null;
function showToast(m) {
  if (!toastEl) return;
  toastEl.textContent = m;
  toastEl.style.opacity = '1';
  if (toastT) clearTimeout(toastT);
  toastT = setTimeout(function () {
    toastEl.style.opacity = '0';
  }, 3200);
}
function diag(ev, data) {
  try {
    var q = [
      'ev=' + encodeURIComponent(ev),
      'ready=' + v.readyState,
      'network=' + v.networkState,
      't=' + (v.currentTime | 0)
    ];
    data = data || {};
    for (var k in data)
      if (Object.prototype.hasOwnProperty.call(data, k) && data[k] != null)
        q.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(data[k]).slice(0, 160)));
    var im = new Image();
    im.src = 'http://127.0.0.1:' + APP_PORT + '/log?' + q.join('&') + '&_=' + Date.now();
  } catch (e) {}
}
function health(cb) {
  var done = false;
  function end(ok) {
    if (done) return;
    done = true;
    cb(ok);
  }
  try {
    var x = new XMLHttpRequest();
    x.open('GET', 'http://127.0.0.1:' + APP_PORT + '/health?player=' + Date.now(), true);
    x.onreadystatechange = function () {
      if (x.readyState === 4) end(x.status >= 200 && x.status < 300);
    };
    x.timeout = 900;
    x.ontimeout = function () {
      end(false);
    };
    x.onerror = function () {
      end(false);
    };
    x.send();
    setTimeout(function () {
      end(false);
    }, 1100);
  } catch (e) {
    end(false);
  }
}
function startRuntime(cb) {
  var done = false,
    b = null;
  function end(ok) {
    if (done) return;
    done = true;
    b = null;
    cb(ok);
  }
  try {
    if (typeof PalmServiceBridge === 'undefined') {
      end(false);
      return;
    }
    b = new PalmServiceBridge();
    b.onservicecallback = function () {
      end(true);
    };
    b.call('luna://' + SERVICE_ID + '/start', '{}');
    setTimeout(function () {
      end(false);
    }, 2600);
  } catch (e) {
    end(false);
  }
}
var wasPlayingBeforeHide = false,
  resumeRecovering = false;
function recoverPlayerRuntime() {
  if (resumeRecovering) return;
  resumeRecovering = true;
  health(function (up) {
    if (up) {
      resumeRecovering = false;
      showToast(P.inactive);
      diag('player_resume_ok', {});
      return;
    }
    showToast(P.restoring);
    diag('player_resume_restart', {});
    startRuntime(function () {
      var tries = 0;
      function check() {
        health(function (ok) {
          if (ok) {
            diag('player_resume_recovered', { tries: tries });
            location.replace('http://127.0.0.1:' + APP_PORT + '/' + (BACK || 'beta'));
            return;
          }
          tries++;
          if (tries < 20) {
            setTimeout(check, 500);
            return;
          }
          resumeRecovering = false;
          showToast(P.restoreFailed);
          diag('player_resume_failed', { tries: tries });
        });
      }
      check();
    });
  });
}
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
  document.addEventListener(
    event,
    function () {
      if (document[prop]) {
        hiddenAt = Date.now();
        wasPlayingBeforeHide = !v.paused;
        try {
          saveProgress();
          if (wasPlayingBeforeHide) v.pause();
          else pushLib(true);
        } catch (e) {}
        diag('player_hidden', { playing: wasPlayingBeforeHide ? 1 : 0 });
      } else if (hiddenAt) {
        diag('player_visible', { awaySec: Math.max(0, ((Date.now() - hiddenAt) / 1000) | 0) });
        hiddenAt = 0;
        setTimeout(recoverPlayerRuntime, 120);
      }
    },
    true
  );
})();
