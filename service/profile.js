/*
 * Television profile shared by launch.js (system Node.js 0.12, so ES5 only) and
 * local-server.js. scripts/build-stage.js writes the selected profiles/<name>.json
 * next to this file as profile.json. A source checkout without that file runs as
 * the development profile below. One package serves every TV: useSmallTvLimits()
 * applies the profile's smallTv values on the weakest ones.
 */
var os = require('os');
var path = require('path');

var DEVELOPMENT_PROFILE = {
  profile: 'um4-armv7',
  appId: 'io.github.alexesmm.legacytv',
  serviceId: 'io.github.alexesmm.legacytv.server',
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
  backdropWorkers: 2,
  serverSemiSpaceMB: 2
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

/* webOS 3 shows the interface with Chromium 38, on the hardware that needs the lower limits */
function isSmallTv(userAgent) {
  if (process.env.TV_TIER) return process.env.TV_TIER === 'small';
  var chrome = /Chrome\/(\d+)/.exec(String(userAgent || ''));
  if (chrome && parseInt(chrome[1], 10) <= 38) return true;
  return os.totalmem() < 900 * 1048576;
}

/* Called when the interface first asks for its page, the moment the browser is known. */
function useSmallTvLimits(profile, userAgent) {
  var key;
  if (!profile.smallTv || profile.lowMemory || !isSmallTv(userAgent)) return;
  for (key in profile.smallTv) {
    if (Object.prototype.hasOwnProperty.call(profile.smallTv, key)) profile[key] = profile.smallTv[key];
  }
}

/* The subset the browser interface needs; injected into interface.html by local-server.js. */
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
  interfaceProfile: interfaceProfile,
  useSmallTvLimits: useSmallTvLimits
};
