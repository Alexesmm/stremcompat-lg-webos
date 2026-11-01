// /proxy: bytes of a video, fetched by this server for whoever cannot fetch them itself. The TV's
// player needs it for sources with headers, FFmpeg needs it because it only speaks plain HTTP
// here, and old browsers need it for current TLS. It honours Range, so both can seek.

var crypto = require('crypto');
var http = require('http');
var https = require('https');
var urlmod = require('url');
var { APP_VERSION, PORT } = require('./config');
var { getStreamRef } = require('./stream-refs');

var MAX_HOPS = 6;
var PLAYLIST_LIMIT = 2 * 1024 * 1024;
var IDLE_LIMIT_MS = 20000;
var LINK_REMEMBERED_MS = 120000;
var MAX_LINKS_REMEMBERED = 80;
var PASSED_ON = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];
var EXPIRED = { 403: true, 404: true, 410: true };

/* ---------- links inside a playlist, signed so they only work for that stream ---------- */
var signingKey = crypto.randomBytes(32);

function signature(ref, address) {
  var mac = crypto.createHmac('sha256', signingKey);
  mac.update(String(ref) + '\n' + String(address));
  return mac.digest('hex').slice(0, 32);
}

function localBase() {
  return 'http://127.0.0.1:' + PORT + '/proxy?';
}

function localProxy(address) {
  return localBase() + 'u=' + encodeURIComponent(address);
}

function linkInPlaylist(ref, base, written) {
  if (!written || /^data:/i.test(written)) return written;
  var address = urlmod.resolve(base, written);
  return (
    localBase() +
    'ref=' +
    encodeURIComponent(ref) +
    '&u=' +
    encodeURIComponent(address) +
    '&sig=' +
    signature(ref, address)
  );
}

function rewritePlaylist(text, base, ref) {
  return text
    .replace(/URI="([^"]+)"/g, function (all, written) {
      return 'URI="' + linkInPlaylist(ref, base, written) + '"';
    })
    .split(/\r?\n/)
    .map(function (line) {
      var content = line.trim();
      return !content || content.charAt(0) === '#' ? line : linkInPlaylist(ref, base, content);
    })
    .join('\n');
}

function looksLikePlaylist(address, upstream) {
  var type = String(upstream.headers['content-type'] || '').toLowerCase();
  return type.indexOf('mpegurl') >= 0 || /\.m3u8(?:$|\?)/i.test(address);
}

/* ---------- following a link ---------- */
/* debrid link -> the CDN link it led to, so a seek does not ask the debrid service again */
var remembered = {};

function remember(key, address) {
  if (Object.keys(remembered).length > MAX_LINKS_REMEMBERED) remembered = {};
  remembered[key] = { address: address, at: Date.now() };
}

/* credentials stay with the host they were given for */
function headersFor(from, to, headers) {
  if (!headers || urlmod.parse(from).hostname === urlmod.parse(to).hostname) return headers;
  var kept = Object.assign({}, headers);
  delete kept.Authorization;
  delete kept.Cookie;
  return kept;
}

function refuse(res, status) {
  try {
    if (!res.headersSent) res.writeHead(status);
    res.end();
  } catch (e) {}
}

function passedOnHeaders(upstream) {
  var out = {};
  PASSED_ON.forEach(function (name) {
    if (upstream.headers[name] != null) out[name] = upstream.headers[name];
  });
  return out;
}

function sendPlaylist(transfer, address, upstream) {
  var parts = [];
  var size = 0;
  var res = transfer.res;
  upstream.on('data', function (chunk) {
    size += chunk.length;
    if (size <= PLAYLIST_LIMIT) return parts.push(chunk);
    upstream.destroy();
    refuse(res, 502);
  });
  upstream.on('error', function () {
    refuse(res, 502);
  });
  upstream.on('end', function () {
    if (size > PLAYLIST_LIMIT) return;
    var text = rewritePlaylist(Buffer.concat(parts).toString('utf8'), address, transfer.ref);
    var body = Buffer.from(text, 'utf8');
    var headers = passedOnHeaders(upstream);
    delete headers['content-range'];
    headers['content-type'] = 'application/vnd.apple.mpegurl';
    headers['content-length'] = body.length;
    headers['accept-ranges'] = 'none';
    res.writeHead(upstream.statusCode, headers);
    res.end(body);
  });
}

