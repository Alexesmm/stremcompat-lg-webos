// Title metadata cache (memory + localStorage) and artwork prewarming.
/* ================= meta (cached; resolves via addons for non-imdb ids) ================= */
var metaMem = {},
  metaMemOrder = [];
function putMetaMem(k, m) {
  var at = metaMemOrder.indexOf(k);
  if (at >= 0) metaMemOrder.splice(at, 1);
  metaMem[k] = m;
  metaMemOrder.push(k);
  while (metaMemOrder.length > (TV_PROFILE.lowMemory ? 12 : 24)) {
    var old = metaMemOrder.shift();
    delete metaMem[old];
  }
}
function metaAddonsFor(type, id) {
  var out = [],
    a = remoteAddons();
  for (var i = 0; i < a.length; i++) {
    var m = a[i] && a[i].manifest;
    if (!m) continue;
    var res = m.resources || [],
      has = false;
    for (var r = 0; r < res.length; r++) {
      var rr = res[r];
      if (rr === 'meta' || (rr && rr.name === 'meta')) has = true;
    }
    if (!has) continue;
    var types = m.types || [];
    if (types.length && types.indexOf(type) < 0) continue;
    var ok = !m.idPrefixes || !m.idPrefixes.length;
    if (m.idPrefixes)
      for (var p = 0; p < m.idPrefixes.length; p++) if (String(id).indexOf(m.idPrefixes[p]) === 0) ok = true;
    if (!ok) {
      for (var r2 = 0; r2 < res.length; r2++) {
        var rr2 = res[r2];
        if (rr2 && rr2.name === 'meta' && rr2.idPrefixes)
          for (var p2 = 0; p2 < rr2.idPrefixes.length; p2++)
            if (String(id).indexOf(rr2.idPrefixes[p2]) === 0) ok = true;
      }
    }
    if (ok) out.push(addonBase(a[i]));
  }
  return out;
}
function capMetaCache(k) {
  var keys = lsJson('beta_meta_keys') || [];
  var i = keys.indexOf(k);
  if (i >= 0) keys.splice(i, 1);
  keys.push(k);
  while (keys.length > 12) {
    var old = keys.shift();
    try {
      localStorage.removeItem('beta_meta_' + old);
    } catch (e) {}
  }
  lsSet('beta_meta_keys', keys);
}
/* What is already known about a title, at once: its name and artwork for the player (playback.js).
   Kitsu anime and long series such as One Piece answer the player's own lookup too late or not
   at all, and the player then had only the torrent's name and no picture. */
function knownArtwork(type, id) {
  var k = type + '_' + id,
    kept = lsJson('beta_meta_' + k),
    m = metaMem[k] || (kept && kept.meta);
  if (!m) return null;
  return { name: m.name || '', logo: m.logo || '', background: m.background || '', poster: m.poster || '' };
}
/* An addon besides Cinemeta that describes IMDb titles, such as TMDB set to Italian: the one the
   viewer installed to read titles in their language. The first in the addon order is used; the
   TMDB addon names only tmdb: ids in its manifest but answers IMDb ones too. */
var LOCAL_META_TIMEOUT_MS = 5000;
function localMetaBase(type, id) {
  var bases = metaAddonsFor(type, id).concat(metaAddonsFor(type, 'tmdb:'));
  for (var i = 0; i < bases.length; i++) if (bases[i] && bases[i].indexOf('cinemeta') < 0) return bases[i];
  return '';
}
/* Cinemeta keeps the structure (ids, episodes, ratings, genres for its own catalogs); the name,
   the synopsis and the episode titles and summaries come from that addon */
function overlayLocalText(meta, local) {
  if (!meta || !local) return;
  if (local.name) meta.name = local.name;
  if (local.description) meta.description = local.description;
  if (!meta.videos || !local.videos) return;
  var byNum = {},
    i,
    v,
    x;
  for (i = 0; i < local.videos.length; i++) {
    x = local.videos[i];
    byNum[x.season + ':' + x.episode] = x;
  }
  for (i = 0; i < meta.videos.length; i++) {
    v = meta.videos[i];
    x = byNum[v.season + ':' + v.episode];
    if (!x) continue;
    if (x.name || x.title) v.name = v.title = x.name || x.title;
    if (x.overview || x.description) v.overview = v.description = x.overview || x.description;
  }
}
window.__SC_OVERLAY_LOCAL__ = overlayLocalText;
function getMeta(type, id, cb) {
  var k = type + '_' + id;
  if (metaMem[k]) {
    cb(metaMem[k]);
    return;
  }
  var ls = lsJson('beta_meta_' + k);
  var fresh = ls && ls.t && Date.now() - ls.t < 43200000 && ls.meta;
  if (fresh) {
    putMetaMem(k, ls.meta);
    cb(ls.meta);
  }
  var bases = isImdb(id) ? [CIN] : metaAddonsFor(type, id);
  if (!bases.length && !fresh) {
    cb(null);
    return;
  }
  /* the text in the viewer's language is asked at the same time, and waited for up to 5 s */
  var local = isImdb(id) ? localMetaBase(type, id) : '',
    localMeta = null,
    localDone = !local,
    whenLocal = null;
  if (local)
    xhrJson(
      local + '/meta/' + type + '/' + encodeURIComponent(id) + '.json' + addonQueryFor(addons(), local),
      function (j) {
        localMeta = j && j.meta;
        localDone = true;
        if (whenLocal) whenLocal();
      },
      LOCAL_META_TIMEOUT_MS
    );
  var bi = 0;
  function tryNext() {
    if (bi >= bases.length) {
      if (!fresh) cb(null);
      return;
    }
    var b = bases[bi++];
    xhrJson(
      b + '/meta/' + type + '/' + encodeURIComponent(id) + '.json' + addonQueryFor(addons(), b),
      function (j) {
        var m = j && j.meta;
        if (!m) {
          tryNext();
          return;
        }
        function keep() {
          whenLocal = null;
          overlayLocalText(m, localMeta);
          putMetaMem(k, m);
          lsSet('beta_meta_' + k, { t: Date.now(), meta: m });
          capMetaCache(k);
          if (!fresh) cb(m);
        }
        if (localDone) keep();
        else whenLocal = keep;
      }
    );
  }
  tryNext();
}
var warmed = {},
  warmedN = 0;
function prewarm(u) {
  if (!u || warmed[u]) return;
  if (warmedN > (TV_PROFILE.lowMemory ? 48 : 140)) {
    warmed = {};
    warmedN = 0;
  } /* keep the book-keeping map tiny */
  warmed[u] = 1;
  warmedN++;
  var im = new Image();
  im.src = u;
}
function prewarmNeighbors(row) {
  if (!row || !row.items) return;
  if (accel.cnt >= 2) return; /* moving at all: no precache — every large texture costs us on this GPU */
  /* warm ONLY the focused item's backdrop + logo (what the hero shows next); neighbours'
     full-screen backdrops were the RAM/GPU hog that made scrolling sluggish. */
  var it = row.items[row.col];
  if (!it) return;
  prewarm(bgMid(it));
  if (!TV_PROFILE.lowMemory && isImdb(it.id))
    prewarm('https://images.metahub.space/logo/medium/' + it.id + '/img');
}
