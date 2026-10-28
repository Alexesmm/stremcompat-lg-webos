// CPU priority for the ffmpeg/ffprobe helpers.

var os = require('os');
var { dbg } = require('./log');

/* The TV has a weak ARM CPU shared with the streaming server and the interface.
   Helpers run with a higher nice value so they never compete with playback:
   INTERACTIVE for work the viewer is waiting on (backdrops, probes, track lists),
   SUBTITLES for the embedded-subtitle reader that must keep ahead of the playhead,
   BACKGROUND for scrub-preview sprites, which nobody waits on. */
var NICE = { INTERACTIVE: 5, SUBTITLES: 10, BACKGROUND: 15 };

function lowerPriority(pr, nice) {
  if (!pr || !pr.pid) return;
  try {
    os.setPriority(pr.pid, nice);
  } catch (e) {
    dbg('[priority] setPriority failed: ' + e.message);
  }
}

module.exports = {
  NICE: NICE,
  lowerPriority: lowerPriority
};
