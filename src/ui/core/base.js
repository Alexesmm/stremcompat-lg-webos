// Service endpoints, the build profile, viewport metrics and DOM/event helpers.
/* ================= utils ================= */
var CIN = 'https://v3-cinemeta.strem.io';
var API = 'https://api.strem.io';
/* Injected by tvserver.js from the build profile; the fallback is the webOS 4 1920x1080 profile. */
var TV_PROFILE = window.__STREMIO_PROFILE__ || {
  id: 'um4-armv7',
  serviceId: 'io.strem.tv.server',
  lowMemory: false,
  sourceCap: 60,
  libraryCap: 60,
  catalogCap: 16,
  catalogRowsCap: 24,
  discoverCap: 80
};
function $(id) {
  return document.getElementById(id);
}
function viewportWidth() {
  var d = document.documentElement;
  return Math.max(640, (d && d.clientWidth) || window.innerWidth || 1920);
}
function contentWidth() {
  var d = document.documentElement,
    h = (d && d.clientHeight) || window.innerHeight || 1080;
  return viewportWidth() - (h <= 800 ? 112 : 176);
}
function on(target, name, handler, capture) {
  if (!target) return false;
  try {
    if (typeof target.addEventListener === 'function') {
      target.addEventListener(name, handler, !!capture);
      return true;
    }
    if (typeof target.attachEvent === 'function') {
      target.attachEvent('on' + name, function () {
        handler(window.event);
      });
      return true;
    }
    target['on' + name] = handler;
    return true;
  } catch (e) {
    try {
      target['on' + name] = handler;
      return true;
    } catch (ignore) {
      return false;
    }
  }
}
function bodyHas(name) {
  return (' ' + document.body.className + ' ').indexOf(' ' + name + ' ') >= 0;
}
function bodyAdd(name) {
  if (!bodyHas(name)) document.body.className += (document.body.className ? ' ' : '') + name;
}
function bodyRemove(name) {
  document.body.className = (' ' + document.body.className + ' ')
    .replace(new RegExp(' ' + name + ' ', 'g'), ' ')
    .replace(/^\s+|\s+$/g, '');
}
