// Runtime numbers for the Settings diagnostics: this server, the television and the streaming server.

var fs = require('fs');
var http = require('http');
var https = require('https');
var urlmod = require('url');
var os = require('os');
var { APP_VERSION, PROFILE } = require('./config');
var { sendJson } = require('./http-util');
var { diskSpace } = require('./disk');
var { engineStatus, streamingServerUp } = require('./streaming-server');
var { isStreamingUrl, remoteAddress } = require('./server-address');
var { lastStreamRef } = require('./stream-refs');

function mb(bytes) {
  return Math.round((bytes || 0) / 1048576);
}

/* MemAvailable is what the kernel can hand out without swapping; old kernels only
   report MemFree, which undercounts the page cache. Off the TV, os.freemem() stands in. */
function systemMemory() {
  try {
    var info = {};
    fs.readFileSync('/proc/meminfo', 'utf8')
      .split('\n')
      .forEach(function (line) {
        var m = line.match(/^(\w+):\s+(\d+) kB/);
        if (m) info[m[1]] = parseInt(m[2], 10) * 1024;
      });
    if (info.MemTotal)
      return {
        totalMb: mb(info.MemTotal),
        availableMb: mb(info.MemAvailable != null ? info.MemAvailable : info.MemFree + (info.Cached || 0))
      };
  } catch (e) {}
  return { totalMb: mb(os.totalmem()), availableMb: mb(os.freemem()) };
}

/* Sampled every 30 s so a reading after some use shows the worst moment, not just now. */
var peakRss = 0,
  minAvailable = 0;
function sample() {
  var rss = mb(process.memoryUsage().rss),
    available = systemMemory().availableMb;
  if (rss > peakRss) peakRss = rss;
  if (!minAvailable || available < minAvailable) minAvailable = available;
}
sample();
setInterval(sample, 30000).unref();

/* The last problems the viewer may want to explain: sources that failed and addons that
   did not answer. Kept in memory only. */
var EVENT_KINDS = {
    media_error: 1,
    media_start_retry: 1,
    streamref_failed: 1,
    play_rejected: 1,
    addon_unavailable: 1,
    network_unreachable: 1
  },
  events = [];
function recordEvent(kind, detail) {
  if (!EVENT_KINDS[kind]) return;
  events.push({ at: Date.now(), kind: kind, detail: String(detail || '').slice(0, 80) });
  if (events.length > 8) events.shift();
}

function diagnostics(res) {
  sample();
  var mem = process.memoryUsage();
  streamingServerUp(function (up) {
    /* free space where this app keeps its files, or null where df is not available */
    diskSpace(process.env.HOME || __dirname, function (disk) {
      engineStatus(function (engineState) {
        sendJson(res, {
          version: APP_VERSION,
          profile: PROFILE.profile,
          server: { rssMb: mb(mem.rss), heapMb: mb(mem.heapUsed), externalMb: mb(mem.external) },
          uptimeMin: Math.round(process.uptime() / 60),
          system: systemMemory(),
          disk: disk,
          load: Math.round(os.loadavg()[0] * 100) / 100,
          streamingServer: !!up,
          serverAddress: remoteAddress(),
          torrentEngine: engineState,
          nativeProbe: process.env.SC_NATIVE_PROBE || '',
          peakRssMb: peakRss,
          minAvailableMb: minAvailable,
          events: events.slice().reverse()
        });
      });
    });
  });
}

/* Can this TV reach Stremio? Asked by the interface only after a request failed, so it can
   say why (no internet, DNS, a broken IPv6 route, a blocked certificate) instead of
   showing an empty screen. Any HTTP answer counts as reachable. */
var NETCHECK_URLS = ['https://api.strem.io/', 'https://v3-cinemeta.strem.io/manifest.json'];
function reach(u, cb) {
  var done = false;
  function finish(code) {
    if (done) return;
    done = true;
    cb(code);
  }
  try {
    var req = https.get(u, function (r) {
      r.resume();
      finish('');
    });
    req.setTimeout(6000, function () {
      req.destroy();
      finish('ETIMEDOUT');
    });
    req.on('error', function (e) {
      finish((e && e.code) || 'ERROR');
    });
  } catch (e) {
    finish('ERROR');
  }
}
/* How fast the connection is, asked from Settings: how long Stremio takes to answer, and how
   fast the start of the last source played downloads (at most 4 MB or 8 s; torrents, which
   come from the TV's own engine, are not measured). */
var SPEED_BYTES = 4 * 1048576,
  SPEED_MS = 8000;
function sourceSpeed(stream, cb) {
  var started = Date.now(),
    bytes = 0,
    done = false,
    request = null;
  function finish(ok) {
    if (done) return;
    done = true;
    try {
      if (request) request.abort();
    } catch (e) {}
    var ms = Date.now() - started;
    cb(ok && bytes > 65536 && ms > 0 ? Math.round(((bytes * 8) / ms / 1000) * 10) / 10 : null);
  }
  function get(address, hops) {
    var target = urlmod.parse(address),
      headers = {};
    Object.keys(stream.headers || {}).forEach(function (k) {
      headers[k] = stream.headers[k];
    });
    headers.Range = 'bytes=0-' + (SPEED_BYTES - 1);
    try {
      request = (target.protocol === 'https:' ? https : http).get(
        { hostname: target.hostname, port: target.port, path: target.path, headers: headers },
        function (res) {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 4) {
            res.resume();
            return get(urlmod.resolve(address, res.headers.location), hops + 1);
          }
          if (res.statusCode >= 400) return finish(false);
          started = Date.now();
          res.on('data', function (chunk) {
            bytes += chunk.length;
            if (bytes >= SPEED_BYTES) finish(true);
          });
          res.on('end', function () {
            finish(true);
          });
        }
      );
      request.on('error', function () {
        finish(bytes > 0);
      });
    } catch (e) {
      finish(false);
    }
  }
  setTimeout(function () {
    finish(true);
  }, SPEED_MS);
  get(stream.url, 0);
}
function speedTest(res) {
  var started = Date.now();
  reach(NETCHECK_URLS[0], function (code) {
    var latencyMs = code ? null : Date.now() - started,
      stream = lastStreamRef();
    if (!stream || !/^https?:/.test(stream.url || '') || isStreamingUrl(stream.url))
      return sendJson(res, { latencyMs: latencyMs, error: code || '' });
    sourceSpeed(stream, function (mbps) {
      sendJson(res, {
        latencyMs: latencyMs,
        error: code || '',
        mbps: mbps,
        host: urlmod.parse(stream.url).hostname
      });
    });
  });
}

function netcheck(res) {
  var left = NETCHECK_URLS.length,
    code = '',
    ok = false;
  NETCHECK_URLS.forEach(function (u) {
    reach(u, function (c) {
      if (!c) ok = true;
      else if (!code) code = c;
      if (--left) return;
      if (!ok) recordEvent('network_unreachable', code);
      sendJson(res, { ok: ok, code: ok ? '' : code });
    });
  });
}

module.exports = {
  diagnostics: diagnostics,
  netcheck: netcheck,
  sourceSpeed: sourceSpeed,
  speedTest: speedTest,
  recordEvent: recordEvent
};
