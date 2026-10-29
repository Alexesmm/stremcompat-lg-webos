// One ffprobe per video, shared by the paused-screen badges and the embedded subtitle menu.

var spawn = require('child_process').spawn;
var { FFPROBE } = require('./config');
var { localProxy } = require('./proxy');
var { NICE, lowerPriority } = require('./priority');

/* Only the container header is needed (the track list, codecs, size), so ffprobe does not
   analyse the video: on a torrent that is still downloading while the TV plays it, that
   analysis was what ran out of time. A torrent gets longer, since anime MKVs carry MB of
   attached fonts before the first frame. */
var TORRENT_TIMEOUT_MS = 40000,
  TIMEOUT_MS = 20000;

var cache = {},
  cacheKeys = [],
  waiting = {};

/* cb({ streams, format }) on success, cb({ err, timedOut }) otherwise; a failure is not
   cached, so the next request tries again */
function probeStreams(u, cb) {
  if (cache[u]) return cb(cache[u]);
  if (waiting[u]) return waiting[u].push(cb);
  waiting[u] = [cb];
  var torrent = /^https?:\/\/(?:127\.0\.0\.1|localhost):11470\//i.test(u);
  var args = [
    '-v',
    'error',
    '-probesize',
    '1000000',
    '-analyzeduration',
    '0',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    localProxy(u)
  ];
  var out = [],
    err = [],
    done = false,
    timedOut = false,
    pr;
  function finish(result) {
    if (done) return;
    done = true;
    clearTimeout(to);
    if (!result) {
      try {
        var j = JSON.parse(Buffer.concat(out).toString('utf8'));
        result = { streams: j.streams || [], format: j.format || {} };
      } catch (e) {
        var line = Buffer.concat(err).toString('utf8').split('\n')[0] || '';
        result = { err: timedOut ? 'timeout' : line.slice(0, 160) || 'probe failed', timedOut: timedOut };
      }
    }
    if (!result.err) {
      if (!cache[u]) cacheKeys.push(u);
      cache[u] = result;
      while (cacheKeys.length > 20) delete cache[cacheKeys.shift()];
    }
    var list = waiting[u] || [];
    delete waiting[u];
    list.forEach(function (fn) {
      fn(result);
    });
  }
  try {
    pr = spawn(FFPROBE, args);
    lowerPriority(pr, NICE.INTERACTIVE);
  } catch (e) {
    return finish({ err: 'ffprobe missing' });
  }
  var to = setTimeout(
    function () {
      timedOut = true;
      try {
        pr.kill();
      } catch (e) {}
      finish();
    },
    torrent ? TORRENT_TIMEOUT_MS : TIMEOUT_MS
  );
  pr.stdout.on('data', function (d) {
    out.push(d);
  });
  pr.stderr.on('data', function (d) {
    err.push(d);
  });
  pr.on('error', function (e) {
    finish({ err: 'ffprobe error: ' + ((e && e.code) || e) });
  });
  pr.on('close', function () {
    finish();
  });
}

module.exports = {
  probeStreams: probeStreams
};
