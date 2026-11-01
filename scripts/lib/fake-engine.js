// Stands in for bin/sc-engine in the tests: the same messages over stdin and stdout, and links
// that serve a generated file with Range. ES5, since the tests also run it on Node 0.12.
var http = require('http');

var SIZE = 200000;
function byteAt(i) {
  return (i * 7 + 13) % 251;
}

var server = http.createServer(function (req, res) {
  var m = /bytes=(\d+)-(\d+)/.exec(req.headers.range || '');
  var start = m ? parseInt(m[1], 10) : 0;
  var end = m ? Math.min(parseInt(m[2], 10), SIZE - 1) : SIZE - 1;
  var body = new Buffer(end - start + 1);
  for (var i = 0; i < body.length; i++) body[i] = byteAt(start + i);
  res.writeHead(m ? 206 : 200, { 'Content-Length': body.length, 'Accept-Ranges': 'bytes' });
  res.end(req.method === 'HEAD' ? undefined : body);
});

var streams = 0,
  magnets = [];
function say(value) {
  process.stdout.write(JSON.stringify(value) + '\n');
}

server.listen(0, '127.0.0.1', function () {
  var port = server.address().port;
  say({ event: 'ready', version: 'fake', memCap: 1, diskCap: 2 });
  var text = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', function (chunk) {
    text += chunk;
    var lines = text.split('\n');
    text = lines.pop();
    lines.forEach(function (line) {
      var p = line.split('\t');
      if (p[0] === 'add') {
        magnets.push(p[2]);
        if (p[1].indexOf('deadbeef') === 0) return say({ event: 'error', tag: p[1], torrent: p[1], message: 'bad torrent' });
        say({ event: 'added', tag: p[1], torrent: p[1], message: '' });
        say({ event: 'metadata', tag: p[1], torrent: p[1], message: '' });
      } else if (p[0] === 'files') {
        say({
          event: 'files',
          torrent: p[1],
          files: [
            { index: 0, size: 300, path: 'readme.txt' },
            { index: 1, size: SIZE, path: 'Movie/movie.mkv' },
            { index: 2, size: 5000, path: 'Movie/sample.mkv' }
          ]
        });
      } else if (p[0] === 'prepare') {
        streams++;
        say({
          event: 'stream',
          tag: p[1],
          torrent: p[2],
          message: '',
          file: parseInt(p[3], 10),
          size: p[3] === '1' ? SIZE : 5000,
          stream: 's' + streams,
          url: 'http://127.0.0.1:' + port + '/stream/' + p[2] + '/' + p[3]
        });
      } else if (p[0] === 'stats') {
        say({ event: 'stats', torrents: magnets.length, streams: streams, requests: 0, peers: 3, seeds: 1, downBps: 5, upBps: 1, memUsed: 0, memCap: 1, diskUsed: 0, diskCap: 2, magnets: magnets });
      }
    });
  });
  process.stdin.on('end', function () {
    process.exit(0);
  });
});
