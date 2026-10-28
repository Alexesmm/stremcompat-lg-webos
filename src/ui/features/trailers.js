// Trailer resolution (via /yt) and the trailer player.
/* ================= trailers (server /yt resolves a direct mp4) ================= */
function ytPlay(t, backHash) {
  toast(tx('loadingTrailer'));
  xhrJson(
    '/yt?v=' + encodeURIComponent(t),
    function (j) {
      if (j && j.url) playUrl(j.url, 'other', '', '', backHash);
      else toast(tx('trailerUnavailable'));
    },
    14000
  );
}
function trailerIdOf(m) {
  var t = null;
  if (m) {
    if (m.trailers && m.trailers.length) t = m.trailers[0].source;
    if (!t && m.trailerStreams && m.trailerStreams.length) t = m.trailerStreams[0].ytId;
  }
  return t;
}
function trailerFor(type, id, backHash) {
  getMeta(type, id, function (m) {
    var t = trailerIdOf(m);
    if (!t) {
      toast(tx('noTrailer'));
      return;
    }
    ytPlay(t, backHash || 'beta');
  });
}
