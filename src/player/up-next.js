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
    location.replace(appUrl(SIMHREF));
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
/* While the next-episode panel is up, ask the addons for that episode's sources: the answers
   are kept here for openNextDirect, and the local server has them cached
   (server/addon-cache.js) when the title page opens. */
var nextPrefetched = false,
  nextAnswers = {};
/* cb(json) once, now if the answer is already here; a failed request is asked again next time */
function nextSources(ad, vid, cb) {
  var u = streamUrl(ad, TYPE || 'series', vid),
    entry = nextAnswers[u];
  if (entry && entry.done) return cb(entry.json);
  if (entry) return entry.waiting.push(cb);
  entry = nextAnswers[u] = { done: false, json: null, waiting: [cb] };
  xhr('/addon?u=' + encodeURIComponent(u), function (j) {
    if (j && j.streams) {
      entry.done = true;
      entry.json = j;
    } else delete nextAnswers[u];
    entry.waiting.splice(0).forEach(function (fn) {
      fn(j);
    });
  });
}
function prefetchNext() {
  if (nextPrefetched || !isNextEp || !NEXTVID) return;
  nextPrefetched = true;
  var ads = nextEpisodeAddons();
  for (var i = 0; i < ads.length; i++) nextSources(ads[i], NEXTVID, function () {});
}
/* the addons that answer for the next episode, without the local streaming server's own */
function nextEpisodeAddons() {
  var list = [],
    out = [];
  try {
    list = JSON.parse(localStorage.getItem('addons') || '[]');
  } catch (e) {}
  var ads = streamAddonsIn(list, TYPE || 'series');
  for (var i = 0; i < ads.length; i++)
    if (!/^https?:\/\/(?:127\.0\.0\.1|localhost):11470(?:\/|$)/i.test(ads[i].base)) out.push(ads[i]);
  return out;
}
/* The next episode starts from here, with the source that matches this one: no title page,
   no list. Anything that goes wrong (no answer in time, no matching source) falls back to
   the title page, which still holds the preference and offers the list. Addons that search
   several sites take up to half a minute, and the title page would wait for them just the same. */
var NEXT_DIRECT_LIMIT_MS = 30000;
function coverForNext() {
  try {
    v.pause();
  } catch (e) {}
  if (startupWatch) clearTimeout(startupWatch);
  mode = 'video';
  menu.className = '';
  bar.className = '';
  npShown = false;
  npFocus = false;
  paintNp();
  subEl.textContent = '';
  load.style.display = '';
  showToast(P.nextLoading, NEXT_DIRECT_LIMIT_MS);
}
function openNextDirect() {
  openEpisodeDirect(NEXTVID, NEXTHREF);
}
/* the same for any episode (options.js): `page` is its title page, where a failure ends */
function openEpisodeDirect(vid, page) {
  var ended = false,
    items = [],
    ads = [],
    all = nextEpisodeAddons(),
    limit;
  /* Back while waiting (seek.js exit) already left for the previous screen */
  function giveUp() {
    if (ended || exited) return;
    ended = true;
    location.replace(appUrl(page));
  }
  function play(source) {
    source.meta = { name: TITLE, logo: LOGO, background: BG, poster: POSTER };
    postStreamRef(source, function (ref) {
      if (ended || exited) return;
      if (!ref) return giveUp();
      ended = true;
      clearTimeout(limit);
      forgetNextSource(vid);
      location.replace(
        appUrl(
          '/play?ref=' +
            encodeURIComponent(ref) +
            '&type=' +
            encodeURIComponent(TYPE) +
            '&id=' +
            encodeURIComponent(ID) +
            '&vid=' +
            encodeURIComponent(vid) +
            '&back=' +
            encodeURIComponent('beta#detail/' + TYPE + '/' + ID + '/' + vid)
        )
      );
    });
  }
  /* only the addon that gave this source can give its match */
  for (var i = 0; i < all.length; i++)
    if (ADDONBASE ? all[i].base === ADDONBASE : all[i].name === ADDON) ads.push(all[i]);
  if (!ads.length) return giveUp();
  coverForNext();
  limit = setTimeout(giveUp, NEXT_DIRECT_LIMIT_MS);
  var pending = ads.length,
    pref = nextSourcePref();
  for (var a = 0; a < ads.length; a++)
    nextSources(ads[a], vid, function (j) {
      var st = (j && j.streams) || [];
      for (var k = 0; k < st.length; k++) {
        var item = sourceItem(st[k], ADDON, ADDONBASE);
        if (item) items.push(item);
      }
      pending--;
      if (pending > 0 || ended) return;
      var match = matchingNextSource(items, pref);
      if (match) play(match);
      else giveUp();
    });
}
function postStreamRef(source, cb) {
  try {
    var x = new XMLHttpRequest();
    x.open('POST', '/streamref', true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      var j = null;
      try {
        j = JSON.parse(x.responseText);
      } catch (e) {}
      cb(j && j.ref);
    };
    x.send(JSON.stringify(streamRefBody(source)));
  } catch (e) {
    cb('');
  }
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
