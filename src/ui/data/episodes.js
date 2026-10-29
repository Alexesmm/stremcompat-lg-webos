// Series episode model: season order, continuous numbering and metadata enrichment.
function episodeNumber(v, fallback) {
  var n = parseInt(v && (v.episode != null ? v.episode : v.number), 10);
  return n > 0 ? n : fallback;
}
function explicitAbsoluteEpisode(v) {
  var keys = ['absoluteEpisode', 'absolute_episode', 'absoluteNumber', 'absolute_number', 'episodeAbsolute'];
  for (var i = 0; i < keys.length; i++) {
    var n = parseInt(v && v[keys[i]], 10);
    if (n > 0) return n;
  }
  return 0;
}
function releasedTime(v) {
  var t = Date.parse((v && (v.released || v.firstAired)) || '');
  return isNaN(t) ? 0 : t;
}
/* an episode without a date counts as released: addons often omit it */
function episodeReleased(v, now) {
  var t = releasedTime(v);
  return !t || t <= (now || Date.now());
}
/* Episodes sort by number. Chromium 38/53 sort is not stable beyond 10 items, so ties
   (missing or repeated numbers) fall back to the release date and then to the order
   the addon sent, which keeps the list and the overall numbering identical on every
   opening. Unnumbered episodes go after the numbered ones of their season. */
function episodeOrder(a, b) {
  var na = episodeNumber(a, 0),
    nb = episodeNumber(b, 0);
  if (na && nb && na !== nb) return na - nb;
  if (!na !== !nb) return na ? -1 : 1;
  var ra = releasedTime(a),
    rb = releasedTime(b);
  if (ra && rb && ra !== rb) return ra - rb;
  return a._stremOrder - b._stremOrder;
}
function buildEpisodeModel(videos) {
  var bySeason = {},
    order = [],
    seen = {},
    hasSeasons = false,
    i,
    s,
    v,
    eps,
    o,
    sn,
    last,
    cursor = 0,
    seasons = [],
    linear = [];
  videos = videos || [];
  for (i = 0; i < videos.length; i++) if (videos[i] && videos[i].season != null) hasSeasons = true;
  for (i = 0; i < videos.length; i++) {
    v = videos[i];
    if (!v || (v.id && seen[v.id])) continue; /* an addon listing the same video twice */
    if (v.id) seen[v.id] = 1;
    v._stremOrder = i;
    /* without any season field (channel-like series) the videos are one regular
       season, not specials, so they still get an overall numbering */
    s = v.season != null ? parseInt(v.season, 10) : hasSeasons ? 0 : 1;
    if (isNaN(s)) s = 0;
    if (!bySeason[s]) {
      bySeason[s] = [];
      order.push(s);
    }
    bySeason[s].push(v);
  }
  order.sort(function (a, b) {
    if (a === 0) return 1;
    if (b === 0) return -1;
    return a - b;
  });
  for (o = 0; o < order.length; o++) {
    sn = order[o];
    eps = bySeason[sn];
    eps.sort(episodeOrder);
    last = 0;
    for (i = 0; i < eps.length; i++) {
      v = eps[i];
      v._stremSeason = sn;
      /* an unnumbered episode continues after the highest number seen, never reusing one */
      v._stremSeasonEpisode = episodeNumber(v, last + 1);
      last = Math.max(last, v._stremSeasonEpisode);
      if (sn === 0) v._stremAbsolute = 0;
      else {
        var ex = explicitAbsoluteEpisode(v);
        cursor = ex > 0 ? Math.max(cursor + 1, ex) : cursor + 1;
        v._stremAbsolute = cursor;
        linear.push(v);
      }
    }
    seasons.push({ n: sn, eps: eps });
  }
  return { seasons: seasons, linear: linear };
}
/* Episodes watched on any Stremio app, from the library item's `watched` field decoded by
   the local server (/watchedbits). Same rule as stremio-watched-bitfield: video ids ordered
   by season then episode (season 0 first, ties keep the addon order), and the stored bits
   shifted so that the anchor video keeps its position. An unknown anchor means none. */
