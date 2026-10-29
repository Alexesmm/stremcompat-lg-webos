// HTTP routing for the local compatibility server.

var urlmod = require('url');
var { APP_VERSION, PORT } = require('./config');
var { dbg } = require('./log');
var { EMBEDDED_BETA_APP_B64, EMBEDDED_BETA_HTML_B64 } = require('./embedded');
var { safeText } = require('./text');
var { fetchJson, readJsonBody, sendJson } = require('./http-util');
var { fontFile, logoPng, readUiAsset, renderInterfaceHtml } = require('./ui-assets');
var { waitForServer } = require('./streaming-server');
var { getStreamRef, storeStreamRef } = require('./stream-refs');
var { proxySignature, proxyStream, redirectedHeaders, resolvedFor } = require('./proxy');
var { playerPage } = require('./player-page');
var { embCues, embStart, embTracks, subtitleCues } = require('./subtitles');
var { addonSubtitles } = require('./subtitle-addons');
var { postStremioApi } = require('./stremio-api');
var { ytResolve } = require('./youtube');
var { grabFrame, probeInfo, spriteGen } = require('./media');
var { bgResize } = require('./images');
var { nextEpisodeId } = require('./episodes');
var { diagnostics, netcheck, recordEvent } = require('./diag');
var { cachedAddonJson } = require('./addon-cache');
var { decodeField, rememberVideos, seriesVideos, setWatched } = require('./watched');

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
  } else if (p === '/netcheck') {
    netcheck(res);
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
    cachedAddonJson(q.u || '', function (j, why) {
      if (!j) {
        recordEvent(
          'addon_unavailable',
          String(q.u || '').replace(/^https?:\/\/([^/]+).*$/, '$1') + (why ? ' · ' + why : '')
        );
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
      'reason',
      'addon'
    ];
    var entry = {},
      lm = process.memoryUsage();
    allowedLog.forEach(function (key) {
      if (q[key] != null) entry[key] = safeText(q[key], 160);
    });
    entry.rssMiB = Math.round(lm.rss / 1048576);
    entry.heapMiB = Math.round(lm.heapUsed / 1048576);
    dbg('[clientlog] ' + JSON.stringify(entry));
    recordEvent(entry.ev, [entry.addon, entry.quality].filter(Boolean).join(' '));
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
            rememberVideos(ctx.id, m.videos);
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
    // External subtitles: the account's subtitle addons (POST from the player), or the
    // public OpenSubtitles addon for a plain GET.
    if (req.method === 'POST')
      readJsonBody(req, 32768, function (body) {
        addonSubtitles(body, function (list) {
          sendJson(res, { subtitles: list });
        });
      });
    else
      addonSubtitles({ type: q.type, vid: q.vid }, function (list) {
        sendJson(res, { subtitles: list });
      });
  } else if (p === '/sub') {
    subtitleCues(String(q.u || ''), function (cues) {
      sendJson(res, { cues: cues });
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
    // Decode Stremio's watched field; the browser has no zlib, so hand back raw bits.
    sendJson(res, decodeField(q.f));
  } else if (p === '/watchedset') {
    // Mark one episode in the watched field, as the official apps write it.
    seriesVideos(String(q.id || ''), function (videos) {
      var field = videos ? setWatched(String(q.f || ''), videos, String(q.vid || ''), q.w !== '0') : '';
      sendJson(res, field ? { watched: field } : { error: 'unknown_video' });
    });
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
