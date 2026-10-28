// Runtime numbers for the Settings diagnostics: this server, the television and the streaming server.

var fs = require('fs');
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

function diagnostics(res) {
  var mem = process.memoryUsage();
  portUp(SERVER_PORT, function (up) {
    sendJson(res, {
      version: APP_VERSION,
      profile: PROFILE.profile,
      server: { rssMb: mb(mem.rss), heapMb: mb(mem.heapUsed), externalMb: mb(mem.external) },
      uptimeMin: Math.round(process.uptime() / 60),
      system: systemMemory(),
      load: Math.round(os.loadavg()[0] * 100) / 100,
      streamingServer: !!up
    });
  });
}

module.exports = {
  diagnostics: diagnostics
};
