// Starting and waiting for the Stremio streaming server (:11470).

var fs = require('fs');
var net = require('net');
var path = require('path');
var spawn = require('child_process').spawn;
var { DIR, LIB, LOADER, NODE, PROFILE, SERVER_PORT } = require('./config');
var { ensureServerFile, serverFileStatus } = require('./streaming-file');
var { probeAddress, remoteAddress } = require('./server-address');

// ---------- start the streaming server ----------
function portUp(port, cb) {
  var s = net.connect(port, '127.0.0.1');
  var done = false;
  function f(v) {
    if (!done) {
      done = true;
      try {
        s.destroy();
      } catch (e) {}
      cb(v);
    }
  }
  s.on('connect', function () {
    f(true);
  });
  s.on('error', function () {
    f(false);
  });
  setTimeout(function () {
    f(false);
  }, 1000);
}

var streamingServerStartedAt = 0;

function startStreamingServer() {
  var now = Date.now();
  if (now - streamingServerStartedAt < 30000) return;
  streamingServerStartedAt = now;
  /* the runtime only exists on the TV: tests and source checkouts download nothing */
  if (remoteAddress() || PROFILE.localTorrents === false || !fs.existsSync(LOADER)) return;
  ensureServerFile(function (err, file) {
    if (!err) spawnStreamingServer(file);
  });
}

function spawnStreamingServer(file) {
  var env = Object.assign({}, process.env);
  env.HOME = env.HOME || '/home/root';
  env.USER = env.USER || 'root';
  env.FFMPEG_BIN = path.join(DIR, 'bin', 'ffmpeg');
  env.FFPROBE_BIN = path.join(DIR, 'bin', 'ffprobe');
  /* IPv4 first, for the same reason as tvserver.js (no fallback in Node 18) */
  var child = spawn(LOADER, ['--library-path', LIB, NODE, '--dns-result-order=ipv4first', file], {
    cwd: DIR,
    env: env,
    detached: true,
    stdio: 'ignore'
  });
  child.on('error', function () {});
  child.unref();
}

/* for Diagnostics: is the server in use answering, here or at the address given */
function streamingServerUp(cb) {
  if (remoteAddress()) probeAddress(remoteAddress(), cb, 3000);
  else portUp(SERVER_PORT, cb);
}

// ---------- streaming server readiness ----------
// Wait until the streaming server (:11470) is accepting connections, so the
// playback never starts before its backend is ready. Gives up after ~maxMs.
function waitForServer(cb, waited) {
  waited = waited || 0;
  /* this platform has no server of its own: nothing is coming */
  if (PROFILE.localTorrents === false && !remoteAddress()) return cb(false);
  portUp(SERVER_PORT, function (up) {
    if (up) return cb(true);
    if (waited === 0) startStreamingServer();
    /* the first torrent may have to wait for the download; a failed one ends the wait */
    var file = serverFileStatus().state;
    if (file === 'failed' || waited >= (file === 'downloading' ? 90000 : 25000)) return cb(false);
    setTimeout(function () {
      waitForServer(cb, waited + 700);
    }, 700);
  });
}

module.exports = {
  portUp: portUp,
  startStreamingServer: startStreamingServer,
  streamingServerUp: streamingServerUp,
  waitForServer: waitForServer
};
