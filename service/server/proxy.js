// Stream byte proxy with signed HLS rewriting, redirect handling and header forwarding.

var crypto = require('crypto');
var http = require('http');
var https = require('https');
var urlmod = require('url');
var { APP_VERSION, PORT } = require('./config');

var proxySecret = crypto.randomBytes(32);

function proxySignature(ref, target) {
  return crypto
    .createHmac('sha256', proxySecret)
    .update(String(ref) + '\n' + String(target))
    .digest('hex')
    .slice(0, 32);
}

function signedProxyUrl(ref, target) {
  return (
    'http://127.0.0.1:' +
    PORT +
    '/proxy?ref=' +
    encodeURIComponent(ref) +
    '&u=' +
    encodeURIComponent(target) +
    '&sig=' +
    proxySignature(ref, target)
  );
}

function rewriteHls(body, baseUrl, ref) {
  function link(raw) {
    if (!raw || /^data:/i.test(raw)) return raw;
    var absolute;
    try {
      absolute = urlmod.resolve(baseUrl, raw);
    } catch (e) {
      return raw;
    }
    return signedProxyUrl(ref, absolute);
  }
  return String(body)
    .replace(/URI="([^"]+)"/g, function (all, u) {
      return 'URI="' + link(u) + '"';
    })
    .split(/\r?\n/)
    .map(function (line) {
      var clean = line.trim();
      return clean && clean.charAt(0) !== '#' ? link(clean) : line;
    })
    .join('\n');
}

// ---- byte proxy for ffmpeg ----
// The bundled ffmpeg/ffprobe are statically linked against glibc, so getaddrinfo
// can't load libnss_dns and EVERY hostname fails ("Name or service not known").
// So ffmpeg never touches the network directly: it talks plain HTTP to us on
// 127.0.0.1 and node (which resolves DNS fine) does the real HTTPS fetch, follows
// debrid redirects, and streams the bytes back, honouring Range so ffmpeg can seek.
function localProxy(u) {
  return 'http://127.0.0.1:' + PORT + '/proxy?u=' + encodeURIComponent(u);
}

var resolveCache = {};

// original debrid url -> { url: resolved-CDN-url, at: ts }
function redirectedHeaders(fromUrl, toUrl, headers) {
  var out = headers || {};
  try {
    if (urlmod.parse(fromUrl).hostname !== urlmod.parse(toUrl).hostname) {
      out = Object.assign({}, out);
      delete out.Authorization;
      delete out.Cookie;
    }
  } catch (e) {}
  return out;
}

