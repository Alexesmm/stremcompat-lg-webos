// Obtaining Stremio's streaming server, which this package does not include.

var crypto = require('crypto');
var fs = require('fs');
var https = require('https');
var http = require('http');
var path = require('path');
var { DIR } = require('./config');
var { dbg } = require('./log');

/* The streaming server is Stremio's own closed-source program, so it is not redistributed
   here: the TV downloads the webOS build straight from Stremio on first use. The version
   and checksum are pinned, and a file that does not match is never executed. */
var SERVER_VERSION = '4.20.17';
var SERVER_URL = 'https://dl.strem.io/server/v' + SERVER_VERSION + '/webos/server.js';
var SERVER_SHA256 = 'ecef1b5a4f67f5fd94ffc0c39e7567d6a6efdd46849ea7a2da48ccc84bd49c1d';
var FILE_NAME = 'stremio-server-' + SERVER_VERSION + '.js';
var MAX_BYTES = 16 * 1024 * 1024;
var IDLE_TIMEOUT_MS = 60000;

/* idle, downloading, ready or failed; err is network, checksum or disk */
var status = { state: 'idle', err: '' };
var waiting = null;

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/* The home folder survives app updates; the app's own folder is the fallback. */
function storageDirs() {
  var dirs = [];
  if (process.env.HOME) dirs.push(path.join(process.env.HOME, '.stremcompat'));
  dirs.push(path.join(DIR, 'runtime-cache'));
  return dirs;
}

function existingFile(dirs, expected) {
  for (var i = 0; i < dirs.length; i++) {
    var file = path.join(dirs[i], FILE_NAME);
    try {
      if (sha256(fs.readFileSync(file)) === expected) return file;
      dbg('streaming server file failed its checksum, discarding: ' + file);
      fs.unlinkSync(file);
    } catch (e) {}
  }
  return '';
}

function download(url, depth, cb) {
  var done = false;
  function finish(err, buf) {
    if (done) return;
    done = true;
    cb(err, buf);
  }
  var req;
  try {
    req = (/^https:/i.test(url) ? https : http).get(url, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 5) {
        res.resume();
        done = true;
        return download(new URL(res.headers.location, url).href, depth + 1, cb);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return finish('network');
      }
      var chunks = [],
        total = 0;
      res.on('data', function (d) {
        total += d.length;
        if (total > MAX_BYTES) {
          req.destroy();
          return finish('checksum');
        }
        chunks.push(d);
      });
      res.on('end', function () {
        finish(null, Buffer.concat(chunks));
      });
      res.on('error', function () {
        finish('network');
      });
    });
  } catch (e) {
    return finish('network');
  }
  req.setTimeout(IDLE_TIMEOUT_MS, function () {
    req.destroy();
    finish('network');
  });
  req.on('error', function () {
    finish('network');
  });
}

/* Written to a temporary name first, so a power cut cannot leave a partial server */
function store(buf, dirs) {
  for (var i = 0; i < dirs.length; i++) {
    var file = path.join(dirs[i], FILE_NAME),
      tmp = file + '.tmp';
    try {
      fs.mkdirSync(dirs[i], { recursive: true });
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, file);
      return file;
    } catch (e) {
      dbg('could not store the streaming server in ' + dirs[i] + ': ' + ((e && e.code) || e));
    }
  }
  return '';
}

/* cb(err, file). options (url, sha256, dirs) exist for the tests. */
function ensureServerFile(cb, options) {
  options = options || {};
  var dirs = options.dirs || storageDirs(),
    expected = options.sha256 || SERVER_SHA256;
  var file = existingFile(dirs, expected);
  if (file) {
    status = { state: 'ready', err: '' };
    return cb(null, file);
  }
  if (waiting) return waiting.push(cb);
  waiting = [cb];
  status = { state: 'downloading', err: '' };
  function settle(err, path) {
    status = err ? { state: 'failed', err: err } : { state: 'ready', err: '' };
    if (err) dbg('streaming server download failed: ' + err);
    var list = waiting;
    waiting = null;
    list.forEach(function (fn) {
      fn(err, path);
    });
  }
  download(options.url || SERVER_URL, 0, function (err, buf) {
    if (err) return settle(err);
    if (sha256(buf) !== expected) return settle('checksum');
    var stored = store(buf, dirs);
    if (!stored) return settle('disk');
    settle(null, stored);
  });
}

function serverFileStatus() {
  return status;
}

module.exports = {
  ensureServerFile: ensureServerFile,
  serverFileStatus: serverFileStatus
};
