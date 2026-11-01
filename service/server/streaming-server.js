// Torrents on the TV. The player and the interface know a torrent by an address on :11470
// (/<infohash>/<file index>), the same one a Stremio streaming server answers on another
// computer. Here that address leads to the engine (bin/sc-engine, native/engine): a program that
// starts with the first torrent, gets its orders over a pipe, and is stopped once nothing plays.
// Bytes go directly from the engine to the player, which gets redirected to the engine's own link.

var fs = require('fs');
var http = require('http');
var net = require('net');
var path = require('path');
var spawn = require('child_process').spawn;
var urlmod = require('url');
var { DIR, ENGINE, PROFILE, SERVER_PORT } = require('./config');
var { dbg } = require('./log');
var { probeAddress, remoteAddress } = require('./server-address');

var METADATA_TIMEOUT_MS = 90000;
var STREAM_TIMEOUT_MS = 30000;
var IDLE_STOP_MS = 120000;
var OPENSUB_CHUNK = 65536;
var VIDEO_FILE = /\.(mkv|mp4|m4v|avi|mov|webm|ts|m2ts|mpg|mpeg|wmv|flv)$/i;
/* well-known public trackers, for what an addon sends without any */
var TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://open.demonii.com:1337/announce'
];

function noop() {}

function portUp(port, cb) {
  var s = net.connect(port, '127.0.0.1');
  var done = false;
  function finish(up) {
    if (done) return;
    done = true;
    try {
      s.destroy();
    } catch (e) {}
    cb(up);
  }
  s.on('connect', function () {
    finish(true);
  });
  s.on('error', function () {
    finish(false);
  });
  setTimeout(function () {
    finish(false);
  }, 1000);
}

/* ---------- the engine process ---------- */
var engine = null;
var torrents = {};
var stats = null;
var lastUse = 0;

function engineFolder() {
  var candidates = [path.join(process.env.HOME || DIR, '.stremcompat', 'torrents'), path.join(DIR, 'torrents')];
  for (var i = 0; i < candidates.length; i++) {
    try {
      fs.mkdirSync(candidates[i], { recursive: true });
      return candidates[i];
    } catch (e) {}
  }
  return candidates[1];
}

function failAll(message) {
  Object.keys(torrents).forEach(function (hash) {
    var t = torrents[hash];
    settle(t.waiting, message);
    Object.keys(t.streams).forEach(function (index) {
      settle(t.streams[index].waiting, message);
    });
  });
  torrents = {};
}

/* every waiter once, whichever comes first: an answer or its timer */
function settle(waiters, err, value) {
  waiters.splice(0).forEach(function (fn) {
    fn(err, value);
  });
}

function send(line) {
  if (!engine) return;
  if (!engine.ready) engine.queue.push(line);
  else engine.child.stdin.write(line + '\n');
}

function startEngine() {
  if (engine) return true;
  var isScript = /\.js$/.test(ENGINE);
  if (!isScript && !fs.existsSync(ENGINE)) return false;
  var folder = engineFolder();
  var child;
  try {
    child = spawn(isScript ? process.execPath : ENGINE, isScript ? [ENGINE, folder] : [folder], {
      cwd: DIR,
      stdio: ['pipe', 'pipe', 'ignore']
    });
  } catch (e) {
    dbg('engine did not start: ' + e.message);
    return false;
  }
  var current = { child: child, ready: false, queue: [], text: '' };
  engine = current;
  child.stdin.on('error', noop);
  child.stdout.on('data', function (chunk) {
    current.text += chunk.toString();
    var lines = current.text.split('\n');
    current.text = lines.pop();
    lines.forEach(function (line) {
      if (!line) return;
      var message;
      try {
        message = JSON.parse(line);
      } catch (e) {
        return;
      }
      if (engine === current) onEngineMessage(message);
    });
  });
  function gone(reason) {
    if (engine !== current) return;
    dbg('engine stopped: ' + reason);
    engine = null;
    stats = null;
    failAll('engine stopped');
  }
  child.on('error', function (e) {
    gone(e.code || e.message);
  });
  child.on('exit', function (code, signal) {
    gone('code=' + code + ' signal=' + signal);
  });
  return true;
}

function stopEngine() {
  if (!engine) return;
  var child = engine.child;
  engine = null;
  stats = null;
  failAll('engine stopped');
  /* it leaves by itself when its input closes, which also clears what it kept on storage */
  try {
    child.stdin.end();
  } catch (e) {}
  setTimeout(function () {
    try {
      child.kill('SIGKILL');
    } catch (e) {}
  }, 5000);
}

function torrentById(id) {
  var keys = Object.keys(torrents);
  for (var i = 0; i < keys.length; i++) {
    if (torrents[keys[i]].id === id || keys[i] === String(id).toLowerCase()) return torrents[keys[i]];
  }
  return null;
}

