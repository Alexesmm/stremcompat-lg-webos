// HTTP routing for the local compatibility server.

var urlmod = require('url');
var zlib = require('zlib');
var { APP_VERSION, PORT } = require('./config');
var { dbg } = require('./log');
var { EMBEDDED_BETA_APP_B64, EMBEDDED_BETA_HTML_B64 } = require('./embedded');
var { safeText } = require('./text');
var { fetchJson, fetchUrl, readJsonBody, sendJson } = require('./http-util');
var { fontFile, logoPng, readUiAsset, renderInterfaceHtml } = require('./ui-assets');
var { waitForServer } = require('./streaming-server');
var { getStreamRef, storeStreamRef } = require('./stream-refs');
var { proxySignature, proxyStream, redirectedHeaders, resolvedFor } = require('./proxy');
var { playerPage } = require('./player-page');
var { embCues, embStart, embTracks, langName, parseSrt } = require('./subtitles');
var { postStremioApi } = require('./stremio-api');
var { ytResolve } = require('./youtube');
var { grabFrame, probeInfo, spriteGen } = require('./media');
var { bgResize } = require('./images');
var { nextEpisodeId } = require('./episodes');
var { diagnostics } = require('./diag');
var { cachedAddonJson } = require('./addon-cache');

// Routes every request of the local compatibility server.
function handleRequest(req, res) {
  var p = req.url.split('?')[0];
  var q = urlmod.parse(req.url, true).query;
  if (p === '/health') {
    var hm = process.memoryUsage();
    sendJson(res, {
      ok: true,
      version: APP_VERSION,
      port: PORT,
      runtime: process.version,
      memory: { rssMiB: Math.round(hm.rss / 1048576), heapMiB: Math.round(hm.heapUsed / 1048576) }
    });
  } else if (p === '/diag') {
    diagnostics(res);
  } else if (p === '/ping') {
    // Instant readiness probe for the app launcher — proves the app port is bound so it can
    // redirect here instead of guessing on a timer (which races a cold node start).
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end('ok');
  } else if (p === '/stremioapi' && req.method === 'POST') {
    postStremioApi(String(q.path || ''), req, res);
  } else if (p === '/streamref' && req.method === 'POST') {
    readJsonBody(req, 16384, function (body) {
      var ref = body && storeStreamRef(body);
      sendJson(res, ref ? { ref: ref } : { error: 'invalid_stream' });
    });
  } else if (p === '/addon') {
    cachedAddonJson(q.u || '', function (j) {
      if (!j) {
        res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end('{"error":"addon_unavailable"}');
      } else sendJson(res, j);
    });
  } else if (p === '/log') {
    var allowedLog = [
      'ev',
      'screen',
      'quality',
      'compat',
      'seeders',
      'code',
      'ready',
      'network',
      't',
      'playing',
      'awaySec',
      'tries',
      'reason'
    ];
    var entry = {},
      lm = process.memoryUsage();
    allowedLog.forEach(function (key) {
      if (q[key] != null) entry[key] = safeText(q[key], 160);
    });
    entry.rssMiB = Math.round(lm.rss / 1048576);
    entry.heapMiB = Math.round(lm.heapUsed / 1048576);
    dbg('[clientlog] ' + JSON.stringify(entry));
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end('ok');
  } else if (p === '/' || p === '/index.html') {
    res.writeHead(302, { Location: '/beta?v=' + APP_VERSION });
    res.end();
  } else if (p === '/beta') {
    // The television interface — a real file on disk, with an embedded fallback copy.
    // Read per-request: tiny file, always fresh after an scp, no restart needed.
    // NO waitForServer here: the interface doesn't need :11470 at boot
    // (only torrent playback does, and server.js starts in parallel) — faster cold start.
    readUiAsset('beta.html', EMBEDDED_BETA_HTML_B64, function (err, buf) {
      if (err) {
        dbg('[ui] beta.html failed: ' + err.message);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('UJ3_ASSET HTML ' + err.message);
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0'
      });
      res.end(renderInterfaceHtml(buf));
    });
  } else if (p === '/beta-app.js') {
    readUiAsset('beta-app.js', EMBEDDED_BETA_APP_B64, function (err, buf) {
      if (err) {
        dbg('[ui] beta-app.js failed: ' + err.message);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('UJ3_ASSET SCRIPT ' + err.message);
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0'
      });
      res.end(buf);
    });
  } else if (p === '/play') {
    var stream = getStreamRef(q.ref || '');
    if (!stream && q.u) stream = { url: q.u }; // direct URL fallback: the interface passes the stream URL directly
    if (!stream || !stream.url) {
      if (q.ref && q.back) {
        res.writeHead(302, {
          Location: 'http://127.0.0.1:' + PORT + '/' + String(q.back).replace(/^\/+/, '')
        });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<body style="background:#000;color:#fff;font-family:sans-serif;text-align:center;padding-top:40vh">Could not read stream. <a style="color:#8c5cff" href="/beta">Back</a></body>'
      );
      return;
    }
    var ctx = {
      type: q.type || '',
      id: q.id || '',
      vid: q.vid || '',
      back: q.back || '',
      streamRef: q.ref || '',
      meta: null
    };
    var playerSent = false;
    function sendPlayer() {
      if (playerSent) return;
      playerSent = true;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(playerPage(stream, ctx));
    }
    function servePlayer() {
      /* Torrent addon URLs point at the bundled Stremio server. The local UI now
         starts much faster than the old remote shell, so the first selected source
         can beat :11470 on a cold boot. Wait only for those sources; direct/debrid
         URLs still open immediately. */
      if (/^https?:\/\/(?:127\.0\.0\.1|localhost):11470\//i.test(stream.url || '')) {
        waitForServer(function (ready) {
          ctx.streamServerReady = ready;
          sendPlayer();
        });
      } else sendPlayer();
    }
    // Fetch artwork server-side so the loading screen shows the logo/backdrop
    // immediately (no plain-text flash). Short timeout; falls back to text.
    if (ctx.type && ctx.id) {
      var settled = false;
      fetchJson(
        'https://v3-cinemeta.strem.io/meta/' +
          encodeURIComponent(ctx.type) +
          '/' +
          encodeURIComponent(ctx.id) +
          '.json',
        function (j) {
          if (settled) return;
          settled = true;
          var m = (j && j.meta) || {};
          ctx.meta = {
            name: m.name || '',
            logo: m.logo || '',
            background: m.background || m.poster || '',
            poster: m.poster || '',
            cert: m.certification || ''
          };
          // Series: pull season/episode + episode title, and compute the next episode id.
          var vid = ctx.vid || '';
          if (vid.indexOf(':') >= 0) {
            var pp = vid.split(':');
            ctx.episode = pp[pp.length - 1];
            ctx.season = pp[pp.length - 2];
            ctx.nextVid = nextEpisodeId(m.videos, vid);
            if (m.videos) {
              for (var i = 0; i < m.videos.length; i++) {
                var mv = m.videos[i];
                if (mv.id === vid) ctx.epTitle = mv.name || mv.title || '';
                if (mv.id === ctx.nextVid) {
                  ctx.nextTitle = mv.name || mv.title || '';
                  ctx.nextThumb = mv.thumbnail || '';
                }
              }
            }
          }
          servePlayer();
        }
      );
      setTimeout(function () {
        if (!settled) {
          settled = true;
          servePlayer();
        }
      }, 2500);
    } else {
      servePlayer();
    }
  } else if (p === '/meta') {
    fetchJson(
      'https://v3-cinemeta.strem.io/meta/' +
        encodeURIComponent(q.type || 'movie') +
        '/' +
        encodeURIComponent(q.id || '') +
        '.json',
      function (j) {
        var meta = (j && j.meta) || {};
        sendJson(res, {
          name: meta.name || '',
          poster: (meta.poster || '').replace('/small/', '/medium/'),
          background: meta.background || meta.poster || '',
          logo: meta.logo || ''
        });
      }
    );
  } else if (p === '/subs') {
    fetchJson(
      'https://opensubtitles-v3.strem.io/subtitles/' +
        encodeURIComponent(q.type || 'movie') +
        '/' +
        encodeURIComponent(q.vid || '') +
        '.json',
      function (j) {
        var subs = (j && j.subtitles) || [],
          out = [],
          per = {};
        for (var i = 0; i < subs.length; i++) {
          var lang = (subs[i].lang || '').toLowerCase();
          if (!lang || !subs[i].url) continue;
          per[lang] = (per[lang] || 0) + 1;
          if (per[lang] > 12) continue; // cap per language
          out.push({ lang: lang, name: langName(lang), u: subs[i].url, n: per[lang] });
        }
        out.sort(function (a, b) {
          if (a.lang === 'eng' && b.lang !== 'eng') return -1;
          if (b.lang === 'eng' && a.lang !== 'eng') return 1;
          if (a.name !== b.name) return a.name < b.name ? -1 : 1;
          return a.n - b.n;
        });
        sendJson(res, { subtitles: out });
      }
    );
  } else if (p === '/sub') {
    fetchUrl(q.u || '', function (buf) {
      sendJson(res, { cues: buf ? parseSrt(buf.toString('utf8')) : [] });
    });
  } else if (p === '/proxy') {
    var refStream = getStreamRef(q.ref || '');
    var signedTarget = refStream && q.u && q.sig === proxySignature(q.ref, q.u) ? String(q.u) : '';
    var orig = signedTarget || (refStream ? refStream.url : q.u || '');
    var cacheKey = refStream ? 'ref:' + q.ref + ':' + orig : orig;
    var customHeaders = refStream ? redirectedHeaders(refStream.url, orig, refStream.headers) : null;
    var c = resolvedFor(cacheKey);
    var start = c && Date.now() - c.at < 120000 ? c.url : orig; // reuse a fresh resolved CDN url
    var startHeaders = start === orig ? customHeaders : redirectedHeaders(orig, start, customHeaders);
    proxyStream(
      start,
      req.headers.range,
      req.method,
      res,
      orig,
      0,
      false,
      startHeaders,
      cacheKey,
      customHeaders,
      refStream ? String(q.ref) : ''
    );
  } else if (p === '/watchedbits') {
    // Decode Stremio's watched bitfield: "<anchorVideoId>:<anchorLen>:<zlib-b64>".
    // The browser has no zlib, so we inflate here and hand back raw bits.
    var wf = String(q.f || '');
    var wparts = wf.split(':');
    var wb64 = wparts.pop();
    var walen = parseInt(wparts.pop(), 10) || 0;
    var wanchor = wparts.join(':');
    var wbits = [];
    try {
      var wbuf = zlib.inflateSync(Buffer.from(wb64, 'base64'));
      for (var wi = 0; wi < wbuf.length * 8; wi++) wbits.push(wbuf[wi >> 3] & (0x80 >> wi % 8) ? 1 : 0);
    } catch (e) {}
    sendJson(res, { anchor: wanchor, alen: walen, bits: wbits });
  } else if (p === '/logo.png') {
    if (logoPng()) {
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'max-age=86400',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(logoPng());
    } else {
      res.writeHead(404);
      res.end();
    }
  } else if (fontFile(p)) {
    res.writeHead(200, {
      'Content-Type': 'font/woff',
      'Cache-Control': 'max-age=31536000',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(fontFile(p));
  } else if (p === '/yt') {
    ytResolve(String(q.v || ''), !!q.lq, function (url, err) {
      sendJson(res, url ? { url: url } : { err: err || 'unavailable' });
    });
  } else if (p === '/probe') {
    probeInfo(q.u || '', res);
  } else if (p === '/frame') {
    grabFrame(q, res);
  } else if (p === '/spritegen') {
    spriteGen(q, res);
  } else if (p === '/bgz') {
    bgResize(q, res);
  } else if (p === '/embtracks') {
    embTracks(q.u || '', res);
  } else if (p === '/embstart') {
    embStart(q, res);
  } else if (p === '/embcues') {
    embCues(q, res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end();
  }
}

module.exports = {
  handleRequest: handleRequest
};
