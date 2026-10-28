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
function xpost(u, body) {
  try {
    if (u.indexOf('https://api.strem.io/api/') === 0)
      u = '/stremioapi?path=' + encodeURIComponent(u.slice('https://api.strem.io'.length));
    var x = new XMLHttpRequest();
    x.open('POST', u, true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.send(JSON.stringify(body));
  } catch (e) {}
}
function authKeyLS() {
  try {
    return JSON.parse(localStorage.getItem('authKey') || 'null');
  } catch (e) {
    return null;
  }
}
var lastPush = 0;
function pushLib(force) {
  var ak = authKeyLS();
  if (!ak) return;
  var it = readLib();
  if (!it || !it._id) return;
  var n = Date.now();
  if (!force && n - lastPush < 60000) return;
  lastPush = n;
  xpost('https://api.strem.io/api/datastorePut', { authKey: ak, collection: 'libraryItem', changes: [it] });
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
  if (!v.duration || !ID) return;
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
  var s = it.state;
  s.timeOffset = Math.round(v.currentTime * 1000);
  s.duration = Math.round(v.duration * 1000);
  s.video_id = VID || ID;
  s.lastWatched = now;
  s.timeWatched = s.timeOffset;
  if (s.overallTimeWatched == null) s.overallTimeWatched = s.timeOffset;
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
  try {
    localStorage.setItem(LIBKEY, JSON.stringify(it));
  } catch (e) {}
}
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
    if (v.duration && v.currentTime / v.duration > 0.95) markWatchedLocal();
  }
}, 10000);
v.addEventListener('pause', function () {
  saveProgress();
  pushLib(true);
});
v.addEventListener('ended', function () {
  saveProgress();
  pushLib(true);
});
// local watched flag: add this video id to state.watchedEpisodes (drives the beta checkmarks)
function markWatchedLocal() {
  try {
    var it = readLib();
    if (!it || !it.state) return;
    var wv = VID || ID;
    if (!it.state.watchedEpisodes) it.state.watchedEpisodes = [];
    for (var i = 0; i < it.state.watchedEpisodes.length; i++) if (it.state.watchedEpisodes[i] === wv) return;
    it.state.watchedEpisodes.push(wv);
    it.state.flaggedWatched = 1;
    it._mtime = new Date().toISOString();
    localStorage.setItem(LIBKEY, JSON.stringify(it));
    pushLib(true);
  } catch (e) {}
}
// binge: when the episode ends, jump straight to the next one (detail deep-link opens its streams)
v.addEventListener('ended', function () {
  markWatchedLocal();
  var binge = lsGet('bingeWatch', 'true') !== 'false' && lsGet('enableNextVideo', 'true') !== 'false';
  if (binge && NEXTHREF && !npDismissed) {
    rememberNextSource();
    showToast(P.nextLoading);
    setTimeout(function () {
      location.replace(NEXTHREF);
    }, 600);
  }
});