function onEngineMessage(m) {
  var t;
  if (m.event === 'ready') {
    engine.ready = true;
    engine.queue.splice(0).forEach(send);
  } else if (m.event === 'added') {
    t = torrents[m.tag] || torrentById(m.torrent);
    if (t) t.id = m.torrent;
  } else if (m.event === 'metadata') {
    t = torrentById(m.torrent) || torrents[m.tag];
    if (t) {
      t.id = m.torrent;
      send('files\t' + m.torrent);
    }
  } else if (m.event === 'files') {
    t = torrentById(m.torrent);
    if (t) {
      t.files = m.files;
      settle(t.waiting);
    }
  } else if (m.event === 'stream') {
    onTaggedStream(m.tag, function (t, entry) {
      entry.url = m.url;
      entry.id = m.stream;
      entry.size = m.size;
      settle(entry.waiting, null, entry);
    });
  } else if (m.event === 'stopped') {
    t = torrentById(m.torrent);
    if (t) {
      Object.keys(t.streams).forEach(function (index) {
        if (t.streams[index].id === m.stream) delete t.streams[index];
      });
    }
  } else if (m.event === 'stats') {
    stats = m;
  } else if (m.event === 'error' || m.event === 'failed') {
    onEngineFailure(m);
  }
}

function onTaggedStream(tag, fn) {
  var parts = String(tag || '').split(':');
  var t = torrents[parts[0]];
  var entry = t && t.streams[parts[1]];
  if (entry) fn(t, entry);
}

function onEngineFailure(m) {
  var message = m.message || 'engine error';
  if (m.tag && m.tag.indexOf(':') > 0) {
    return onTaggedStream(m.tag, function (t, entry) {
      delete t.streams[m.tag.split(':')[1]];
      settle(entry.waiting, message);
    });
  }
  var t = torrents[m.tag] || torrentById(m.torrent);
  if (!t) return;
  delete torrents[t.hash];
  settle(t.waiting, message);
  Object.keys(t.streams).forEach(function (index) {
    settle(t.streams[index].waiting, message);
  });
}

/* ---------- from an address to the engine's link ---------- */
function magnetFor(hash, trackers) {
  var list = trackers
    .concat(TRACKERS)
    .filter(function (tr, i, all) {
      return /^(udp|https?):\/\//i.test(tr) && all.indexOf(tr) === i;
    })
    .slice(0, 20);
  return (
    'magnet:?xt=urn:btih:' +
    hash +
    list
      .map(function (tr) {
        return '&tr=' + encodeURIComponent(tr);
      })
      .join('')
  );
}

/* The file asked for, unless it is not a video: an addon that names no file arrives as file 0,
   which in many torrents is a sample or a text file. Then the largest video. */
function chooseFile(files, index) {
  var asked = null,
    largest = null;
  files.forEach(function (file) {
    if (file.index === index) asked = file;
    if (VIDEO_FILE.test(file.path) && (!largest || file.size > largest.size)) largest = file;
  });
  if (asked && (index > 0 || VIDEO_FILE.test(asked.path))) {
    if (index > 0 || !largest || asked.size >= largest.size / 2) return asked;
  }
  return largest || asked || files[0] || null;
}

/* cb runs once: cb(message), or cb(null, value) */
function onceWithin(ms, waiters, cb) {
  var done = false,
    timer = null;
  function answer(err, value) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    cb(err, value);
  }
  timer = setTimeout(function () {
    answer('timeout');
  }, ms);
  waiters.push(answer);
}

function torrentFor(hash, trackers, cb) {
  var t = torrents[hash];
  if (!startEngine()) return cb('engine missing');
  if (!t) {
    t = torrents[hash] = { hash: hash, id: '', files: null, waiting: [], streams: {} };
    send('add\t' + hash + '\t' + magnetFor(hash, trackers));
  }
  if (t.files) return cb(null, t);
  onceWithin(METADATA_TIMEOUT_MS, t.waiting, function (err) {
    cb(err, t);
  });
}

function streamFor(hash, index, trackers, cb) {
  torrentFor(hash, trackers, function (err, t) {
    if (err) return cb(err);
    var file = chooseFile(t.files, index);
    if (!file) return cb('no video in this torrent');
    var entry = t.streams[file.index];
    if (entry && entry.url) return cb(null, entry);
    if (!entry) {
      entry = t.streams[file.index] = { url: '', id: '', size: file.size, waiting: [] };
      send('prepare\t' + hash + ':' + file.index + '\t' + t.id + '\t' + file.index);
    }
    onceWithin(STREAM_TIMEOUT_MS, entry.waiting, cb);
  });
}

function parseAddress(u) {
  var parsed = urlmod.parse(String(u || ''), true);
  var m = String(parsed.pathname || '').match(/^\/([0-9a-fA-F]{40})\/(\d+)\/?$/);
  if (!m) return null;
  var tr = parsed.query.tr;
  return { hash: m[1].toLowerCase(), index: parseInt(m[2], 10), trackers: tr ? [].concat(tr) : [] };
}

