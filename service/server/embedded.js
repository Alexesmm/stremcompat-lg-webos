// Copies of the interface and player assets, embedded by scripts/build-stage.js.

/* Replaced with the profile-specific, verified assets during packaging. Keeping
   an embedded copy makes the low-storage webOS 3 build independent of service
   working-directory and package-file lookup quirks. */
var EMBEDDED_BETA_HTML_B64 = '__EMBEDDED_BETA_HTML_B64__';

var EMBEDDED_BETA_APP_B64 = '__EMBEDDED_BETA_APP_B64__';

// ---------- bare-page player ----------
// The player page is assembled from service/player/: player.css and player-body.html
// (one rule or element per line, joined without separators) and player-client.js
// (ES5 for Chromium 38/53). playerPage() only prepends the per-stream constants.
// Like the interface, the build embeds a copy so a lookup failure on webOS 3 cannot
// break playback.
var EMBEDDED_PLAYER_B64 = '__EMBEDDED_PLAYER_B64__';

module.exports = {
  EMBEDDED_BETA_APP_B64: EMBEDDED_BETA_APP_B64,
  EMBEDDED_BETA_HTML_B64: EMBEDDED_BETA_HTML_B64,
  EMBEDDED_PLAYER_B64: EMBEDDED_PLAYER_B64
};
