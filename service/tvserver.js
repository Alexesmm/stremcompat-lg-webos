// Local compatibility server. Runs on the television's own Node, started by launch.js. The
// build writes out what that old Node cannot parse (scripts/lib/legacy-node.js).
//
// Responsibilities:
//   1. Start the torrent engine on :11470 if not running.
//   2. Serve the television interface (/beta, /beta-app.js) and the bare player (/play).
//   3. Bridge account, addon, artwork, subtitle and stream requests that the old
//      TV browsers cannot perform themselves (TLS roots, CORS, headers, HLS).

require('./compat');

var dns = require('dns');
var http = require('http');

/* Try IPv4 addresses first. On a network that hands out IPv6 without a working IPv6 route, every
   request to Stremio, Cinemeta and the addons hung while browsers fell back to IPv4. Old Node
   gets the same from compat.js, which also needs no such setting on the versions in between. */
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
var { PORT } = require('./server/config');
var { dbg } = require('./server/log');
var { startStreamingServer } = require('./server/streaming-server');
var routes = require('./server/routes');
var { claimPort, leaveWhenReplaced, listenTakingOver } = require('./server/takeover');

dbg('tvserver starting, uid=' + (process.getuid ? process.getuid() : '?'));

process.on('uncaughtException', function (e) {
  dbg('UNCAUGHT: ' + ((e && e.stack) || e));
});

startStreamingServer();

/* the port may still be held by the server of the version installed before (takeover.js) */
listenTakingOver(http.createServer(routes.handleRequest), function () {
  dbg('listening on :' + PORT);
  console.log('tvserver on :' + PORT);
  /* from now on, an update makes this server leave by itself */
  claimPort();
  leaveWhenReplaced();
});
