// Library add/remove and watched state.
/* ================= library helpers (explicit add only — watching never adds) ================= */
function libHas(id) {
  var it = lsJson(PRE + id);
  return !!(it && it.removed === false);
}
/* A film counts as watched when Stremio says so (times watched or the watched flag, also
   set by other devices, which reset the position to 0 once a film ends), when it is in the
   local watched list, or when it stopped in the credits (past 90 %). */
function itemWatched(it) {
  if (!it || !it.id || it.type === 'series') return false;
  var lib = lsJson(PRE + it.id);
  if (!lib || !lib.state) return false;
  var s = lib.state;
  var vid = it.videoId || it.id;
  if (s.timesWatched > 0 || s.flaggedWatched > 0) return true;
  if (s.watchedEpisodes)
    for (var i = 0; i < s.watchedEpisodes.length; i++) if (s.watchedEpisodes[i] === vid) return true;
  return watchFinished(s.timeOffset, s.duration);
}
/* A library entry as Stremio stores one, for a title the library has not seen yet */
function newLibItem(item, now) {
  return {
    state: {
      lastWatched: now,
      timeOffset: 0,
      timeWatched: 0,
      overallTimeWatched: 0,
      timesWatched: 0,
      flaggedWatched: 0,
      duration: 0,
      video_id: item.id,
      watched: '',
      noNotif: false,
      season: 0,
      episode: 0,
      watchedEpisodes: []
    },
    _id: item.id,
    _ctime: now
  };
}
function libToggle(item) {
  var now = new Date().toISOString();
  var it = lsJson(PRE + item.id);
  if (it && it.removed === false) {
    it.removed = true;
    it._mtime = now;
    lsSet(PRE + item.id, it);
    toast(tx('removedLibrary'));
  } else {
    if (!it) it = newLibItem(item, now);
    it.removed = false;
    it.temp = false;
    it._mtime = now;
    it.name = item.name || it.name || '';
    it.type = item.type;
    it.poster = item.poster || it.poster || '';
    it.posterShape = 'poster';
    it.background = item.background || it.background || '';
    lsSet(PRE + item.id, it);
    toast(tx('addedLibrary'));
  }
  pushLib(lsJson(PRE + item.id));
  invalidateBoards();
}
/* Leaves Continue Watching without marking anything watched, as Stremio dismisses an
   item: the saved position returns to the start. Synced like any library change. */
function dismissCw(id) {
  var lib = lsJson(PRE + id);
  if (!lib || !lib.state) return null;
  lib.state.timeOffset = 0;
  lib._mtime = new Date().toISOString();
  lsSet(PRE + id, lib);
  return lib;
}
function removeFromCw(it) {
  var lib = dismissCw(it.id);
  if (lib) pushLib(lib);
  invalidateBoards();
}
function clearContinueWatching() {
  var items = cwItems(1000),
    changed = [];
  for (var i = 0; i < items.length; i++) {
    var lib = dismissCw(items[i]._id);
    if (lib) changed.push(lib);
  }
  pushLibItems(changed);
  invalidateBoards();
  return changed.length;
}
function clearRecentSearches() {
  lsSet(RECENT_SEARCH_KEY, []);
  search.recentSig = null;
}
/* Marked watched as the official apps do: the watched flag, one more time watched and,
   for an episode, its bit in state.watched (written by the local server, which has the
   episode list), so other devices show it too. */
function markCwWatched(it) {
  var lib2 = lsJson(PRE + it.id);
  if (!lib2) return;
  var s2 = lib2.state || {};
  var vid = s2.video_id || it.videoId || it.id;
  if (!s2.watchedEpisodes) s2.watchedEpisodes = [];
  if (s2.watchedEpisodes.indexOf(vid) < 0) s2.watchedEpisodes.push(vid);
  if (!s2.flaggedWatched) s2.timesWatched = (s2.timesWatched || 0) + 1;
  s2.flaggedWatched = 1;
  s2.timeOffset = 0;
  lib2.state = s2;
  lib2._mtime = new Date().toISOString();
  lsSet(PRE + it.id, lib2);
  pushLib(lib2);
  invalidateBoards();
  if (lib2.type !== 'series' || vid === it.id) return;
  pushEpisodeField(it.id, vid, true, s2.watched);
}
/* An episode's bit in state.watched, written by the local server (it has the episode
   list), so other devices show the change too; cb runs once it is saved. */
function pushEpisodeField(id, vid, watched, field, cb) {
  xhrJson(
    '/watchedset?id=' +
      encodeURIComponent(id) +
      '&vid=' +
      encodeURIComponent(vid) +
      '&w=' +
      (watched ? '1' : '0') +
      '&f=' +
      encodeURIComponent(field || ''),
    function (j) {
      var cur = lsJson(PRE + id);
      if (j && j.watched && cur && cur.state) {
        cur.state.watched = j.watched;
        cur._mtime = new Date().toISOString();
        lsSet(PRE + id, cur);
        pushLib(cur);
      }
      if (cb) cb();
    }
  );
}
/* Mark as watched / unwatched from the title menu: a film (it.videoId empty or its own id)
   or one episode of a series (it.videoId). A title not in the library gets an entry that
   stays out of it (removed), as Stremio keeps watched state for titles never added. */
function setItemWatched(it, watched, cb) {
  var now = new Date().toISOString(),
    lib = lsJson(PRE + it.id);
  if (!lib) {
    lib = newLibItem(it, now);
    lib.removed = true;
    lib.temp = true;
    lib.name = it.name || '';
    lib.type = it.type;
    lib.poster = it.poster || '';
    lib.posterShape = 'poster';
    lib.background = it.background || '';
  }
  var s = lib.state || (lib.state = {}),
    vid = it.videoId || it.id,
    episode = it.type === 'series' && vid !== it.id;
  if (!s.watchedEpisodes) s.watchedEpisodes = [];
  var at = s.watchedEpisodes.indexOf(vid);
  if (watched && at < 0) s.watchedEpisodes.push(vid);
  if (!watched && at >= 0) s.watchedEpisodes.splice(at, 1);
  if (!episode) {
    if (watched && !s.flaggedWatched) s.timesWatched = (s.timesWatched || 0) + 1;
    s.flaggedWatched = watched ? 1 : 0;
    if (!watched) s.timesWatched = 0;
  }
  if (s.video_id === vid) s.timeOffset = 0;
  lib._mtime = now;
  lsSet(PRE + it.id, lib);
  pushLib(lib);
  invalidateBoards();
  if (episode) pushEpisodeField(it.id, vid, watched, s.watched, cb);
  else if (cb) cb();
}
/* A whole season at once: its episodes one after another, since each episode's bit is
   written over the field the previous one left. */
function setEpisodesWatched(it, vids, watched, cb) {
  var i = 0;
  (function next() {
    if (i >= vids.length) {
      if (cb) cb();
      return;
    }
    setItemWatched(
      {
        type: 'series',
        id: it.id,
        name: it.name,
        poster: it.poster,
        background: it.background,
        videoId: vids[i++]
      },
      watched,
      next
    );
  })();
}
