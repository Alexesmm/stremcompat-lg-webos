// When a title counts as finished, shared by the interface and the player.
/* Without credit markers, "finished" means little is left: at most 2 minutes or 5% of
   the video, whichever is longer, and only past half of it so a short clip is not
   finished as soon as it starts. Continue Watching, the watched mark and the next
   episode all use this one rule. */
var FINISHED_MIN_LEFT_MS = 120000,
  FINISHED_MIN_LEFT_RATIO = 0.05;
function watchFinished(offsetMs, durationMs) {
  if (!(durationMs > 0) || !(offsetMs > 0) || offsetMs < durationMs / 2) return false;
  return durationMs - offsetMs <= Math.max(FINISHED_MIN_LEFT_MS, durationMs * FINISHED_MIN_LEFT_RATIO);
}
