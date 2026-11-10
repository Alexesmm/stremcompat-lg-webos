// How fast the screen answers the remote, measured on the TV itself for Diagnostics: the time
// from a key to the frame that shows its result, and frames that came late while keys arrived.
var smooth = { waits: [], late: 0, frames: 0 };
function keyAnswered(started) {
  if (!window.requestAnimationFrame) return;
  /* the frame after the next one is the first that can show what the key changed */
  requestAnimationFrame(function () {
    requestAnimationFrame(function (now) {
      var wait = Math.round((now || Date.now()) - started);
      if (wait < 0 || wait > 5000) return;
      smooth.waits.push(wait);
      if (smooth.waits.length > 60) smooth.waits.shift();
    });
  });
}
/* frames are watched only for a moment after each key, so an idle TV does no work */
var frameWatchUntil = 0,
  frameWatching = false;
function watchFrames() {
  frameWatchUntil = Date.now() + 1500;
  if (frameWatching || !window.requestAnimationFrame) return;
  frameWatching = true;
  var last = 0;
  function tick(now) {
    now = now || Date.now();
    if (last) {
      smooth.frames++;
      if (now - last > 50) smooth.late += Math.min(10, Math.round((now - last) / 16.7) - 1);
    }
    last = now;
    if (Date.now() < frameWatchUntil) requestAnimationFrame(tick);
    else frameWatching = false;
  }
  requestAnimationFrame(tick);
}
function noteKey() {
  keyAnswered(window.performance && performance.now ? performance.now() : Date.now());
  watchFrames();
}
/* '42 ms typical · 180 ms slowest · 3 % of frames late', or '' before any key */
function smoothnessLine() {
  var w = smooth.waits.slice().sort(function (a, b) {
    return a - b;
  });
  if (!w.length) return '';
  var late = smooth.frames ? Math.round((smooth.late / (smooth.frames + smooth.late)) * 100) : 0;
  return tx('diagRemote', w[Math.floor(w.length / 2)], w[w.length - 1], late);
}
