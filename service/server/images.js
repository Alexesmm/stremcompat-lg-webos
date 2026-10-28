// Backdrop downscaling (/bgz) to keep decoded textures small.

var crypto = require('crypto');
var spawn = require('child_process').spawn;
var { FFMPEG, PROFILE } = require('./config');
var { localProxy } = require('./proxy');
var { NICE, lowerPriority } = require('./priority');

// ---- backdrop resizer: full-res art (1920x1080 = 8.3MB decoded) shrunk to 960x540
// (2MB decoded) for the BROWSING backdrop — sharp enough upscaled, 4x lighter on the
// decode cache that was thrashing during long sessions. LRU-cached per title.
var bgzCache = {},
  bgzOrder = [],
  bgzActive = 0;

function bgResize(q, res) {
  var u = q.u || '';
  if (!u) {
    res.writeHead(404);
    res.end();
    return;
  }
  var key = crypto.createHash('sha1').update(u).digest('hex').slice(0, 16);
  if (bgzCache[key]) {
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'max-age=86400',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(bgzCache[key]);
    return;
  }
  if (bgzActive >= PROFILE.backdropWorkers) {
    res.writeHead(204);
    res.end();
    return;
  } // client falls back to /small
  bgzActive++;
  var args = [
    '-nostdin',
    '-i',
    localProxy(u),
    '-frames:v',
    '1',
    '-vf',
    'scale=' + PROFILE.backdropWidth + ':-2',
    '-q:v',
    '6',
    '-f',
    'mjpeg',
    'pipe:1'
  ];
  var chunks = [],
    done = false,
    pr;
  function finish(ok) {
    if (done) return;
    done = true;
    clearTimeout(to);
    bgzActive--;
    var buf = Buffer.concat(chunks);
    if (ok && buf.length > 2000) {
      bgzCache[key] = buf;
      bgzOrder.push(key);
      while (bgzOrder.length > PROFILE.backdropCache) delete bgzCache[bgzOrder.shift()];
      try {
        res.writeHead(200, {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'max-age=86400',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(buf);
      } catch (e) {}
    } else {
      try {
        res.writeHead(204);
        res.end();
      } catch (e) {}
    }
  }
  try {
    pr = spawn(FFMPEG, args);
    lowerPriority(pr, NICE.INTERACTIVE);
  } catch (e) {
    bgzActive--;
    res.writeHead(204);
    res.end();
    return;
  }
  var to = setTimeout(function () {
    try {
      pr.kill('SIGKILL');
    } catch (e) {}
    finish(false);
  }, 9000);
  pr.stdout.on('data', function (d) {
    chunks.push(d);
  });
  pr.on('error', function () {
    finish(false);
  });
  pr.on('close', function (code) {
    finish(code === 0);
  });
}

module.exports = {
  bgResize: bgResize
};
