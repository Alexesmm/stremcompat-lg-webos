// What differs between TV platforms, Samsung Tizen here. src/platform/lg has the same functions.
/* programs other than the TV's own service runtime cannot run on Tizen, so no FFmpeg or FFprobe */
var HAS_MEDIA_TOOLS = false;
/* The pages are files inside the package, with <base> pointing every request at the local
   server: a path that leaves for another page has to name its file. */
var APP_ROOT = String(location.href)
  .replace(/[?#].*$/, '')
  .replace(/[^\/]*$/, '');
function appUrl(path) {
  var p = String(path)
    .replace(/^https?:\/\/[^\/]+/, '')
    .replace(/^\/+/, '');
  if (p.indexOf('play') === 0) return APP_ROOT + 'player.html' + p.slice(4);
  if (p.indexOf('beta') === 0) return APP_ROOT + 'index.html' + p.slice(4);
  return path;
}
function isRemoteBack(k) {
  return k === 10009 || k === 27;
}
function isBackKey(k) {
  return isRemoteBack(k) || k === 8;
}
function startService(serviceId, cb) {
  try {
    tizen.application.launchAppControl(
      new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/service'),
      serviceId,
      function () {
        cb(true);
      },
      function () {
        cb(false);
      }
    );
  } catch (e) {
    cb(false);
  }
}
/* Only Back, the arrows and OK reach a page by default. */
(function () {
  try {
    var keys = tizen.tvinputdevice.getSupportedKeys();
    for (var i = 0; i < keys.length; i++)
      if (/^(ColorF|Media|\d$)/.test(keys[i].name)) tizen.tvinputdevice.registerKey(keys[i].name);
  } catch (e) {}
})();
/* The service leaves by itself when nothing has asked it anything for a while, so the app
   leaves nothing running after it closes. A video playing from a link asks nothing. */
setInterval(function () {
  try {
    var x = new XMLHttpRequest();
    x.open('GET', '/health?alive=' + Date.now(), true);
    x.send();
  } catch (e) {}
}, 30000);
