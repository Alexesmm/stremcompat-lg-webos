// Stremio account session and library synchronization.
/* ================= account / library ================= */
function user() {
  return lsJson('user');
}
function authKey() {
  return lsJson('authKey');
}
/* Library / Continue Watching / watched all sync to the Stremio account, exactly like
   the official apps: items live under lib_<first4 of user._id>_<id> (shared with the
   classic shell on this origin), pulled on boot and pushed on every change. */
function libPrefix() {
  var u = user();
  if (u && u._id) return 'lib_' + u._id.slice(0, 4) + '_';
  var keys = storageKeys();
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k.indexOf('lib_') === 0) {
      var j = k.indexOf('_', 4);
      if (j > 0) return k.slice(0, j + 1);
    }
  }
  return 'lib_local_';
}
var PRE = libPrefix();
window.__STREMIO_PHASE__('M1');
function allLib() {
  var out = [],
    keys = storageKeys();
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k.indexOf(PRE) !== 0) continue;
    var it = lsJson(k);
    if (it && it._id) out.push(it);
  }
  return out;
}
/* whole minutes left, or 0 when the numbers cannot be trusted */
function watchMinutesLeft(offsetMs, durationMs) {
  if (!(durationMs > 0) || !(offsetMs > 60000) || offsetMs >= durationMs) return 0;
  return Math.max(1, Math.round((durationMs - offsetMs) / 60000));
}
/* the episode the player recorded as next when this one finished */
function upNextOf(id, vid) {
  var next = lsRaw('tvnext_' + id + '_' + vid, '');
  return next && next !== vid ? next : '';
}
/* Continue Watching card data: a finished episode becomes its next episode, and the
   minutes left are only shown when the saved numbers can be trusted. */
function cwCard(it) {
  var s = it.state || {},
    next = watchFinished(s.timeOffset, s.duration) ? upNextOf(it._id, s.video_id) : '';
  return {
    id: it._id,
    type: it.type || 'movie',
    name: it.name,
    poster: it.poster,
    background: it.background,
    videoId: next || s.video_id || it._id,
    progress: next ? 0 : s.duration > 0 ? s.timeOffset / s.duration : 0,
    minutesLeft: next ? 0 : watchMinutesLeft(s.timeOffset, s.duration),
    upNext: !!next,
    cw: true
  };
}
window.__STREMIO_CW_CARD__ = cwCard;
function cwItems(limit) {
  var out = [],
    lib = allLib();
  for (var i = 0; i < lib.length; i++) {
    var it = lib[i],
      s = it.state || {};
    if (!s.timeOffset || s.timeOffset < 60000) continue;
    /* a finished episode stays only when its next episode is known (cwCard) */
    if (watchFinished(s.timeOffset, s.duration) && !(it.type === 'series' && upNextOf(it._id, s.video_id)))
      continue;
    if (!it.name) continue;
    out.push(it);
  }
  out.sort(function (a, b) {
    return String(b._mtime || '').localeCompare(String(a._mtime || ''));
  });
  return out.slice(0, limit || 12);
}
function libGridItems() {
  var out = [],
    lib = allLib();
  for (var i = 0; i < lib.length; i++) {
    var it = lib[i];
    if (it.removed) continue;
    if (!it.name) continue;
    out.push(it);
  }
  out.sort(function (a, b) {
    return String(b._mtime || '').localeCompare(String(a._mtime || ''));
  });
  return out.slice(0, TV_PROFILE.libraryCap);
}
/* pull the account library on boot: newest-mtime-wins, then rebuild the boards */
/* a modification time as milliseconds, from a number or an ISO string */
function mtimeMs(v) {
  if (typeof v === 'number') return v;
  var t = Date.parse(v || '');
  return isNaN(t) ? 0 : t;
}
window.__STREMIO_MTIME_MS__ = mtimeMs;
function pullLib(cb) {
  var ak = authKey();
  if (!ak) {
    if (cb) cb();
    return;
  }
  postJson(API + '/api/datastoreMeta', { authKey: ak, collection: 'libraryItem' }, function (r) {
    var rows = r && r.result;
    if (!rows || !rows.length) {
      if (cb) cb();
      return;
    }
    /* datastoreMeta returns modification times in milliseconds while items carry ISO
       strings, so both are compared as times (a text comparison never pulled anything
       that already existed here). Items newer here than on the account, or missing
       there, are pushed back: a push lost when the player closed is not lost for good. */
    var want = [],
      onServer = {},
      push = [];
    for (var i = 0; i < rows.length; i++) {
      var id = rows[i][0],
        mt = mtimeMs(rows[i][1]),
        loc = lsJson(PRE + id);
      onServer[id] = 1;
      if (!loc || mtimeMs(loc._mtime) < mt) {
        if (want.length < 150) want.push(id);
      } else if (mtimeMs(loc._mtime) > mt + 1000 && push.length < 50) push.push(loc);
    }
    var local = allLib();
    for (var l = 0; l < local.length && push.length < 50; l++) {
      var li = local[l],
        ls = li.state || {};
      if (li._id && !onServer[li._id] && (li.removed === false || ls.timeOffset > 0)) push.push(li);
    }
    pushLibItems(push);
    if (!want.length) {
      if (cb) cb();
      return;
    }
    postJson(
      API + '/api/datastoreGet',
      { authKey: ak, collection: 'libraryItem', ids: want, all: false },
      function (g) {
        var items = g && g.result;
        if (items && items.length)
          for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it && it._id) lsSet(PRE + it._id, it);
          }
        if (cb) cb();
      }
    );
  });
}
/* push one library item up to the account (datastorePut = how Stremio persists it) */
function pushLib(item) {
  if (item && item._id) pushLibItems([item]);
}
function pushLibItems(items) {
  var ak = authKey();
  if (!ak || !items || !items.length) return;
  postJson(
    API + '/api/datastorePut',
    { authKey: ak, collection: 'libraryItem', changes: items },
    function () {},
    9000
  );
}