function sendBytes(transfer, upstream) {
  var headers = passedOnHeaders(upstream);
  headers['accept-ranges'] = headers['accept-ranges'] || 'bytes';
  transfer.res.writeHead(upstream.statusCode, headers);
  upstream.on('error', function () {
    transfer.res.end();
  });
  /* cut short: closing lets the player ask again from where it stopped, instead of waiting */
  upstream.on('aborted', function () {
    transfer.res.destroy();
  });
  transfer.upstream = upstream;
  upstream.pipe(transfer.res);
}

function requestHeaders(transfer, custom) {
  var headers = {
    'User-Agent': 'StremCompat/' + APP_VERSION,
    'Accept': '*/*',
    'Accept-Encoding': 'identity'
  };
  Object.keys(custom || {}).forEach(function (name) {
    headers[name] = custom[name];
  });
  if (transfer.range) headers.Range = transfer.range;
  return headers;
}

function follow(transfer, address, custom, hops) {
  var target = urlmod.parse(String(address || ''));
  if (!address || hops > MAX_HOPS) return refuse(transfer.res, 502);
  if ((target.protocol !== 'http:' && target.protocol !== 'https:') || !target.hostname)
    return refuse(transfer.res, 400);

  var request = (target.protocol === 'https:' ? https : http).request(
    {
      hostname: target.hostname,
      port: target.port,
      path: target.path,
      method: transfer.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: requestHeaders(transfer, custom)
    },
    function (upstream) {
      var status = upstream.statusCode;
      if (status >= 300 && status < 400 && upstream.headers.location) {
        upstream.resume();
        var next = urlmod.resolve(address, upstream.headers.location);
        return follow(transfer, next, headersFor(address, next, custom), hops + 1);
      }
      /* a remembered CDN link probably expired: the original link gives a new one, once */
      if (EXPIRED[status] && address !== transfer.original && !transfer.startedOver) {
        upstream.resume();
        transfer.startedOver = true;
        delete remembered[transfer.key];
        return follow(transfer, transfer.original, transfer.originalHeaders, 0);
      }
      remember(transfer.key, address);
      if (transfer.ref && transfer.method !== 'HEAD' && looksLikePlaylist(address, upstream)) {
        return sendPlaylist(transfer, address, upstream);
      }
      sendBytes(transfer, upstream);
    }
  );
  request.on('error', function () {
    refuse(transfer.res, 502);
  });
  /* a paused player stops reading, so the connection goes quiet without the source being stuck */
  request.setTimeout(IDLE_LIMIT_MS, function () {
    if (transfer.upstream && transfer.upstream.isPaused()) return;
    request.abort();
  });
  /* FFmpeg drops the connection on every seek */
  transfer.res.on('close', function () {
    request.abort();
  });
  request.end();
}

function handleProxy(query, req, res) {
  var stream = getStreamRef(query.ref || '');
  var signed = stream && query.u && query.sig === signature(query.ref, query.u) ? String(query.u) : '';
  var original = signed || (stream ? stream.url : query.u || '');
  var headers = stream ? headersFor(stream.url, original, stream.headers) : null;
  var transfer = {
    res: res,
    range: req.headers.range,
    method: req.method,
    ref: stream ? String(query.ref) : '',
    key: stream ? 'ref:' + query.ref + ':' + original : original,
    original: original,
    originalHeaders: headers,
    startedOver: false
  };
  var known = remembered[transfer.key];
  var fresh = known && Date.now() - known.at < LINK_REMEMBERED_MS;
  if (fresh) follow(transfer, known.address, headersFor(original, known.address, headers), 0);
  else follow(transfer, original, headers, 0);
}

module.exports = {
  handleProxy: handleProxy,
  localProxy: localProxy
};
