// The local server as a Tizen service: what local-server.js does on webOS, on the TV's own Node.
// ES5. Sets up the environment before the server modules read it, then only adds what is
// specific to this platform in front of the same routes.
require('./compat');

var fs = require('fs');
var http = require('http');
var os = require('os');
var path = require('path');
var PROFILE = require('./profile').current;

var IDLE_LIMIT_MS = 90000;
var MAX_LOG_BYTES = 256 * 1024;
var server = null;
var lastRequestAt = Date.now();

/* The app's own writable folder: the install folder is read-only and so is $HOME. */
function dataFolder() {
  var candidates = [
    process.env.STREMCOMPAT_DATA,
    '/opt/usr/home/owner/apps_rw/' + PROFILE.appId.split('.')[0] + '/data',
    path.join(os.tmpdir(), 'stremcompat')
  ];
  for (var i = 0; i < candidates.length; i++) {
    if (!candidates[i]) continue;
    try {
      fs.mkdirSync(candidates[i], { recursive: true });
      fs.writeFileSync(path.join(candidates[i], '.write-test'), 'ok');
      fs.unlinkSync(path.join(candidates[i], '.write-test'));
      return candidates[i];
    } catch (e) {}
  }
  return os.tmpdir();
}

function prepareEnvironment() {
  var data = dataFolder(),
    log = path.join(data, 'local server.log');
  /* server-address.js and streaming-file.js keep their files under $HOME */
  process.env.HOME = data;
  process.env.SC_SERVER_LOG = log;
  try {
    if (fs.statSync(log).size > MAX_LOG_BYTES) fs.unlinkSync(log);
  } catch (e) {}
}

function quit() {
  try {
    tizen.application.getCurrentApplication().exit();
  } catch (e) {}
  setTimeout(function () {
    process.exit(0);
  }, 300);
}

/* A POST from the app's own pages needs a preflight. Only those pages get one, so a site open
   in the TV's browser still cannot post JSON here. */
function preflight(req, res) {
  var origin = String(req.headers.origin || '');
  if (origin !== 'file://' && origin !== 'null') {
    res.writeHead(403);
    res.end();
    return;
  }
  res.writeHead(200, {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600'
  });
  res.end();
}

function boot() {
  if (server) return;
  prepareEnvironment();
  var dbg = require('./server/log').dbg;
  var routes = require('./server/routes');
  process.on('uncaughtException', function (e) {
    dbg('UNCAUGHT: ' + ((e && e.stack) || e));
  });
  server = http.createServer(function (req, res) {
    lastRequestAt = Date.now();
    if (req.method === 'OPTIONS') return preflight(req, res);
    if (req.url.split('?')[0] === '/quit') {
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('bye');
      setTimeout(quit, 100);
      return;
    }
    routes.handleRequest(req, res);
  });
  server.on('error', function (e) {
    dbg('listen failed: ' + ((e && e.code) || e));
  });
  server.listen(PROFILE.port, '127.0.0.1', function () {
    dbg('listening on :' + PROFILE.port + ' with ' + process.version);
  });
  /* nothing keeps running after the app closes (src/platform/tizen/common.js keeps this alive) */
  var idle = setInterval(function () {
    if (Date.now() - lastRequestAt > IDLE_LIMIT_MS) quit();
  }, 15000);
  if (idle.unref) idle.unref();
}

module.exports.onStart = boot;
module.exports.onRequest = boot;
module.exports.onStop = function () {};
module.exports.onExit = function () {};