function watchedFromBits(res, videos) {
  var list = [],
    out = {},
    i;
  for (i = 0; i < (videos || []).length; i++)
    if (videos[i] && videos[i].id) list.push({ v: videos[i], i: i });
  function num(x) {
    var n = parseInt(x, 10);
    return isNaN(n) ? -Infinity : n;
  }
  list.sort(function (a, b) {
    var sa = num(a.v.season),
      sb = num(b.v.season),
      ea = num(a.v.episode != null ? a.v.episode : a.v.number),
      eb = num(b.v.episode != null ? b.v.episode : b.v.number);
    if (sa !== sb) return sa < sb ? -1 : 1;
    if (ea !== eb) return ea < eb ? -1 : 1;
    return a.i - b.i;
  });
  var at = -1;
  for (i = 0; i < list.length; i++) if (list[i].v.id === res.anchor) at = i;
  if (at < 0 || !res.bits) return out;
  var offset = (parseInt(res.alen, 10) || 0) - at - 1;
  for (i = 0; i < list.length; i++) {
    var j = i + offset;
    if (j >= 0 && j < res.bits.length && res.bits[j]) out[list[i].v.id] = 1;
  }
  return out;
}
window.__STREMIO_WATCHED_FROM_BITS__ = watchedFromBits;
function episodeImage(v, meta) {
  var u = (v && (v.thumbnail || v.still || v.stillPath || v.still_path)) || '';
  if (u && String(u).charAt(0) === '/') u = 'https://image.tmdb.org/t/p/w500' + u;
  return u;
}
function episodeIndexByNumber(items, n) {
  for (var i = 0; i < (items || []).length; i++) if (items[i]._stremAbsolute === n) return i;
  return -1;
}
window.__STREMIO_EPISODE_INDEX__ = episodeIndexByNumber;
function episodeFallback(meta, small) {
  if (!meta) return '';
  return small ? bgSmall(meta) || posterOf(meta) : meta.background || bgOf(meta) || meta.poster || '';
}
function mergeEpisodeDetails(base, extra) {
  if (!base || !extra || !base.videos || !extra.videos) return false;
  var byId = {},
    byNum = {},
    i,
    v,
    x,
    k,
    changed = false,
    fields = [
      'thumbnail',
      'still',
      'stillPath',
      'still_path',
      'overview',
      'description',
      'name',
      'title',
      'absoluteEpisode',
      'absolute_episode',
      'absoluteNumber',
      'absolute_number'
    ];
  for (i = 0; i < extra.videos.length; i++) {
    x = extra.videos[i];
    if (x.id) byId[x.id] = x;
    k = String(x.season == null ? 0 : x.season) + ':' + String(episodeNumber(x, i + 1));
    byNum[k] = x;
  }
  for (i = 0; i < base.videos.length; i++) {
    v = base.videos[i];
    x =
      (v.id && byId[v.id]) ||
      byNum[String(v.season == null ? 0 : v.season) + ':' + String(episodeNumber(v, i + 1))];
    if (!x) continue;
    for (var f = 0; f < fields.length; f++) {
      k = fields[f];
      if (!v[k] && x[k]) {
        v[k] = x[k];
        changed = true;
      }
    }
  }
  return changed;
}
function enrichEpisodeMetadata(type, id, meta, cb) {
  if (type !== 'series' || !meta || !meta.videos || !meta.videos.length) {
    cb(false);
    return;
  }
  var bases = metaAddonsFor(type, id),
    seen = {},
    queue = [];
  for (var i = 0; i < bases.length; i++) {
    var b = bases[i];
    if (b && b !== CIN && !seen[b]) {
      seen[b] = 1;
      queue.push(b);
    }
  }
  var at = 0,
    changed = false;
  function next() {
    if (at >= queue.length) {
      cb(changed);
      return;
    }
    var b = queue[at++];
    xhrJson(
      b + '/meta/' + type + '/' + encodeURIComponent(id) + '.json',
      function (j) {
        if (j && j.meta) changed = mergeEpisodeDetails(meta, j.meta) || changed;
        next();
      },
      4500
    );
  }
  next();
}
window.__STREMIO_EPISODE_MODEL__ = buildEpisodeModel;
window.__STREMIO_MERGE_EPISODES__ = mergeEpisodeDetails;
