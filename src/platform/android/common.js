// What differs between TV platforms, Android TV here. src/platform/lg has the same functions.
// The app (android/) runs the local server in its own process and opens the pages from it, as
// on webOS; window.AndroidApp is what the app offers the page.
/* FFmpeg and FFprobe run when the TV lets the app start them; the app tries once at start */
var HAS_MEDIA_TOOLS = !!(window.AndroidApp && window.AndroidApp.hasMediaTools());
function appUrl(path) {
  return path;
}
/* the app turns the remote's Back into 461, the key webOS sends */
function isRemoteBack(k) {
  return k === 461 || k === 27;
}
function isBackKey(k) {
  return isRemoteBack(k) || k === 8;
}
/* the server lives inside the app and starts with it */
function startService(serviceId, cb) {
  cb(true);
}
