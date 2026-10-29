// End-of-title popup: next episode or something similar.
// ---- end-of-title popup (last 3 min): series -> next episode; movie -> "watch something similar" ----
var SIMHREF =
  BACK.indexOf('beta') === 0 && TYPE && ID && !NEXTHREF
    ? '/beta#sim/' + encodeURIComponent(TYPE) + '/' + encodeURIComponent(ID)
    : '';
var POPHREF = NEXTHREF || SIMHREF,
  isNextEp = !!NEXTHREF;
var np = document.getElementById('np'),
  npX = document.getElementById('npX'),
  npShown = false,
  npFocus = false,
  npDismissed = false;
function paintNp() {
  np.className = npShown ? 'show' + (npFocus ? ' f' : '') : '';
}
function dismissNp() {
  cancelAutoNext();
  npFocus = false;
  npShown = false;
  npDismissed = true;
  paintNp();
}
(function () {
  var L = document.getElementById('npL'),
    T = document.getElementById('npT'),
    B = document.getElementById('npB');
  if (isNextEp) {
    L.textContent = P.nextEpisode;
    B.textContent = P.playNext;
    if (NEXTTITLE) T.textContent = NEXTTITLE;
    else if (NEXTVID && NEXTVID.indexOf(':') > 0) {
      var npp = NEXTVID.split(':');
      T.textContent = 'S' + npp[npp.length - 2] + ' E' + npp[npp.length - 1];
    }
    if (NEXTTHUMB) {
      var npi = document.getElementById('npI');
      npi.onload = function () {
        npi.style.display = 'block';
      };
      npi.src = NEXTTHUMB;
    }
  } else if (SIMHREF) {
    L.textContent = P.liked;
    T.textContent = P.similar;
    B.textContent = P.findSimilar;
  }
})();
function npGo() {
  cancelAutoNext();
  if (isNextEp) nextEp();
  else if (SIMHREF) {
    try {
      saveProgress();
    } catch (e) {}
    location.replace(SIMHREF);
  }
}
function checkNp() {
  if (!POPHREF || npDismissed || !v.duration) return;
  var rem = v.duration - v.currentTime;
  if (rem <= 180 && rem > 2 && !npShown) {
    npShown = true;
    paintNp();
    prefetchNext();
  } else if (rem > 180 && npShown) {
    npShown = false;
    npFocus = false;
    paintNp();
  }
}
v.addEventListener('timeupdate', checkNp);
/* While the next-episode panel is up, ask the addons for that episode's sources so the
   local server has them cached (server/addon-cache.js) when the title page opens. */
var nextPrefetched = false;
function prefetchNext() {
  if (nextPrefetched || !isNextEp || !NEXTVID) return;
  nextPrefetched = true;
  var list = [];
  try {
    list = JSON.parse(localStorage.getItem('addons') || '[]');
  } catch (e) {}
  var ads = streamAddonsIn(list, TYPE || 'series');
  for (var i = 0; i < ads.length; i++)
    xhr('/addon?u=' + encodeURIComponent(streamUrl(ads[i], TYPE || 'series', NEXTVID)), function () {});
}
/* When an episode ends the next one starts after a countdown: OK starts it now, Back
   cancels it. After three episodes in a row with nobody touching the remote it asks
   whether anyone is still watching instead of carrying on alone. */
var AUTO_NEXT_SECONDS = 10,
  AUTO_NEXT_LIMIT = 3,
  autoNextT = null;
function autoNextCount() {
  return parseInt(lsGet('bingeAutoCount', '0'), 10) || 0;
}
function setAutoNextCount(n) {
  try {
    localStorage.setItem('bingeAutoCount', String(n));
  } catch (e) {}
}
/* any key pressed in the player means someone is there */
function viewerActive() {
  if (autoNextCount()) setAutoNextCount(0);
}
function startAutoNext() {
  var L = document.getElementById('npL'),
    B = document.getElementById('npB'),
    H = document.getElementById('npH');
  npShown = true;
  npFocus = true;
  showBar();
  if (autoNextCount() >= AUTO_NEXT_LIMIT) {
    L.textContent = P.stillWatching;
    B.textContent = P.keepWatching;
    paintNp();
    return;
  }
  var left = AUTO_NEXT_SECONDS;
  H.textContent = P.countdownHint;
  function tick() {
    if (left <= 0) {
      autoNextT = null;
      setAutoNextCount(autoNextCount() + 1);
      nextEp();
      return;
    }
    B.textContent = P.playNextIn.replace('{0}', left);
    left--;
    autoNextT = setTimeout(tick, 1000);
  }
  tick();
  paintNp();
}
function cancelAutoNext() {
  if (!autoNextT) return;
  clearTimeout(autoNextT);
  autoNextT = null;
  document.getElementById('npB').textContent = P.playNext;
  document.getElementById('npH').textContent = P.dismissHint;
}