/* ---------- the OpenSubtitles hash, so subtitle addons can match this exact file ---------- */
function readRange(url, start, end, cb) {
  var o = urlmod.parse(url);
  o.headers = { Range: 'bytes=' + start + '-' + end };
  var chunks = [];
  var req = http.get(o, function (res) {
    res.on('data', function (d) {
      chunks.push(d);
    });
    res.on('end', function () {
      cb(res.statusCode < 400 ? null : 'status ' + res.statusCode, Buffer.concat(chunks));
    });
  });
  req.on('error', function (e) {
    cb(e.message);
  });
}

/* the file's size plus every 64-bit little-endian word of its first and last 64 KiB, modulo 2^64 */
function opensubHash(size, head, tail) {
  var low = size % 0x100000000,
    high = Math.floor(size / 0x100000000) % 0x100000000;
  [head, tail].forEach(function (buf) {
    for (var i = 0; i + 8 <= buf.length; i += 8) {
      low += buf.readUInt32LE(i);
      high += buf.readUInt32LE(i + 4) + Math.floor(low / 0x100000000);
      low %= 0x100000000;
      high %= 0x100000000;
    }
  });
  function hex(n) {
    var text = n.toString(16);
    return '00000000'.slice(text.length) + text;
  }
  return hex(high) + hex(low);
}

function sendJson(res, value, status) {
  res.writeHead(status || 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function answerOpensubHash(query, res) {
  var address = parseAddress(query.videoUrl);
  if (!address) return sendJson(res, { error: 'bad address' }, 400);
  streamFor(address.hash, address.index, address.trackers, function (err, entry) {
    if (err || !(entry.size >= OPENSUB_CHUNK)) return sendJson(res, { error: err || 'file too small' }, 503);
    readRange(entry.url, 0, OPENSUB_CHUNK - 1, function (e1, head) {
      if (e1) return sendJson(res, { error: e1 }, 503);
      readRange(entry.url, entry.size - OPENSUB_CHUNK, entry.size - 1, function (e2, tail) {
        if (e2) return sendJson(res, { error: e2 }, 503);
        sendJson(res, { result: { hash: opensubHash(entry.size, head, tail), size: entry.size } });
      });
    });
  });
}

function handleRequest(req, res) {
  lastUse = Date.now();
  var parsed = urlmod.parse(req.url, true);
  var address = parseAddress(req.url);
  if (address) {
    return streamFor(address.hash, address.index, address.trackers, function (err, entry) {
      if (err) {
        dbg('torrent ' + address.hash + ': ' + err);
        res.writeHead(err === 'timeout' ? 504 : 503, { 'Content-Type': 'text/plain' });
        return res.end(String(err));
      }
      res.writeHead(302, { Location: entry.url, 'Cache-Control': 'no-store' });
      res.end();
    });
  }
  if (parsed.pathname === '/opensubHash') return answerOpensubHash(parsed.query, res);
  if (parsed.pathname === '/stats.json') return sendJson(res, stats || {});
  if (parsed.pathname === '/settings') return sendJson(res, { engine: 'sc-engine', running: !!engine });
  res.writeHead(404);
  res.end();
}

/* ---------- this server's life ---------- */
var listening = false;

function startStreamingServer() {
  if (listening || PROFILE.localTorrents === false) return;
  listening = true;
  var server = http.createServer(handleRequest);
  server.on('error', function (e) {
    /* after an update, the old version's server can hold the port until the TV restarts */
    dbg('torrent address not available: ' + (e.code || e.message));
    listening = false;
    setTimeout(startStreamingServer, 30000);
  });
  server.listen(SERVER_PORT, '127.0.0.1');
  var watch = setInterval(function () {
    if (!engine) return;
    send('stats');
    var quiet = Date.now() - lastUse > IDLE_STOP_MS;
    if (quiet && stats && !stats.streams && !stats.requests) stopEngine();
  }, 30000);
  if (watch.unref) watch.unref();
}

/* for Diagnostics: is the server in use answering, here or at the address given */
function streamingServerUp(cb) {
  if (remoteAddress()) probeAddress(remoteAddress(), cb, 3000);
  else portUp(SERVER_PORT, cb);
}

/* Playback waits for this before opening a torrent: the address answers as soon as this server
   does, and the engine starts with the first request. */
function waitForServer(cb) {
  if (PROFILE.localTorrents === false && !remoteAddress()) return cb(false);
  startStreamingServer();
  cb(true);
}

function engineStatus() {
  if (remoteAddress()) return { state: 'ready', remote: true };
  if (PROFILE.localTorrents === false) return { state: 'needs-server' };
  return { state: /\.js$/.test(ENGINE) || fs.existsSync(ENGINE) ? 'ready' : 'failed', running: !!engine };
}

module.exports = {
  chooseFile: chooseFile,
  engineStatus: engineStatus,
  opensubHash: opensubHash,
  portUp: portUp,
  startStreamingServer: startStreamingServer,
  streamingServerUp: streamingServerUp,
  waitForServer: waitForServer
};
