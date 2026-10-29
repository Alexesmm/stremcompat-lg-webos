// Runtime numbers for the Settings diagnostics: this server, the television and the streaming server.

var fs = require('fs');
var https = require('https');
var os = require('os');
var { APP_VERSION, PROFILE, SERVER_PORT } = require('./config');
var { sendJson } = require('./http-util');
var { portUp } = require('./streaming-server');

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
  portUp(SERVER_PORT, function (up) {
    sendJson(res, {
      version: APP_VERSION,
      profile: PROFILE.profile,
      server: { rssMb: mb(mem.rss), heapMb: mb(mem.heapUsed), externalMb: mb(mem.external) },
      uptimeMin: Math.round(process.uptime() / 60),
      system: systemMemory(),
      load: Math.round(os.loadavg()[0] * 100) / 100,
      streamingServer: !!up,
      peakRssMb: peakRss,
      minAvailableMb: minAvailable,
      events: events.slice().reverse()
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
  recordEvent: recordEvent
};
