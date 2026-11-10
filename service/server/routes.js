// Every address of the local server: a table from path to what answers it.

var fs = require('fs');
var path = require('path');
var urlmod = require('url');
var { APP_VERSION, DIR, PORT, PROFILE, PROFILE_MODULE } = require('./config');
var { dbg } = require('./log');
var { EMBEDDED_INTERFACE_SCRIPT_B64, EMBEDDED_INTERFACE_HTML_B64 } = require('./embedded');
var { safeText } = require('./text');
var { fetchJson, readJsonBody, sendJson } = require('./http-util');
var { fontFile, logoPng, readUiAsset, renderInterfaceHtml } = require('./ui-assets');
var { clearTorrentCache, engineStatus, torrentFiles } = require('./streaming-server');
var { seasonEpisodes } = require('./episodes');
var { remoteAddress, setServerAddress, streamingUrl } = require('./server-address');
var { getStreamRef, storeStreamRef } = require('./stream-refs');
var { handleProxy } = require('./proxy');
var { playerConstants, playerContext, playerPage } = require('./player-page');
var { embCues, embStart, embTracks, subtitleCues } = require('./subtitles');
var { addonSubtitles } = require('./subtitle-addons');
var { postStremioApi } = require('./stremio-api');
var { ytResolve } = require('./youtube');
var { grabFrame, probeInfo, spriteGen } = require('./media');
var { bgResize } = require('./images');
var { checkUpdate } = require('./update-check');
var { diagnostics, netcheck, recordEvent } = require('./diag');
var { cachedAddonJson } = require('./addon-cache');
var { handleTakeover } = require('./takeover');
var { decodeField, seriesVideos, setWatched } = require('./watched');

