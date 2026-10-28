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
  } else if (rem > 180 && npShown) {
    npShown = false;
    npFocus = false;
    paintNp();
  }
}
v.addEventListener('timeupdate', checkNp);
