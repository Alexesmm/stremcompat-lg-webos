// The torrent engine of the Android TV app: WebTorrent, inside the local server's own Node, since
// Android has no Node of its own to start bin/sc-engine with and the webOS engine does not run there.
// It speaks the same lines as sc-engine (service/server/streaming-server.js, scripts/lib/fake-engine.js):
// orders in, one JSON message per line out, and a link on 127.0.0.1 for each file played.
// spawn() answers with what streaming-server.js uses of a child process: stdin, stdout, exit, kill.
// scripts/package-android.js bundles it with WebTorrent into one file.
var EventEmitter = require('events');
var fs = require('fs');
var http = require('http');
var WebTorrent = require('webtorrent');

function removeAll(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch (e) {}
}

/* args: the folder for the files, how long a paused film keeps its link (ms), the cache limit (MiB) */
function spawn(args) {
  var folder = args[0],
    keepMs = parseInt(args[1], 10) || 15 * 60 * 1000,
    capBytes = (parseInt(args[2], 10) || 0) * 1048576;
  var child = new EventEmitter(),
    client = new WebTorrent({ maxConns: 60 }),
    streams = {},
    count = 0,
    open = 0,
    requests = 0,
    port = 0,
    finished = false;
  child.stdout = new EventEmitter();
  child.stdin = new EventEmitter();

  function say(value) {
    setImmediate(function () {
      if (!finished) child.stdout.emit('data', Buffer.from(JSON.stringify(value) + '\n'));
    });
  }
  function failure(tag, torrent, err) {
    say({ event: 'error', tag: tag, torrent: torrent, message: String((err && err.message) || err) });
  }

  /* each file played is a link: /<stream id>, with Range */
  var server = http.createServer(function (req, res) {
    var entry = streams[String(req.url).replace(/^\/+/, '')];
    if (!entry) {
      res.writeHead(404);
      return res.end();
    }
    entry.at = Date.now();
    var size = entry.file.length,
      m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || ''),
      start = m && m[1] ? parseInt(m[1], 10) : 0,
      end = m && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
    if (start >= size || start > end) {
      res.writeHead(416, { 'Content-Range': 'bytes */' + size });
      return res.end();
    }
    res.writeHead(m ? 206 : 200, {
      'Content-Type': 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Range': 'bytes ' + start + '-' + end + '/' + size
    });
    if (req.method === 'HEAD') return res.end();
    requests++;
    open++;
    var data = entry.file.createReadStream({ start: start, end: end });
    data.pipe(res);
    function done() {
      requests = Math.max(0, requests - 1);
      open = Math.max(0, open - 1);
      entry.at = Date.now();
      try {
        data.destroy();
      } catch (e) {}
    }
    res.on('close', done);
    data.on('error', function () {
      res.destroy();
    });
  });

  function command(line) {
    var p = String(line).split('\t'),
      t;
    if (p[0] === 'add') {
      var tag = p[1];
      t = client.get(tag);
      if (t) {
        say({ event: 'added', tag: tag, torrent: t.infoHash, message: '' });
        if (t.metadata) say({ event: 'metadata', tag: tag, torrent: t.infoHash, message: '' });
        return;
      }
      try {
        t = client.add(p[2], { path: folder });
      } catch (e) {
        return failure(tag, tag, e);
      }
      say({ event: 'added', tag: tag, torrent: tag, message: '' });
      t.on('metadata', function () {
        /* nothing downloads until a file is played */
        t.files.forEach(function (f) {
          f.deselect();
        });
        t.deselect(0, t.pieces.length - 1, false);
        say({ event: 'metadata', tag: tag, torrent: t.infoHash, message: '' });
      });
      t.on('error', function (err) {
        failure(tag, tag, err);
      });
    } else if (p[0] === 'files') {
      t = client.get(p[1]);
      if (!t || !t.files) return failure('', p[1], 'no such torrent');
      say({
        event: 'files',
        torrent: t.infoHash,
        files: t.files.map(function (f, i) {
          return { index: i, size: f.length, path: f.path };
        })
      });
    } else if (p[0] === 'prepare') {
      t = client.get(p[2]);
      var file = t && t.files && t.files[parseInt(p[3], 10)];
      if (!file) return failure(p[1], p[2], 'no such file');
      var id = 's' + ++count;
      streams[id] = { torrent: t, file: file, at: Date.now() };
      say({
        event: 'stream',
        tag: p[1],
        torrent: t.infoHash,
        message: '',
        file: parseInt(p[3], 10),
        size: file.length,
        stream: id,
        url: 'http://127.0.0.1:' + port + '/' + id
      });
    } else if (p[0] === 'stats') {
      var used = 0,
        peers = 0;
      client.torrents.forEach(function (x) {
        used += x.downloaded || 0;
        peers += x.numPeers || 0;
      });
      say({
        event: 'stats',
        torrents: client.torrents.length,
        streams: open,
        requests: requests,
        peers: peers,
        downBps: Math.round(client.downloadSpeed || 0),
        upBps: Math.round(client.uploadSpeed || 0),
        diskUsed: used,
        diskCap: capBytes || null
      });
    }
  }

  /* a link left alone longer than a paused film keeps it ends, and a torrent with none goes */
  var sweep = setInterval(function () {
    Object.keys(streams).forEach(function (id) {
      var entry = streams[id];
      if (open || Date.now() - entry.at < keepMs) return;
      delete streams[id];
      say({ event: 'stopped', torrent: entry.torrent.infoHash, stream: id });
      var used = Object.keys(streams).some(function (other) {
        return streams[other].torrent === entry.torrent;
      });
      if (!used) entry.torrent.destroy({ destroyStore: true });
    });
  }, 30000);

  function finish(code) {
    if (finished) return;
    finished = true;
    clearInterval(sweep);
    try {
      server.close();
    } catch (e) {}
    client.destroy(function () {
      removeAll(folder);
      child.emit('exit', code, null);
    });
  }

  var text = '';
  child.stdin.write = function (chunk) {
    text += String(chunk);
    var lines = text.split('\n');
    text = lines.pop();
    lines.forEach(function (line) {
      if (!line) return;
      try {
        command(line);
      } catch (e) {
        failure('', '', e);
      }
    });
    return true;
  };
  /* as sc-engine does when its input closes: stop and clear what it kept */
  child.stdin.end = function () {
    finish(0);
  };
  child.kill = function () {
    finish(null);
  };
  client.on('error', function (err) {
    say({ event: 'failed', message: String((err && err.message) || err) });
  });
  server.listen(0, '127.0.0.1', function () {
    port = server.address().port;
    say({
      event: 'ready',
      version: 'webtorrent ' + require('webtorrent/package.json').version,
      diskCap: capBytes || null
    });
  });
  return child;
}

module.exports = { spawn: spawn };
