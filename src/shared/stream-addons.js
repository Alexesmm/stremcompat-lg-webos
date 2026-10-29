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
/* The installed addons that answer `resource` ('stream', 'subtitles') for `type`, as Stremio
   picks them: the resource may be a name (manifest types apply) or an object with its own
   types and idPrefixes. With an `id`, idPrefixes are checked too (a subtitle addon for IMDb
   ids is not asked about a Kitsu episode). */
function addonsFor(a, resource, type, id) {
  var out = [];
  a = a || [];
  for (var i = 0; i < a.length; i++) {
    var m = a[i] && a[i].manifest;
    if (!m) continue;
    var res = m.resources || [],
      entry = null;
    for (var r = 0; r < res.length; r++) {
      var rr = res[r];
      if (rr === resource || (rr && rr.name === resource)) entry = rr;
    }
    if (!entry) continue;
    var types = m.types || [],
      own = typeof entry === 'object' ? entry.types || [] : null;
    /* the manifest types, or the resource object's own types; an object with no types
       means "any type" */
    if (types.length && types.indexOf(type) < 0 && !(own && (!own.length || own.indexOf(type) >= 0)))
      continue;
    var prefixes = (typeof entry === 'object' && entry.idPrefixes) || m.idPrefixes;
    if (id && prefixes && prefixes.length) {
      var okId = false;
      for (var p = 0; p < prefixes.length; p++) if (String(id).indexOf(prefixes[p]) === 0) okId = true;
      if (!okId) continue;
    }
    out.push({ name: m.name || 'Addon', base: addonBase(a[i]), query: addonQuery(a[i]) });
  }
  return out;
}
function streamAddonsIn(a, type) {
  return addonsFor(a, 'stream', type);
}
/* <base>/<resource>/<type>/<id>[/<extra>].json<query>, extra as Stremio encodes it:
   videoHash=..&videoSize=..&filename=.. */
function addonResourceUrl(ad, resource, type, id, extra) {
  var parts = [];
  for (var k in extra || {})
    if (Object.prototype.hasOwnProperty.call(extra, k) && extra[k] !== '' && extra[k] != null)
      parts.push(k + '=' + encodeURIComponent(extra[k]));
  return (
    ad.base +
    '/' +
    resource +
    '/' +
    type +
    '/' +
    encodeURIComponent(id) +
    (parts.length ? '/' + parts.join('&') : '') +
    '.json' +
    (ad.query || '')
  );
}
function streamUrl(ad, type, vid) {
  return addonResourceUrl(ad, 'stream', type, vid);
}
