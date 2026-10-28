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
    a = addons();
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
  var bi = 0;
  function tryNext() {
    if (bi >= bases.length) {
      if (!fresh) cb(null);
      return;
    }
    var b = bases[bi++];
    xhrJson(b + '/meta/' + type + '/' + encodeURIComponent(id) + '.json', function (j) {
      var m = j && j.meta;
      if (!m) {
        tryNext();
        return;
      }
      putMetaMem(k, m);
      lsSet('beta_meta_' + k, { t: Date.now(), meta: m });
      capMetaCache(k);
      if (!fresh) cb(m);
    });
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
