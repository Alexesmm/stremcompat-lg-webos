// Which installed addons answer stream requests; shared by the interface and the player.
function addonBase(a) {
  return String(a.transportUrl || '').replace(/\/manifest\.json.*$/, '');
}
/* Whatever follows /manifest.json in the installed link (a ?key=... some addons give each
   user). Official Stremio replaces only /manifest.json when it builds a request, so the
   query string reaches every catalog, meta and stream request (stremio-core
   http_transport.rs); dropping it made such addons answer nothing here. */
function addonQuery(a) {
  var m = String((a && a.transportUrl) || '').match(/\/manifest\.json(\?[^#]*)/);
  return m ? m[1] : '';
}
function streamAddonsIn(a, type) {
  var out = [];
  a = a || [];
  for (var i = 0; i < a.length; i++) {
    var m = a[i] && a[i].manifest;
    if (!m) continue;
    var res = m.resources || [],
      okRes = false;
    for (var r = 0; r < res.length; r++) {
      var rr = res[r];
      if (rr === 'stream' || (rr && rr.name === 'stream')) okRes = true;
    }
    if (!okRes) continue;
    var types = m.types || [];
    if (types.length && types.indexOf(type) < 0) {
      /* a stream resource OBJECT with no explicit types means "any type" — don't skip it */
      var allow = false;
      for (var r2 = 0; r2 < res.length; r2++) {
        var rr2 = res[r2];
        if (rr2 && rr2.name === 'stream') {
          if (!rr2.types || !rr2.types.length || rr2.types.indexOf(type) >= 0) allow = true;
        }
      }
      if (!allow) continue;
    }
    out.push({ name: m.name || 'Addon', base: addonBase(a[i]), query: addonQuery(a[i]) });
  }
  return out;
}
function streamUrl(ad, type, vid) {
  return ad.base + '/stream/' + type + '/' + encodeURIComponent(vid) + '.json' + (ad.query || '');
}
