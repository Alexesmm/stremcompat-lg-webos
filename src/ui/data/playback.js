// Opening the player and remembering source preferences for the next episode.
/* ================= playback ================= */
function playUrl(source, type, id, vid, backHash) {
  var s = typeof source === 'string' ? { url: source } : source;
  if (!s || !s.url) return;
  clientDiag('source_selected', {
    quality: s.quality || '',
    compat: (s.compatLabels || []).join(','),
    seeders: s.seeders == null ? '' : s.seeders
  });
  var tail =
    '&type=' +
    encodeURIComponent(type) +
    '&id=' +
    encodeURIComponent(id) +
    '&vid=' +
    encodeURIComponent(vid) +
    '&back=' +
    encodeURIComponent(backHash);
  /* Keep signed cookies/authorization out of browser history and localStorage. The
     Node service stores a small, sanitized stream reference and returns only its id. */
  var body = {
    url: s.url,
    addon: s.addon || '',
    name: s.name || '',
    title: s.title || '',
    filename: s.filename || '',
    quality: s.quality || '',
    compat: (s.compatLabels || []).join(','),
    notWebReady: !!s.notWebReady,
    headers: s.headers || null
  };
  function prepare(attempt) {
    postJson(
      '/streamref',
      body,
      function (j) {
        if (j && j.ref) {
          location.assign('/play?ref=' + encodeURIComponent(j.ref) + tail);
          return;
        }
        if (attempt < 2) {
          setTimeout(function () {
            prepare(attempt + 1);
          }, 180);
          return;
        }
        clientDiag('streamref_failed', { quality: s.quality || '' });
        toast(tx('sourcePrepareFailed'));
      },
      attempt === 1 ? 2500 : 4500
    );
  }
  prepare(1);
}
function resumeSearch(id, vid) {
  var q = null;
  try {
    q = localStorage.getItem('tvstream_' + id + '_' + vid);
  } catch (e) {}
  return q;
}
function playStored(q, backHash) {
  q = q.replace(/&back=[^&]*/, '');
  location.assign('/play' + q + '&back=' + encodeURIComponent(backHash));
}
function hasNextSourcePreference(id, vid) {
  try {
    return !!localStorage.getItem('tvnextpref_' + id + '_' + vid);
  } catch (e) {
    return false;
  }
}
function takeNextSourcePreference(id, vid) {
  var key = 'tvnextpref_' + id + '_' + vid,
    raw = null,
    pref = null;
  try {
    raw = localStorage.getItem(key);
    localStorage.removeItem(key);
  } catch (e) {}
  if (!raw) return null;
  try {
    pref = JSON.parse(raw);
  } catch (e2) {
    return null;
  }
  if (!pref || !pref.at || Date.now() - pref.at > 10 * 60 * 1000) return null;
  return pref;
}
function sourceTraits(value) {
  var t = String(value || '').toLowerCase(),
    out = [];
  var tests = [
    ['hevc', /\b(hevc|x265|h[ ._-]?265)\b/],
    ['h264', /\b(x264|h[ ._-]?264|avc)\b/],
    ['dv', /(dolby[ ._-]?vision|\bdovi\b|\bdv\b)/],
    ['hdr10p', /hdr10\+/],
    ['hdr', /\bhdr\b/],
    ['10bit', /\b(10[ ._-]?bit|main[ ._-]?10)\b/],
    ['eac3', /\b(eac3|e[ ._-]?ac[ ._-]?3|ddp|dd\+)\b/],
    ['ac3', /\b(ac3|dolby[ ._-]?digital)\b/],
    ['aac', /\baac\b/],
    ['dts', /\bdts\b/],
    ['atmos', /\batmos\b/],
    ['webdl', /web[ ._-]?dl/],
    ['bluray', /blu[ ._-]?ray|bdrip/]
  ];
  for (var i = 0; i < tests.length; i++) if (tests[i][1].test(t)) out.push(tests[i][0]);
  return out;
}
function matchingNextSource(items, pref) {
  if (!pref || !pref.addon || !pref.quality) return null;
  var wanted = sourceTraits((pref.text || '') + ' ' + (pref.compat || '')),
    best = null,
    bestScore = -9999;
  for (var i = 0; i < items.length; i++) {
    var s = items[i];
    if (s.stored || s.addon !== pref.addon || s.quality !== pref.quality) continue;
    var traits = sourceTraits(streamText(s) + ' ' + (s.compatLabels || []).join(' ')),
      score = 0;
    for (var w = 0; w < wanted.length; w++) if (traits.indexOf(wanted[w]) >= 0) score += 12;
    score -= (s.compatRank || 0) * 20;
    if (s.seeders > 0) score += Math.min(15, Math.floor(Math.log(s.seeders + 1) / Math.LN2));
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}
window.__STREMIO_MATCH_NEXT_SOURCE__ = matchingNextSource;
