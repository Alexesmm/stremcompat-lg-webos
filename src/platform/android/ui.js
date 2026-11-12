// Interface side of the Android TV platform.
function exitApp() {
  if (window.AndroidApp) window.AndroidApp.exit();
}
/* a trailer this app cannot play opens in the TV's YouTube app; false when it cannot */
function openYoutubeApp(videoId) {
  return !!(window.AndroidApp && window.AndroidApp.openYoutube(videoId));
}
/* these packages are not updated from inside the app */
function installUpdate(info, onStatus, done) {
  done(false);
}
function openUpdater() {
  return false;
}
