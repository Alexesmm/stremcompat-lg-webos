// Local compatibility server. Runs under the bundled Node 18 runtime (spawned by
// the webOS service launch.js), so modern Node APIs are available here.
//
// Responsibilities:
//   1. Start the Stremio streaming server (server.js) on :11470 if not running.
//   2. Serve the television interface (/beta, /beta-app.js) and the bare player (/play).
//   3. Bridge account, addon, artwork, subtitle and stream requests that the old
//      TV browsers cannot perform themselves (TLS roots, CORS, headers, HLS).

var dns = require('dns');
var http = require('http');

/* Try IPv4 addresses first. Since Node 17 addresses come in the resolver's order, and
   Node 18 has no automatic fallback to the next address (autoSelectFamily is off before
   Node 20). On a network that hands out IPv6 without a working IPv6 route, every request
   to Stremio, Cinemeta and the addons hung while browsers fell back to IPv4. */
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {}
var { PORT, SERVER_PORT } = require('./server/config');
var { dbg } = require('./server/log');
var { portUp, startStreamingServer } = require('./server/streaming-server');
var routes = require('./server/routes');

dbg('tvserver starting, uid=' + (process.getuid ? process.getuid() : '?'));

process.on('uncaughtException', function (e) {
  dbg('UNCAUGHT: ' + ((e && e.stack) || e));
});

portUp(SERVER_PORT, function (up) {
  if (!up) startStreamingServer();
});

http.createServer(routes.handleRequest).listen(PORT, '127.0.0.1', function () {
  dbg('listening on :' + PORT);
  console.log('tvserver on :' + PORT);
});
