// Muted background trailer shown after the remote has been idle.
var bgv = null;
function stopIdleTrailer() {
  if (!bgv) return;
  var el = bgv;
  bgv = null;
  try {
    el.pause();
    el.removeAttribute('src');
    el.load();
  } catch (e) {}
  if (el.parentNode) el.parentNode.removeChild(el);
}
function idleMeta(cb) {
  if (SCR === 'detail' && detail.meta) {
    cb(detail.meta);
    return;
  }
  if (SCR === 'disc') {
    var dit = disc.focusedItem();
    if (dit) {
      getMeta(dit.type, dit.id, cb);
      return;
    }
  }
  var b = curBoard();
  if (b) {
    var it = b.focusedItem();
    if (it) {
      getMeta(it.type, it.id, cb);
      return;
    }
  }
  cb(null);
}
function startIdleTrailer() {
  if (bgv) return;
  if (lsRaw('bgTrailer', 'false') !== 'true') return; /* Off by default on the low-memory 2019 TV */
  idleMeta(function (m) {
    if (!m) return;
    var t = trailerIdOf(m);
    if (!t) return;
    xhrJson(
      '/yt?v=' + encodeURIComponent(t) + '&lq=1',
      function (j) {
        if (!j || !j.url || !bodyHas('idle') || bgv) return;
        var el = document.createElement('video');
        el.id = 'bgv';
        el.autoplay = true;
        /* Keep previews unobtrusive and cheap; the user can still open a full trailer. */
        el.muted = true;
        el.volume = 0;
        /* once playing, fade the foreground fully away (adds the .trailer class) */
        on(el, 'playing', function () {
          if (bgv === el) {
            el.className = 'on';
            if (bodyHas('idle')) bodyAdd('trailer');
          }
        });
        on(el, 'ended', function () {
          if (bgv === el) stopIdleTrailer();
        });
        on(el, 'error', function () {
          if (bgv === el) stopIdleTrailer();
        });
        el.src = j.url;
        var shade = $('bgshade');
        shade.parentNode.insertBefore(el, shade);
        bgv = el;
      },
      14000
    );
  });
}
setInterval(function () {
  var browsing = SCR === 'home' || SCR === 'detail' || SCR === 'disc' || SCR === 'lib';
  var idle =
    Date.now() - lastIn > 12000 &&
    browsing &&
    !streamsUI.open &&
    !cwMenu.open &&
    document.activeElement !== $('sBox') &&
    $('boot').style.display === 'none';
  var has = bodyHas('idle');
  if (idle && !has) {
    bodyAdd('idle');
    startIdleTrailer();
  } else if (!idle && has) {
    bodyRemove('idle');
    bodyRemove('trailer');
    stopIdleTrailer();
  }
}, 1000);
/* the item under the cursor on whatever screen is showing (null if none) */
