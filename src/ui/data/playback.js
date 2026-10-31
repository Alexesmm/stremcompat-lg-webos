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
  var body = streamRefBody(s);
  function prepare(attempt) {
    postJson(
      '/streamref',
      body,
      function (j) {
        if (j && j.ref) {
          location.assign(appUrl('/play?ref=' + encodeURIComponent(j.ref) + tail));
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
  /* a torrent needs the streaming server, which is downloaded from Stremio on first use */
  if (/^https?:\/\/(?:127\.0\.0\.1|localhost):11470\//i.test(s.url))
    xhrJson(
      '/streamfile',
      function (j) {
        if (j && j.state === 'downloading') toast(tx('preparingTorrents'));
        else if (j && j.state === 'failed') toast(tx('torrentsUnavailable'));
      },
      2000
    );
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
  location.assign(appUrl('/play' + q + '&back=' + encodeURIComponent(backHash)));
}
/* Left by the player when a source would not play (player controls.js): the title page
   reopens the sources and plays the next one, skipping the failed source. */
function retryKey(id, vid) {
  return 'tvretry_' + id + '_' + vid;
}
function hasRetryRequest(id, vid) {
  return !!lsRaw(retryKey(id, vid), '');
}
function takeRetryRequest(id, vid) {
  var pref = lsJson(retryKey(id, vid));
  try {
    localStorage.removeItem(retryKey(id, vid));
  } catch (e) {}
  return pref && pref.at && Date.now() - pref.at < 10 * 60 * 1000 ? pref : null;
}
/* the first source in list order that is not the one that failed */
function nextSourceAfterFailure(items, pref) {
  for (var i = 0; i < items.length; i++) {
    var s = items[i];
    if (s.stored) continue;
    if (s.addon === pref.addon && String((s.name || '') + ' ' + (s.title || '')).slice(0, 400) === pref.text)
      continue;
    return s;
  }
  return null;
}
window.__STREMIO_NEXT_AFTER_FAILURE__ = nextSourceAfterFailure;
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
window.__STREMIO_MATCH_NEXT_SOURCE__ = matchingNextSource;
