// Element references, XHR helper, loading artwork and the startup watchdog.
var v = document.getElementById('v'),
  bar = document.getElementById('bar'),
  fill = document.getElementById('fill'),
  timeEl = document.getElementById('time'),
  menu = document.getElementById('menu'),
  subEl = document.getElementById('sub'),
  load = document.getElementById('load'),
  lname = document.getElementById('lname');
document.getElementById('title').textContent = TITLE;
document.getElementById('pvLbl').textContent = P.paused;
document.getElementById('npL').textContent = P.nextEpisode;
document.getElementById('npB').textContent = P.playNext;
document.getElementById('npH').textContent = P.dismissHint;
document.getElementById('b_next').textContent = P.nextEpisode;
function xhr(u, cb) {
  try {
    var x = new XMLHttpRequest();
    x.open('GET', u, true);
    x.onreadystatechange = function () {
      if (x.readyState === 4) {
        var j = null;
        try {
          j = JSON.parse(x.responseText);
        } catch (e) {}
        cb(j);
      }
    };
    x.send();
  } catch (e) {
    cb(null);
  }
}
function setArt(host, u) {
  if (!host) return;
  host.textContent = '';
  if (!u) return;
  var im = document.createElement('img');
  im.src = u;
  host.appendChild(im);
}
// ---- loading art is embedded server-side (no flash): show logo+backdrop now ----
if (BG) load.style.backgroundImage = 'url("' + BG + '")';
var bufArt = document.getElementById('bufart');
if (LOGO) {
  setArt(lname, LOGO);
  setArt(bufArt, LOGO);
} else {
  lname.textContent = TITLE;
  bufArt.textContent = TITLE;
}
if (SE) {
  document.getElementById('tse').textContent = SE;
}
var mediaUsable = false,
  startupRetry = 0,
  startupResetting = false,
  startupWatch = null;
function armStartupWatch() {
  if (startupWatch) clearTimeout(startupWatch);
  startupWatch = setTimeout(function () {
    if (!mediaUsable && !retryStartup('timeout') && ID && BACK.indexOf('beta#detail/') === 0)
      showSourceFailed();
  }, 18000);
}
function mediaReady() {
  mediaUsable = true;
  startupResetting = false;
  if (startupWatch) {
    clearTimeout(startupWatch);
    startupWatch = null;
  }
}
function retryStartup(reason) {
  if (mediaUsable || startupRetry >= 1 || startupResetting) return false;
  startupRetry++;
  startupResetting = true;
  diag('media_start_retry', { reason: reason });
  showToast(P.retrying);
  try {
    v.pause();
    v.removeAttribute('src');
    v.load();
  } catch (e) {}
  setTimeout(function () {
    startupResetting = false;
    try {
      v.src = URL;
      v.load();
      var rp = v.play();
      if (rp && rp.catch) rp.catch(function () {});
    } catch (e) {}
    armStartupWatch();
  }, 650);
  return true;
}
v.addEventListener('loadedmetadata', mediaReady);
v.addEventListener('playing', mediaReady);
v.src = URL;
armStartupWatch();
