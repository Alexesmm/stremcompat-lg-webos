// Serving the television interface (beta.html template, beta-app.js), the logo and the font.

var fs = require('fs');
var path = require('path');
var { APP_VERSION, DIR, PROFILE, PROFILE_MODULE } = require('./config');
var { dbg } = require('./log');
var { safeScriptJson } = require('./text');

// The official Stremio logo mark, served at /logo.png (beta splash + settings/search backdrop).
var LOGO_PNG = null;

try {
  LOGO_PNG = fs.readFileSync(path.join(DIR, 'stremio-logo.png'));
} catch (e) {
  dbg('logo read failed: ' + e.message);
}

// beta.html is a template: it carries the version in its script URL and receives
// the browser-side profile where the <!--@profile--> marker stands.
function renderInterfaceHtml(buf) {
  var profileScript =
    '<script>window.__STREMIO_PROFILE__=' +
    safeScriptJson(PROFILE_MODULE.interfaceProfile(PROFILE)) +
    ';</script>';
  return buf
    .toString('utf8')
    .split('__APP_VERSION__')
    .join(APP_VERSION)
    .replace('<!--@profile-->', function () {
      return profileScript;
    });
}

function readUiAsset(name, embedded, cb) {
  var candidates = [path.join(DIR, name)];
  if (process.argv[1]) candidates.push(path.join(path.dirname(process.argv[1]), name));
  candidates.push(path.join(process.cwd(), name));
  var seen = {},
    index = process.env.TVSERVER_FORCE_EMBEDDED_UI === '1' ? candidates.length : 0,
    lastError = null;
  function next() {
    if (index >= candidates.length) {
      if (embedded && embedded.indexOf('__EMBEDDED_') !== 0) {
        try {
          dbg('[ui] serving embedded fallback for ' + name + (lastError ? ': ' + lastError.message : ''));
          return cb(null, Buffer.from(embedded, 'base64'));
        } catch (e) {
          lastError = e;
        }
      }
      return cb(lastError || new Error(name + ' unavailable'));
    }
    var file = candidates[index++];
    if (seen[file]) return next();
    seen[file] = true;
    fs.readFile(file, function (error, data) {
      if (!error && data && data.length) return cb(null, data);
      lastError = error || new Error('empty ' + file);
      next();
    });
  }
  next();
}

// Inter (SIL OFL 1.1, service/fonts/OFL.txt), Latin subset, regular and bold, as WOFF 1
// because Chromium 38 rejects current WOFF2: about 60 KB held in memory. A missing file only means the pages fall back to Arial.
var FONTS = {};
['inter-latin-400.woff', 'inter-latin-700.woff'].forEach(function (name) {
  try {
    FONTS['/fonts/' + name] = fs.readFileSync(path.join(DIR, 'fonts', name));
  } catch (e) {
    dbg('font read failed: ' + e.message);
  }
});

function logoPng() {
  return LOGO_PNG;
}

function fontFile(pathname) {
  return Object.prototype.hasOwnProperty.call(FONTS, pathname) ? FONTS[pathname] : null;
}

module.exports = {
  fontFile: fontFile,
  logoPng: logoPng,
  readUiAsset: readUiAsset,
  renderInterfaceHtml: renderInterfaceHtml
};
