/*
 * Television profile shared by launch.js (system Node.js 0.12, so ES5 only) and
 * tvserver.js. scripts/build-stage.js writes the selected profiles/<name>.json
 * next to this file as profile.json. A source checkout without that file runs as
 * the 1920x1080 webOS 4 development profile below.
 */
var path = require('path');

var DEVELOPMENT_PROFILE = {
  profile: 'um4-armv7',
  appId: 'io.strem.tv',
  serviceId: 'io.strem.tv.server',
  version: 'dev',
  port: 8082,
  targetLabel: 'LG 50UM7500PSB / webOS 4.x',
  lowMemory: false,
  sourceCap: 60,
  libraryCap: 60,
  catalogCap: 16,
  catalogRowsCap: 24,
  discoverCap: 80,
  backdropWidth: 960,
  backdropCache: 24,
  backdropWorkers: 2
};

function loadProfile() {
  var out = {};
  var key;
  var built = null;
  try {
    built = require(path.join(__dirname, 'profile.json'));
  } catch (ignore) {}
  for (key in DEVELOPMENT_PROFILE) {
    if (Object.prototype.hasOwnProperty.call(DEVELOPMENT_PROFILE, key)) out[key] = DEVELOPMENT_PROFILE[key];
  }
  if (built) {
    for (key in built) {
      if (Object.prototype.hasOwnProperty.call(built, key)) out[key] = built[key];
    }
  }
  return out;
}

/* The subset the browser interface needs; injected into beta.html by tvserver.js. */
function interfaceProfile(profile) {
  return {
    id: profile.profile,
    serviceId: profile.serviceId,
    lowMemory: !!profile.lowMemory,
    sourceCap: profile.sourceCap,
    libraryCap: profile.libraryCap,
    catalogCap: profile.catalogCap,
    catalogRowsCap: profile.catalogRowsCap,
    discoverCap: profile.discoverCap
  };
}

module.exports = {
  current: loadProfile(),
  DEVELOPMENT_PROFILE: DEVELOPMENT_PROFILE,
  interfaceProfile: interfaceProfile
};
