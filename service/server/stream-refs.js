// Opaque stream references that keep provider URLs and headers out of the browser.

var crypto = require('crypto');
var { safeText } = require('./text');

// Stream references keep provider cookies/auth headers out of URLs and browser
// storage. Only a short opaque id crosses the webview boundary.
var streamRefs = {};

var streamRefOrder = [];

function safeProxyHeaders(raw) {
  var out = {},
    allow = {
      'user-agent': 'User-Agent',
      'referer': 'Referer',
      'origin': 'Origin',
      'cookie': 'Cookie',
      'authorization': 'Authorization',
      'accept': 'Accept',
      'accept-language': 'Accept-Language'
    };
  if (!raw || typeof raw !== 'object') return out;
  Object.keys(raw).forEach(function (key) {
    var lk = String(key).toLowerCase(),
      name = allow[lk];
    if (!name) return;
    var value = safeText(raw[key], 2048);
    if (value) out[name] = value;
  });
  return out;
}

function storeStreamRef(raw) {
  raw = raw || {};
  var streamUrl = safeText(raw.url, 8192);
  if (!/^https?:\/\//i.test(streamUrl)) return '';
  var ref = crypto.randomBytes(12).toString('hex');
  streamRefs[ref] = {
    url: streamUrl,
    addon: safeText(raw.addon, 160),
    name: safeText(raw.name, 300),
    title: safeText(raw.title, 700),
    description: safeText(raw.description, 700),
    behaviorHints: { filename: safeText(raw.filename, 500) },
    quality: safeText(raw.quality, 40),
    compat: safeText(raw.compat, 160),
    headers: safeProxyHeaders(raw.headers),
    notWebReady: !!raw.notWebReady,
    at: Date.now()
  };
  streamRefOrder.push(ref);
  while (streamRefOrder.length > 40) delete streamRefs[streamRefOrder.shift()];
  return ref;
}

function getStreamRef(ref) {
  ref = String(ref || '');
  var s = streamRefs[ref];
  if (!s || Date.now() - s.at > 12 * 3600 * 1000) return null;
  s.at = Date.now();
  var at = streamRefOrder.indexOf(ref);
  if (at >= 0) streamRefOrder.splice(at, 1);
  streamRefOrder.push(ref);
  return s;
}

module.exports = {
  getStreamRef: getStreamRef,
  storeStreamRef: storeStreamRef
};
