// External subtitles from the account's subtitle addons, asked as the official apps ask them.

var { fetchAddonJson, fetchJson } = require('./http-util');
var { getStreamRef } = require('./stream-refs');
var { langName } = require('./subtitles');
var { SERVER_PORT } = require('./config');

var PER_LANGUAGE = 12;
var ADDON_TIMEOUT_MS = 8000;
var HASH_TIMEOUT_MS = 5000;

/* callback once, with null after `ms` */
function within(ms, start, cb) {
  var done = false;
  var t = setTimeout(function () {
    if (done) return;
    done = true;
    cb(null);
  }, ms);
  start(function (v) {
    if (done) return;
    done = true;
    clearTimeout(t);
    cb(v);
  });
}

/* <base>/subtitles/<type>/<id>/<extra>.json<query>, extra as Stremio encodes it */
function subtitlesUrl(ad, type, id, extra) {
  var parts = [];
  ['videoHash', 'videoSize', 'filename'].forEach(function (k) {
    if (extra[k]) parts.push(k + '=' + encodeURIComponent(extra[k]));
  });
  return (
    String(ad.base || '') +
    '/subtitles/' +
    encodeURIComponent(type) +
    '/' +
    encodeURIComponent(id) +
    (parts.length ? '/' + parts.join('&') : '') +
    '.json' +
    String(ad.query || '')
  );
}

/* The OpenSubtitles hash and size of a torrent video, from the bundled streaming server,
   so subtitle addons can answer with subtitles synced to this exact file. */
function videoExtra(ref, cb) {
  var stream = ref ? getStreamRef(ref) : null,
    extra = {};
  if (!stream) return cb(extra);
  var fn = stream.behaviorHints && stream.behaviorHints.filename;
  if (fn) extra.filename = fn;
  if (!/^https?:\/\/(?:127\.0\.0\.1|localhost):11470\//i.test(stream.url || '')) return cb(extra);
  within(
    HASH_TIMEOUT_MS,
    function (done) {
      fetchJson(
        'http://127.0.0.1:' + SERVER_PORT + '/opensubHash?videoUrl=' + encodeURIComponent(stream.url),
        done
      );
    },
    function (j) {
      var r = j && j.result;
      if (r && r.hash) {
        extra.videoHash = String(r.hash);
        if (r.size) extra.videoSize = String(r.size);
      }
      cb(extra);
    }
  );
}

/* one list, ordered English first then by language name, at most PER_LANGUAGE per language;
   each entry keeps the addon it came from for the menu */
function mergeSubtitles(answers) {
  var out = [],
    per = {},
    seenUrl = {};
  answers.forEach(function (answer) {
    var subs = (answer.json && answer.json.subtitles) || [];
    for (var i = 0; i < subs.length; i++) {
      var lang = String(subs[i].lang || '').toLowerCase(),
        u = subs[i].url;
      if (!lang || !u || seenUrl[u]) continue;
      seenUrl[u] = 1;
      per[lang] = (per[lang] || 0) + 1;
      if (per[lang] > PER_LANGUAGE) continue;
      out.push({ lang: lang, name: langName(lang), src: answer.name || '', u: u, n: per[lang] });
    }
  });
  out.sort(function (a, b) {
    if (a.lang === 'eng' && b.lang !== 'eng') return -1;
    if (b.lang === 'eng' && a.lang !== 'eng') return 1;
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return a.n - b.n;
  });
  return out;
}

/* Results per video and stream for this session: reopening the menu or the same episode
   asks nobody again. */
var cache = {},
  cacheKeys = [];
function remember(key, value) {
  if (!cache[key]) cacheKeys.push(key);
  cache[key] = value;
  while (cacheKeys.length > 12) delete cache[cacheKeys.shift()];
}

/* body: { ref, type, vid, addons: [{ name, base, query }] }. Without subtitle addons on the
   account, the public OpenSubtitles addon answers, as before. */
function addonSubtitles(body, cb) {
  body = body || {};
  var type = String(body.type || 'movie'),
    vid = String(body.vid || ''),
    list = Array.isArray(body.addons) ? body.addons.slice(0, 8) : [];
  if (!vid) return cb([]);
  if (!list.length) list = [{ name: 'OpenSubtitles', base: 'https://opensubtitles-v3.strem.io', query: '' }];
  var key =
    type +
    '|' +
    vid +
    '|' +
    String(body.ref || '') +
    '|' +
    list
      .map(function (a) {
        return a.base + (a.query || '');
      })
      .join(',');
  if (cache[key]) return cb(cache[key]);
  videoExtra(String(body.ref || ''), function (extra) {
    var answers = [],
      left = list.length;
    list.forEach(function (ad) {
      within(
        ADDON_TIMEOUT_MS,
        function (done) {
          fetchAddonJson(subtitlesUrl(ad, type, vid, extra), done);
        },
        function (json) {
          answers.push({ name: String(ad.name || ''), json: json, order: list.indexOf(ad) });
          if (--left) return;
          answers.sort(function (a, b) {
            return a.order - b.order;
          });
          var merged = mergeSubtitles(answers);
          if (merged.length) remember(key, merged);
          cb(merged);
        }
      );
    });
  });
}

module.exports = {
  addonSubtitles: addonSubtitles,
  mergeSubtitles: mergeSubtitles,
  subtitlesUrl: subtitlesUrl
};
