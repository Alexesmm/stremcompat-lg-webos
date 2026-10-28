// Starting and waiting for the bundled Stremio streaming server (:11470).

var net = require('net');
var path = require('path');
var spawn = require('child_process').spawn;
var { DIR, LIB, LOADER, NODE, SERVER, SERVER_PORT } = require('./config');

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
  var env = Object.assign({}, process.env);
  env.HOME = env.HOME || '/home/root';
  env.USER = env.USER || 'root';
  env.FFMPEG_BIN = path.join(DIR, 'bin', 'ffmpeg');
  env.FFPROBE_BIN = path.join(DIR, 'bin', 'ffprobe');
  var child = spawn(LOADER, ['--library-path', LIB, NODE, SERVER], {
    cwd: DIR,
    env: env,
    detached: true,
    stdio: 'ignore'
  });
  child.on('error', function () {});
  child.unref();
}

// ---------- streaming server readiness ----------
// Wait until the streaming server (:11470) is accepting connections, so the
// playback never starts before its backend is ready. Gives up after ~maxMs.
function waitForServer(cb, waited) {
  waited = waited || 0;
  portUp(SERVER_PORT, function (up) {
    if (up) return cb(true);
    if (waited === 0) startStreamingServer();
    if (waited >= 25000) return cb(false);
    setTimeout(function () {
      waitForServer(cb, waited + 700);
    }, 700);
  });
}

module.exports = {
  portUp: portUp,
  startStreamingServer: startStreamingServer,
  waitForServer: waitForServer
};
