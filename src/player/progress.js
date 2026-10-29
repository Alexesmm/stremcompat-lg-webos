// Resume, Continue Watching progress, account library sync and binge-to-next.
// ---- resume + Continue Watching (shared with the interface via same-origin localStorage) ----
// The interface keeps watch progress as lib_<first4 of user._id>_<id> items with state.timeOffset
// (ms). We read it to resume and write it so Continue Watching updates after our bare player.
function libPrefix() {
  try {
    var u = JSON.parse(localStorage.getItem('user') || 'null');
    if (u && u._id) return 'lib_' + u._id.slice(0, 4) + '_';
  } catch (e) {}
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k.indexOf('lib_') === 0) {
      var j = k.indexOf('_', 4);
      if (j > 0) return k.slice(0, j + 1);
    }
  }
  return 'lib_local_';
}
// one shared account library (lib_<hash>_): progress/watched is pushed to api.strem.io
var LIBKEY = libPrefix() + ID;
// POST helper + push the library item to the account (same datastorePut Stremio uses)
/* done (optional) runs once the request finished, failed or took longer than 2 s */
function xpost(u, body, done) {
  var called = false;
  function finish() {
    if (called) return;
    called = true;
    if (done) done();
  }
  setTimeout(finish, 2000);
  try {
    if (u.indexOf('https://api.strem.io/api/') === 0)
      u = '/stremioapi?path=' + encodeURIComponent(u.slice('https://api.strem.io'.length));
    var x = new XMLHttpRequest();
    x.open('POST', u, true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.onreadystatechange = function () {
      if (x.readyState === 4) finish();
    };
    x.send(JSON.stringify(body));
  } catch (e) {
    finish();
  }
}
function authKeyLS() {
  try {
    return JSON.parse(localStorage.getItem('authKey') || 'null');
  } catch (e) {
    return null;
  }
}
var lastPush = 0;
function pushLib(force, done) {
  var ak = authKeyLS(),
    it = readLib(),
    n = Date.now();
  if (!ak || !it || !it._id || (!force && n - lastPush < 60000)) {
    if (done) done();
    return;
  }
  lastPush = n;
  xpost(
    'https://api.strem.io/api/datastorePut',
    { authKey: ak, collection: 'libraryItem', changes: [it] },
    done
  );
}
// remember exactly which stream we played so Continue Watching can resume it directly
try {
  if (ID) localStorage.setItem('tvstream_' + ID + '_' + (VID || ID), location.search);
} catch (e) {}
// if the name/poster never came back from the server (Cinemeta was slow), fetch it now so
// the Continue Watching entry isn't left blank
if ((!TITLE || !POSTER) && TYPE && ID) {
  xhr('/meta?type=' + encodeURIComponent(TYPE) + '&id=' + encodeURIComponent(ID), function (j) {
    if (j) {
      if (!TITLE) {
        TITLE = j.name || '';
        try {
          document.getElementById('title').textContent = TITLE;
        } catch (e) {}
      }
      if (!POSTER) POSTER = j.poster || '';
    }
  });
}
function readLib() {
  try {
    return JSON.parse(localStorage.getItem(LIBKEY) || 'null');
  } catch (e) {
    return null;
  }
}
// NOTE removed:true on auto-created items -> they power Continue Watching (cwItems ignores
// removed) but are kept OUT of the Library grid. Only an explicit + Library flips removed:false.
// Stremio auto-watch semantics: removed:false + temp:true (shows in Library + Continue
// Watching and syncs everywhere). An explicit + Library later flips temp:false.
function saveProgress() {
  if (!v.duration || !ID || sessionDone) return;
  var now = new Date().toISOString();
  var it = readLib();
  if (!it || !it.state) {
    it = {
      state: {},
      _id: ID,
      removed: false,
      temp: true,
      _ctime: now,
      name: TITLE,
      type: TYPE,
      poster: POSTER || '',
      posterShape: 'poster',
      background: BG || '',
      logo: LOGO || '',
      year: ''
    };
  } else {
    if (!it.name && TITLE) it.name = TITLE;
    if (!it.poster && POSTER) it.poster = POSTER;
    if (!it.type && TYPE) it.type = TYPE;
    if (!it.posterShape) it.posterShape = 'poster';
  }
  var s = it.state,
    vid = VID || ID,
    pos = Math.round(v.currentTime * 1000);
  /* as stremio-core: time watched counts real playback of this video only (a seek is not
     watching), and starts again when another episode takes over the item */
  if (s.video_id !== vid) {
    s.video_id = vid;
    s.timeWatched = 0;
    s.flaggedWatched = 0;
    lastPos = -1;
  }
  var step = lastPos >= 0 ? pos - lastPos : 0;
  lastPos = pos;
  if (step > 0 && step <= 15000) {
    s.timeWatched = (s.timeWatched || 0) + step;
    s.overallTimeWatched = (s.overallTimeWatched || 0) + step;
  }
  s.timeOffset = pos;
  s.duration = Math.round(v.duration * 1000);
  s.lastWatched = now;
  if (s.timeWatched == null) s.timeWatched = 0;
  if (s.overallTimeWatched == null) s.overallTimeWatched = 0;
  if (s.timesWatched == null) s.timesWatched = 0;
  if (s.flaggedWatched == null) s.flaggedWatched = 0;
  if (s.season == null) s.season = 0;
  if (s.episode == null) s.episode = 0;
  if (!s.watchedEpisodes) s.watchedEpisodes = [];
  if (s.noNotif == null) s.noNotif = false;
  if (s.watched == null) s.watched = '';
  it.state = s;
  it._mtime = now;
  if (it.removed == null) it.removed = false;
  if (it.temp == null) it.temp = true;
  /* Stremio apps list an item in Continue Watching only when it is in the library or
     temporary: a title removed from the library and watched again must become temporary */
  if (it.removed && !it.temp) it.temp = true;
  try {
    localStorage.setItem(LIBKEY, JSON.stringify(it));
  } catch (e) {}
  if (s.timeWatched > s.duration * WATCHED_THRESHOLD && !s.flaggedWatched) markWatchedLocal();
}
/* watched once 70 % was really played, as stremio-core (markWatchedLocal) */
var WATCHED_THRESHOLD = 0.7;
/* last saved position, to tell playback from seeks (saveProgress) */
var lastPos = -1,
  sessionDone = false;
/* playing again after the end resumes saving this video (finishSession) */
v.addEventListener('play', function () {
  sessionDone = false;
});
v.addEventListener('seeking', function () {
  lastPos = -1;
});
var didResume = false;
/* After an automatic resume, OK starts over for as long as the hint is on screen;
   any other toast replaces the hint and withdraws the offer. */
var RESTART_WINDOW = 8000,
  restartUntil = 0;
function restartOffered() {
  if (Date.now() >= restartUntil) return false;
  restartUntil = 0;
  try {
    v.currentTime = 0;
  } catch (e) {}
  showToast(P.fromStart);
  return true;
}
function tryResume() {
  if (didResume) return;
  didResume = true;
  var it = readLib();
  if (it && it.state && it.state.video_id === (VID || ID) && it.state.timeOffset > 5000) {
    var sec = it.state.timeOffset / 1000;
    if (!it.state.duration || sec < it.state.duration / 1000 - 30) {
      try {
        v.currentTime = sec;
        showToast(P.resuming + fmt(sec) + '  ·  ' + P.restartHint, RESTART_WINDOW);
        restartUntil = Date.now() + RESTART_WINDOW;
      } catch (e) {}
    }
  }
}
v.addEventListener('loadeddata', tryResume);
v.addEventListener('canplay', tryResume);
setInterval(function () {
  if (!v.paused) {
    saveProgress();
    pushLib(false);
  }
}, 10000);
v.addEventListener('pause', function () {
  saveProgress();
  pushLib(true);
});
/* once this episode is finished, Continue Watching offers the next one (account.js);
   kept for items saved by older versions, the account item now points at it itself */
function rememberUpNext() {
  if (!ID || !VID || !NEXTVID) return;
  try {
    localStorage.setItem('tvnext_' + ID + '_' + VID, NEXTVID);
  } catch (e) {}
}
/* Watched like the official apps once 70 % was really watched: the watched flag, one more
   time watched and, for an episode, its bit in state.watched so every Stremio app shows
   it; state.watchedEpisodes keeps the local mark until the field comes back. */
function markWatchedLocal() {
  var it = readLib();
  if (!it || !it.state) return;
  var s = it.state,
    wv = VID || ID;
  if (s.video_id !== wv || s.flaggedWatched) return;
  s.flaggedWatched = 1;
  s.timesWatched = (s.timesWatched || 0) + 1;
  if (!s.watchedEpisodes) s.watchedEpisodes = [];
  if (s.watchedEpisodes.indexOf(wv) < 0) s.watchedEpisodes.push(wv);
  it._mtime = new Date().toISOString();
  try {
    localStorage.setItem(LIBKEY, JSON.stringify(it));
  } catch (e) {}
  pushLib(true);
  if (TYPE !== 'series' || !VID) return;
  xhr(
    '/watchedset?id=' +
      encodeURIComponent(ID) +
      '&vid=' +
      encodeURIComponent(VID) +
      '&f=' +
      encodeURIComponent(s.watched || ''),
    function (j) {
      var cur = readLib();
      if (!j || !j.watched || !cur || !cur.state) return;
      cur.state.watched = j.watched;
      cur._mtime = new Date().toISOString();
      try {
        localStorage.setItem(LIBKEY, JSON.stringify(cur));
      } catch (e) {}
      pushLib(true);
    }
  );
}
/* Leaving after the credits started (90 %), as stremio-core: the position goes back to the
   start and a series moves on to its next episode, which Continue Watching then offers on
   every device. `toNext` (the Next button) moves on even before the credits. */
function finishSession(toNext) {
  if (!v.duration) return;
  saveProgress();
  var it = readLib();
  if (!it || !it.state || it.state.video_id !== (VID || ID)) return;
  var s = it.state;
  if (!toNext && !watchFinished(s.timeOffset, s.duration)) return;
  rememberUpNext();
  s.timeOffset = 0;
  if (TYPE === 'series' && NEXTVID) {
    s.video_id = NEXTVID;
    s.timeOffset = 1;
    s.timeWatched = 0;
    s.flaggedWatched = 0;
    var pp = NEXTVID.split(':');
    if (pp.length >= 3) {
      s.season = parseInt(pp[pp.length - 2], 10) || 0;
      s.episode = parseInt(pp[pp.length - 1], 10) || 0;
    }
  }
  sessionDone = true;
  it._mtime = new Date().toISOString();
  try {
    localStorage.setItem(LIBKEY, JSON.stringify(it));
  } catch (e) {}
}
// binge: when the episode ends, count down to the next one (up-next.js)
v.addEventListener('ended', function () {
  finishSession(false);
  pushLib(true);
  var binge = lsGet('bingeWatch', 'true') !== 'false' && lsGet('enableNextVideo', 'true') !== 'false';
  if (binge && NEXTHREF && !npDismissed) startAutoNext();
});
