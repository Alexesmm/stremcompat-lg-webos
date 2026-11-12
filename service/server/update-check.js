// Whether a newer version exists, asked of the outside at most once in a while. It just answers
// nothing when the TV cannot reach it.

var { APP_VERSION, PROFILE } = require('./config');
var { fetchJson, sendJson } = require('./http-util');

var UPDATE_LIFETIME_MS = 6 * 60 * 60 * 1000;

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
    var reply = { current: APP_VERSION };
    /* the package and its checksum, for installing it from the app (Homebrew Channel) */
    if (version && isNewer(version, APP_VERSION)) {
      reply.version = version;
      reply.ipkUrl = latest.ipkUrl;
      reply.sha256 = latest.sha256;
    }
    sendJson(res, reply);
  }
  if (!address || (latest && Date.now() - latest.at < UPDATE_LIFETIME_MS)) return answer();
  fetchJson(address, function (manifest) {
    latest = {
      version: manifest && manifest.version,
      ipkUrl: (manifest && manifest.ipkUrl) || '',
      sha256: (manifest && manifest.ipkHash && manifest.ipkHash.sha256) || '',
      at: Date.now()
    };
    answer();
  });
}

module.exports = {
  checkUpdate: checkUpdate,
  isNewer: isNewer
};
