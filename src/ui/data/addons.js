// Account addon collection.
/* addons: silent pull from the account at every boot (no buttons needed) */
function addons() {
  return lsJson('addons') || [];
}
/* The addons asked for catalogs, metadata and sources: all but Local files, which the
   streaming server serves for a computer's own video folders. The TV has none, so asking
   it only costs requests and "did not answer" entries in Diagnostics. */
function remoteAddons() {
  var all = addons(),
    out = [];
  for (var i = 0; i < all.length; i++)
    if (
      !/^https?:\/\/(?:127\.0\.0\.1|localhost):11470\//i.test(String((all[i] && all[i].transportUrl) || ''))
    )
      out.push(all[i]);
  return out;
}
function syncAddons(cb) {
  var ak = authKey();
  if (!ak) {
    if (cb) cb(false);
    return;
  }
  postJson(API + '/api/addonCollectionGet', { authKey: ak, update: true }, function (r) {
    var got = r && r.result && r.result.addons;
    if (!got || !got.length) {
      if (cb) cb(false);
      return;
    }
    var cur = '';
    try {
      cur = localStorage.getItem('addons') || '';
    } catch (e) {}
    var next = JSON.stringify(got);
    if (next !== cur) {
      lsRawSet('addons', next);
      lsRawSet('addonsLastModified', String(Date.now()));
      if (cb) cb(true);
    } else if (cb) cb(false);
  });
}
