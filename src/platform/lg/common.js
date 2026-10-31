// What differs between TV platforms, LG webOS here. src/platform/tizen has the same functions;
// the build picks one folder per platform, in both the interface and the player.
/* FFmpeg and FFprobe run on this platform: reduced artwork, technical badges, seek previews
   and subtitle extraction are available */
var HAS_MEDIA_TOOLS = true;
/* where a path of the app really is; on webOS the pages come from the local server */
function appUrl(path) {
  return path;
}
/* Back on the remote, for text boxes too (where 8 is the Delete key of the keyboard) */
function isRemoteBack(k) {
  return k === 461 || k === 27;
}
function isBackKey(k) {
  return isRemoteBack(k) || k === 8;
}
/* cb(true) when the system answered, cb(false) if it did not; the service may need a moment
   more before it listens */
function startService(serviceId, cb) {
  var done = false,
    bridge = null;
  function finish(ok) {
    if (done) return;
    done = true;
    bridge = null;
    cb(ok);
  }
  try {
    if (typeof PalmServiceBridge === 'undefined') {
      finish(false);
      return;
    }
    bridge = new PalmServiceBridge();
    bridge.onservicecallback = function () {
      finish(true);
    };
    bridge.call('luna://' + serviceId + '/start', '{}');
    setTimeout(function () {
      finish(false);
    }, 2600);
  } catch (e) {
    finish(false);
  }
}
