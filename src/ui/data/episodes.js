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
function buildEpisodeModel(videos) {
  var bySeason = {},
    order = [],
    i,
    s,
    v,
    eps,
    o,
    sn,
    cursor = 0,
    seasons = [],
    linear = [];
  videos = videos || [];
  for (i = 0; i < videos.length; i++) {
    v = videos[i];
    s = v.season != null ? parseInt(v.season, 10) : 0;
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
    eps.sort(function (a, b) {
      return episodeNumber(a, 0) - episodeNumber(b, 0);
    });
    for (i = 0; i < eps.length; i++) {
      v = eps[i];
      v._stremSeason = sn;
      v._stremSeasonEpisode = episodeNumber(v, i + 1);
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