function proxyStream(
  target,
  range,
  method,
  clientRes,
  orig,
  depth,
  triedFresh,
  customHeaders,
  cacheKey,
  originalHeaders,
  refId
) {
  depth = depth || 0;
  originalHeaders = originalHeaders || customHeaders || {};
  if (!target || depth > 6) {
    try {
      if (!clientRes.headersSent) clientRes.writeHead(502);
      clientRes.end();
    } catch (e) {}
    return;
  }
  var pu;
  try {
    pu = urlmod.parse(target);
  } catch (e) {
    try {
      clientRes.writeHead(502);
      clientRes.end();
    } catch (x) {}
    return;
  }
  if ((pu.protocol !== 'http:' && pu.protocol !== 'https:') || !pu.hostname) {
    try {
      clientRes.writeHead(400);
      clientRes.end();
    } catch (x) {}
    return;
  }
  var lib = pu.protocol === 'https:' ? https : http;
  var hdrs = { 'User-Agent': 'Stremio-TV/' + APP_VERSION, 'Accept': '*/*', 'Accept-Encoding': 'identity' };
  Object.keys(customHeaders || {}).forEach(function (k) {
    hdrs[k] = customHeaders[k];
  });
  if (range) hdrs.Range = range;
  var opts = {
    protocol: pu.protocol,
    hostname: pu.hostname,
    port: pu.port,
    path: pu.path,
    method: method === 'HEAD' ? 'HEAD' : 'GET',
    headers: hdrs
  };
  var upReq;
  try {
    upReq = lib.request(opts, onUp);
  } catch (e) {
    try {
      clientRes.writeHead(502);
      clientRes.end();
    } catch (x) {}
    return;
  }
  function onUp(up) {
    var sc = up.statusCode;
    if (sc >= 300 && sc < 400 && up.headers.location) {
      up.resume();
      var loc = up.headers.location;
      if (loc.indexOf('http') !== 0)
        loc = pu.protocol + '//' + pu.host + (loc.charAt(0) === '/' ? '' : '/') + loc;
      var nextHeaders = redirectedHeaders(target, loc, customHeaders);
      return proxyStream(
        loc,
        range,
        method,
        clientRes,
        orig,
        depth + 1,
        triedFresh,
        nextHeaders,
        cacheKey,
        originalHeaders,
        refId
      );
    }
    // A cached signed CDN url likely expired — restart from the original once.
    if ((sc === 403 || sc === 410 || sc === 404) && !triedFresh && target !== orig) {
      up.resume();
      delete resolveCache[cacheKey || orig];
      return proxyStream(
        orig,
        range,
        method,
        clientRes,
        orig,
        0,
        true,
        originalHeaders,
        cacheKey,
        originalHeaders,
        refId
      );
    }
    if (orig) {
      if (Object.keys(resolveCache).length > 80) resolveCache = {};
      resolveCache[cacheKey || orig] = { url: target, at: Date.now() };
    } // remember the working CDN url
    var h = {};
    ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'].forEach(
      function (k) {
        if (up.headers[k] != null) h[k] = up.headers[k];
      }
    );
    var isHls =
      refId &&
      method !== 'HEAD' &&
      (String(up.headers['content-type'] || '')
        .toLowerCase()
        .indexOf('mpegurl') >= 0 ||
        /\.m3u8(?:$|\?)/i.test(target));
    if (isHls) {
      var playlist = [],
        playlistBytes = 0,
        playlistDone = false;
      function failPlaylist() {
        if (playlistDone) return;
        playlistDone = true;
        try {
          if (!clientRes.headersSent) clientRes.writeHead(502);
          clientRes.end();
        } catch (e) {}
      }
      up.on('data', function (d) {
        playlistBytes += d.length;
        if (playlistBytes > 2 * 1024 * 1024) {
          try {
            up.destroy();
          } catch (e) {}
          failPlaylist();
        } else playlist.push(d);
      });
      up.on('end', function () {
        if (playlistDone) return;
        playlistDone = true;
        var rewritten = Buffer.from(
          rewriteHls(Buffer.concat(playlist).toString('utf8'), target, refId),
          'utf8'
        );
        h['content-type'] = 'application/vnd.apple.mpegurl';
        h['content-length'] = rewritten.length;
        delete h['content-range'];
        h['accept-ranges'] = 'none';
        try {
          clientRes.writeHead(sc, h);
          clientRes.end(rewritten);
        } catch (e) {}
      });
      up.on('error', failPlaylist);
      return;
    }
    if (!h['accept-ranges']) h['accept-ranges'] = 'bytes';
    try {
      clientRes.writeHead(sc, h);
    } catch (e) {
      try {
        up.destroy();
      } catch (x) {}
      return;
    }
    up.pipe(clientRes);
    up.on('error', function () {
      try {
        clientRes.end();
      } catch (e) {}
    });
  }
  upReq.on('error', function () {
    try {
      if (!clientRes.headersSent) clientRes.writeHead(502);
      clientRes.end();
    } catch (x) {}
  });
  upReq.setTimeout(20000, function () {
    try {
      upReq.abort();
    } catch (e) {}
  });
  clientRes.on('close', function () {
    try {
      upReq.abort();
    } catch (e) {}
  }); // ffmpeg drops the connection on every seek
  upReq.end();
}

// resolveCache is replaced when it grows; read it through this accessor.
function resolvedFor(key) {
  return resolveCache[key];
}

module.exports = {
  localProxy: localProxy,
  proxySignature: proxySignature,
  proxyStream: proxyStream,
  redirectedHeaders: redirectedHeaders,
  resolvedFor: resolvedFor
};
