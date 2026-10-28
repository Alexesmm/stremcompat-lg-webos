// Series that gained episodes since they were last watched, for the Home row.
/* Checked at most once a day, for the few series watched most recently, one metadata
   request at a time in the background after Home is up. The result is stored and shown
   the next time Home is built, so a row never appears under the viewer's focus. */
var NEW_EPISODES_KEY = 'newEpisodes',
  NEW_EPISODES_EVERY = 24 * 60 * 60 * 1000;
function newEpisodeItems() {
  var c = lsJson(NEW_EPISODES_KEY);
  return c && c.items && c.items.length ? c.items : [];
}
/* the first aired, unwatched regular episode released after the series was last watched */
function firstNewEpisode(meta, state) {
  var since = Date.parse(state.lastWatched || '') || 0,
    now = Date.now(),
    seen = {},
    best = null,
    bestAt = 0,
    count = 0,
    we = state.watchedEpisodes || [];
  for (var w = 0; w < we.length; w++) seen[we[w]] = 1;
  var videos = (meta && meta.videos) || [];
  for (var i = 0; i < videos.length; i++) {
    var v = videos[i],
      at = releasedTime(v);
    if (!v || !v.id || !(parseInt(v.season, 10) > 0) || seen[v.id]) continue;
    if (!at || at <= since || at > now) continue;
    count++;
    if (!best || at < bestAt) {
      best = v;
      bestAt = at;
    }
  }
  return best ? { id: best.id, count: count } : null;
}
window.__STREMIO_FIRST_NEW_EPISODE__ = firstNewEpisode;
function checkNewEpisodes(done) {
  var cached = lsJson(NEW_EPISODES_KEY);
  if (cached && cached.at && Date.now() - cached.at < NEW_EPISODES_EVERY) {
    done(false);
    return;
  }
  var lib = allLib(),
    series = [];
  for (var i = 0; i < lib.length; i++) {
    var it = lib[i],
      s = it.state || {};
    if (it.type !== 'series' || !it._id) continue;
    if (it.removed && !(s.timeOffset > 0) && !(s.watchedEpisodes && s.watchedEpisodes.length)) continue;
    series.push(it);
  }
  series.sort(function (a, b) {
    return String(b._mtime || '').localeCompare(String(a._mtime || ''));
  });
  series = series.slice(0, TV_PROFILE.lowMemory ? 3 : 6);
  var found = [],
    at = 0;
  function next() {
    if (at >= series.length) {
      var before = JSON.stringify(newEpisodeItems());
      lsSet(NEW_EPISODES_KEY, { at: Date.now(), items: found });
      done(JSON.stringify(found) !== before);
      return;
    }
    var it = series[at++];
    getMeta('series', it._id, function (m) {
      var ep = m && firstNewEpisode(m, it.state || {});
      if (ep)
        found.push({
          id: it._id,
          type: 'series',
          name: it.name || (m && m.name) || '',
          poster: it.poster || (m && m.poster) || '',
          background: it.background || (m && m.background) || '',
          videoId: ep.id,
          fresh: true
        });
      next();
    });
  }
  next();
}