var LANGUAGE_FILE = /^\/lang\/[a-zA-Z-]{2,5}\.json$/;
/* what the player may report; nothing else reaches the log */
var LOGGED_FIELDS = [
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

function megabytes(bytes) {
  return Math.round(bytes / 1048576);
}

function sendText(res, text) {
  res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
  res.end(text);
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end();
}

function health(req, res) {
  var memory = process.memoryUsage();
  sendJson(res, {
    ok: true,
    version: APP_VERSION,
    port: PORT,
    runtime: process.version,
    memory: { rssMiB: megabytes(memory.rss), heapMiB: megabytes(memory.heapUsed) }
  });
}

/* A page on the web can only send this content type after a preflight, which this server never
   allows, so only the app can change where torrents are sent. */
function serverConfig(req, res) {
  if (req.method !== 'POST') return sendJson(res, { address: remoteAddress() });
  if (String(req.headers['content-type'] || '').indexOf('application/json') !== 0) {
    res.writeHead(403);
    return res.end();
  }
  readJsonBody(req, 1024, function (body) {
    setServerAddress(body && body.address, function (result) {
      sendJson(res, result);
    });
  });
}

function storeStream(req, res) {
  readJsonBody(req, 16384, function (body) {
    var ref = body && storeStreamRef(body);
    sendJson(res, ref ? { ref: ref } : { error: 'invalid_stream' });
  });
}

function addon(req, res, q) {
  cachedAddonJson(q.u || '', function (answer, why) {
    if (answer) return sendJson(res, answer);
    var host = String(q.u || '').replace(/^https?:\/\/([^/]+).*$/, '$1');
    recordEvent('addon_unavailable', why ? host + ' · ' + why : host);
    /* the addon's own "not found" stays a 404, so the interface does not ask again */
    var status = /^HTTP 4\d\d/.test(why || '') ? 404 : 502;
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end('{"error":"addon_unavailable"}');
  });
}

function clientLog(req, res, q) {
  var entry = {};
  var memory = process.memoryUsage();
  LOGGED_FIELDS.forEach(function (field) {
    if (q[field] != null) entry[field] = safeText(q[field], 160);
  });
  entry.rssMiB = megabytes(memory.rss);
  entry.heapMiB = megabytes(memory.heapUsed);
  dbg('[clientlog] ' + JSON.stringify(entry));
  recordEvent(entry.ev, [entry.addon, entry.quality].filter(Boolean).join(' '));
  sendText(res, 'ok');
}

/* ---------- the interface's files: on disk, with a copy inside the server ---------- */
function sendInterfaceFile(res, name, embedded, type, transform) {
  readUiAsset(name, embedded, function (err, buf) {
    if (err) {
      dbg('[ui] ' + name + ' failed: ' + err.message);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('APP_ASSET ' + name + ' ' + err.message);
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store, max-age=0' });
    res.end(transform ? transform(buf) : buf);
  });
}

function interfacePage(req, res) {
  PROFILE_MODULE.useSmallTvLimits(PROFILE, req.headers['user-agent']);
  sendInterfaceFile(
    res,
    'interface.html',
    EMBEDDED_INTERFACE_HTML_B64,
    'text/html; charset=utf-8',
    renderInterfaceHtml
  );
}

function interfaceScript(req, res) {
  sendInterfaceFile(
    res,
    'interface.js',
    EMBEDDED_INTERFACE_SCRIPT_B64,
    'application/javascript; charset=utf-8'
  );
}

function toInterface(req, res) {
  res.writeHead(302, { Location: '/beta?v=' + APP_VERSION });
  res.end();
}

/* ---------- the player ---------- */
function play(req, res, q) {
  var stream = getStreamRef(q.ref || '') || (q.u ? { url: streamingUrl(q.u) } : null);
  if (stream && stream.url) {
    return playerContext(stream, q, function (context) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(playerPage(stream, context));
    });
  }
  if (q.ref && q.back) {
    res.writeHead(302, { Location: 'http://127.0.0.1:' + PORT + '/' + String(q.back).replace(/^\/+/, '') });
    return res.end();
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    '<body style="background:#000;color:#fff;font-family:sans-serif;text-align:center;padding-top:40vh">Could not read stream. <a style="color:#8c5cff" href="/beta">Back</a></body>'
  );
}

/* the same answer for a player page that does not come from this server */
function playInfo(req, res, q) {
  var stream = getStreamRef(q.ref || '');
  if (!stream || !stream.url) return sendJson(res, { gone: true });
  playerContext(stream, q, function (context) {
    sendJson(res, playerConstants(stream, context));
  });
}

function titleArt(req, res, q) {
  var address =
    'https://v3-cinemeta.strem.io/meta/' +
    encodeURIComponent(q.type || 'movie') +
    '/' +
    encodeURIComponent(q.id || '') +
    '.json';
  fetchJson(address, function (answer) {
    var meta = (answer && answer.meta) || {};
    sendJson(res, {
      name: meta.name || '',
      poster: (meta.poster || '').replace('/small/', '/medium/'),
      background: meta.background || meta.poster || '',
      logo: meta.logo || ''
    });
  });
}

/* the account's subtitle addons, sent by the player; a plain GET asks about a title directly */
function subtitleList(req, res, q) {
  function answer(list) {
    sendJson(res, { subtitles: list });
  }
  if (req.method !== 'POST') return addonSubtitles({ type: q.type, vid: q.vid }, answer);
  readJsonBody(req, 32768, function (body) {
    addonSubtitles(body, answer);
  });
}

function watchedSet(req, res, q) {
  seriesVideos(String(q.id || ''), function (videos) {
    var field = videos ? setWatched(String(q.f || ''), videos, String(q.vid || ''), q.w !== '0') : '';
    sendJson(res, field ? { watched: field } : { error: 'unknown_video' });
  });
}

function logo(req, res) {
  if (!logoPng()) return notFound(res);
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Cache-Control': 'max-age=86400',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(logoPng());
}

function languageFile(req, res, q, pathname) {
  fs.readFile(path.join(DIR, 'lang', pathname.slice(6)), function (err, body) {
    res.writeHead(err ? 404 : 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    res.end(err ? '{}' : body);
  });
}

var ROUTES = {
  '/health': health,
  '/takeover': handleTakeover,
  '/serverconfig': serverConfig,
  '/addon': addon,
  '/log': clientLog,
  '/': toInterface,
  '/index.html': toInterface,
  '/beta': interfacePage,
  '/interface.js': interfaceScript,
  '/play': play,
  '/playinfo': playInfo,
  '/meta': titleArt,
  '/subs': subtitleList,
  '/watchedset': watchedSet,
  '/logo.png': logo,
  '/update': checkUpdate,
  '/streamfile': function (req, res) {
    engineStatus(function (status) {
      sendJson(res, status);
    });
  },
  '/diag': function (req, res) {
    diagnostics(res);
  },
  '/netcheck': function (req, res) {
    netcheck(res);
  },
  /* proves the port is bound, so the launcher can move on instead of guessing on a timer */
  '/ping': function (req, res) {
    sendText(res, 'ok');
  },
  '/sub': function (req, res, q) {
    subtitleCues(String(q.u || ''), function (cues) {
      sendJson(res, { cues: cues });
    });
  },
  '/proxy': function (req, res, q) {
    handleProxy(q, req, res);
  },
  /* the browser has no zlib, so it gets Stremio's watched field as plain bits */
  '/watchedbits': function (req, res, q) {
    sendJson(res, decodeField(q.f));
  },
  '/yt': function (req, res, q) {
    ytResolve(String(q.v || ''), !!q.lq, function (link, why) {
      sendJson(res, link ? { url: link } : { err: why || 'unavailable' });
    });
  },
  /* for the player's own lists: this season's episodes, and a torrent's video files */
  '/episodes': function (req, res, q) {
    seriesVideos(q.id || '', function (videos) {
      sendJson(res, { episodes: seasonEpisodes(videos, q.vid || '') });
    });
  },
  '/clearcache': function (req, res) {
    clearTorrentCache(function (result) {
      sendJson(res, result);
    });
  },
  '/torrentfiles': function (req, res, q) {
    sendJson(res, { files: torrentFiles(q.u || '') });
  },
  '/probe': function (req, res, q) {
    probeInfo(q.u || '', res);
  },
  '/preview-frame': function (req, res, q) {
    grabFrame(q, res);
  },
  '/previews': function (req, res, q) {
    spriteGen(q, res);
  },
  '/artwork': function (req, res, q) {
    bgResize(q, res);
  },
  '/subtitle-tracks': function (req, res, q) {
    embTracks(q.u || '', res);
  },
  '/subtitle-start': function (req, res, q) {
    embStart(q, res);
  },
  '/subtitle-cues': function (req, res, q) {
    embCues(q, res);
  }
};

var POST_ONLY = {
  '/stremioapi': function (req, res, q) {
    postStremioApi(String(q.path || ''), req, res);
  },
  '/streamref': storeStream
};

function handleRequest(req, res) {
  var parsed = urlmod.parse(req.url, true);
  var pathname = req.url.split('?')[0];
  var route = ROUTES[pathname] || (req.method === 'POST' && POST_ONLY[pathname]);
  if (route) return route(req, res, parsed.query, pathname);
  if (LANGUAGE_FILE.test(pathname)) return languageFile(req, res, parsed.query, pathname);
  var font = fontFile(pathname);
  if (!font) return notFound(res);
  res.writeHead(200, {
    'Content-Type': 'font/woff',
    'Cache-Control': 'max-age=31536000',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(font);
}

module.exports = {
  handleRequest: handleRequest
};
