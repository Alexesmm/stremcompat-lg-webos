// Stremio's watched-episodes field (state.watched), read and written like stremio-core.

var zlib = require('zlib');
var { fetchJson } = require('./http-util');

/* Format "<anchor video id>:<anchor length>:<base64 zlib bytes>". Bit i is
   (byte[i >> 3] >> (i % 8)) & 1 over the series videos ordered by season, then episode
   (a missing number sorts first, ties keep the metadata order). The anchor is the last
   watched video and the length its index + 1, so episodes added later do not shift the bits. */
function decodeField(field) {
  var parts = String(field || '').split(':');
  var b64 = parts.pop() || '';
  var alen = parseInt(parts.pop(), 10) || 0;
  var bits = [];
  try {
    var buf = zlib.inflateSync(Buffer.from(b64, 'base64'));
    for (var i = 0; i < buf.length * 8; i++) bits.push((buf[i >> 3] >> i % 8) & 1);
  } catch (e) {}
  return { anchor: parts.join(':'), alen: alen, bits: bits };
}

function orderedIds(videos) {
  function num(x) {
    var n = parseInt(x, 10);
    return isNaN(n) ? -Infinity : n;
  }
  var list = [];
  for (var i = 0; i < (videos || []).length; i++)
    if (videos[i] && videos[i].id) list.push({ v: videos[i], i: i });
  list.sort(function (a, b) {
    var sa = num(a.v.season),
      sb = num(b.v.season),
      ea = num(a.v.episode != null ? a.v.episode : a.v.number),
      eb = num(b.v.episode != null ? b.v.episode : b.v.number);
    if (sa !== sb) return sa < sb ? -1 : 1;
    if (ea !== eb) return ea < eb ? -1 : 1;
    return a.i - b.i;
  });
  return list.map(function (x) {
    return x.v.id;
  });
}

/* The field with `vid` marked watched (or unmarked), or '' when `vid` is not a video of
   the series. A field whose anchor is no longer in the list starts empty, as in core. */
function setWatched(field, videos, vid, watched) {
  var ids = orderedIds(videos),
    at = ids.indexOf(vid);
  if (at < 0) return '';
  var bits = [],
    i;
  for (i = 0; i < ids.length; i++) bits.push(0);
  if (field) {
    var old = decodeField(field),
      anchorAt = ids.indexOf(old.anchor);
    if (anchorAt >= 0) {
      var offset = old.alen - anchorAt - 1;
      for (i = 0; i < ids.length; i++) {
        var j = i + offset;
        if (j >= 0 && j < old.bits.length) bits[i] = old.bits[j];
      }
    }
  }
  bits[at] = watched === false ? 0 : 1;
  var bytes = Buffer.alloc(Math.ceil(ids.length / 8)),
    last = 0;
  for (i = 0; i < ids.length; i++)
    if (bits[i]) {
      bytes[i >> 3] |= 1 << i % 8;
      last = i;
    }
  return ids[last] + ':' + (last + 1) + ':' + zlib.deflateSync(bytes, { level: 6 }).toString('base64');
}

/* Episode lists of the series played recently, kept from /play so marking an episode
   watched at the end usually needs no second Cinemeta request. */
var videoCache = {},
  videoCacheKeys = [];
function rememberVideos(id, videos) {
  if (!id || !videos || !videos.length) return;
  if (!videoCache[id]) videoCacheKeys.push(id);
  videoCache[id] = videos;
  while (videoCacheKeys.length > 4) delete videoCache[videoCacheKeys.shift()];
}
function seriesVideos(id, cb) {
  if (videoCache[id]) return cb(videoCache[id]);
  fetchJson('https://v3-cinemeta.strem.io/meta/series/' + encodeURIComponent(id) + '.json', function (j) {
    var videos = j && j.meta && j.meta.videos;
    rememberVideos(id, videos);
    cb(videos || null);
  });
}

module.exports = {
  decodeField: decodeField,
  orderedIds: orderedIds,
  rememberVideos: rememberVideos,
  seriesVideos: seriesVideos,
  setWatched: setWatched
};
