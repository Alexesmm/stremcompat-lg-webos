// Paths and the build profile (port, identity, limits) for the local server.

var path = require('path');

var DIR = path.join(__dirname, '..');

// the torrent engine (native/engine); the tests use scripts/lib/fake-engine.js
var ENGINE = process.env.TV_ENGINE || path.join(DIR, 'bin', 'sc-engine');

var LOG_FILE = process.env.TVSERVER_LOG || path.join(DIR, 'tvserver.log');

// Port, identity and memory limits come from the build profile (see profile.js).
var PROFILE_MODULE = require('../profile');

var PROFILE = PROFILE_MODULE.current;

var APP_VERSION = PROFILE.version;

var SERVICE_ID = PROFILE.serviceId;

var PORT = PROFILE.port;

var SERVER_PORT = 11470;

// ---- embedded subtitles via windowed ffmpeg ----
// This TV's native player never hands MKV sub cues to JS, so we demux them
// ourselves: ffprobe lists the text tracks, ffmpeg pulls ~10min at a time.
var FFMPEG = process.env.TV_FFMPEG || path.join(DIR, 'bin', 'ffmpeg');

// env override = offline testing on the Mac
var FFPROBE = process.env.TV_FFPROBE || path.join(DIR, 'bin', 'ffprobe');

module.exports = {
  APP_VERSION: APP_VERSION,
  DIR: DIR,
  ENGINE: ENGINE,
  FFMPEG: FFMPEG,
  FFPROBE: FFPROBE,
  LOG_FILE: LOG_FILE,
  PORT: PORT,
  PROFILE: PROFILE,
  PROFILE_MODULE: PROFILE_MODULE,
  SERVER_PORT: SERVER_PORT,
  SERVICE_ID: SERVICE_ID
};
