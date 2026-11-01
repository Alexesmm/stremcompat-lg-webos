// How fast the TV's connection is, and whether a newer version exists. Both are asked of the outside
// at most once in a while, and both just answer nothing when the TV cannot reach it.

var https = require('https');
var urlmod = require('url');
var { APP_VERSION, PROFILE } = require('./config');
var { fetchJson, sendJson } = require('./http-util');

var SPEED_SAMPLE = 'https://images.metahub.space/background/large/tt0468569/img';
var SPEED_LIFETIME_MS = 10 * 60 * 1000;
var SPEED_LIMIT_MS = 4000;
var UPDATE_LIFETIME_MS = 6 * 60 * 60 * 1000;

var measured = null;

function toMbps(bytes, seconds) {
  return Math.round((bytes * 8) / seconds / 100000) / 10;
}

/* a known image of about 650 KB, timed from its first byte to its last */
function connectionSpeed(req, res) {
  if (measured && Date.now() - measured.at < SPEED_LIFETIME_MS) return sendJson(res, { mbps: measured.mbps });
  var answered = false;
  var firstByte = 0;
  var bytes = 0;
  function answer(mbps) {
    if (answered) return;
    answered = true;
    if (mbps) measured = { mbps: mbps, at: Date.now() };
    sendJson(res, { mbps: mbps || 0 });
  }
  var request = https.get(urlmod.parse(SPEED_SAMPLE), function (response) {
    response.on('data', function (chunk) {
      firstByte = firstByte || Date.now();
      bytes += chunk.length;
    });
    response.on('end', function () {
      var seconds = (Date.now() - firstByte) / 1000;
      answer(bytes > 100000 && seconds > 0 ? toMbps(bytes, seconds) : 0);
    });
  });
  request.on('error', function () {
    answer(0);
  });
  setTimeout(function () {
    /* slower than this is still a measure: what arrived in the time allowed */
    answer(toMbps(bytes, SPEED_LIMIT_MS / 1000));
    request.abort();
  }, SPEED_LIMIT_MS);
}

function isNewer(candidate, current) {
  var a = String(candidate).split('.'),
    b = String(current).split('.');
  for (var i = 0; i < 3; i++) {
    var difference = (parseInt(a[i], 10) || 0) - (parseInt(b[i], 10) || 0);
    if (difference) return difference > 0;
  }
  return false;
}

var latest = null;

function checkUpdate(req, res) {
  var address = PROFILE.updateManifest;
  function answer() {
    var version = latest && latest.version;
    sendJson(res, version && isNewer(version, APP_VERSION) ? { version: version } : {});
  }
  if (!address || (latest && Date.now() - latest.at < UPDATE_LIFETIME_MS)) return answer();
  fetchJson(address, function (manifest) {
    latest = { version: manifest && manifest.version, at: Date.now() };
    answer();
  });
}

module.exports = {
  checkUpdate: checkUpdate,
  connectionSpeed: connectionSpeed,
  isNewer: isNewer
};
