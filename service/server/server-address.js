// Where the streaming server runs: on this TV (the default) or at an address the viewer gave.

var fs = require('fs');
var path = require('path');
var urlmod = require('url');
var { DIR, SERVER_PORT } = require('./config');
var { fetchJson } = require('./http-util');

var LOCAL_BASE = 'http://127.0.0.1:' + SERVER_PORT;
var LOCAL_PREFIX = /^https?:\/\/(?:127\.0\.0\.1|localhost):11470(?=\/)/i;
var FILE_NAME = 'server-address.json';
var PROBE_LIMIT_MS = 8000;

/* The home folder survives app updates and is shared by the editions of the app. */
function configDirs() {
  var dirs = [];
  if (process.env.HOME) dirs.push(path.join(process.env.HOME, '.stremcompat'));
  dirs.push(path.join(DIR, 'runtime-cache'));
  return dirs;
}

/* 'http://host[:port]' from what was typed, '' for this TV, null when it is not an address.
   Without a scheme the streaming server's own port is assumed. */
function normalizeAddress(raw) {
  var text = String(raw == null ? '' : raw).replace(/\s+/g, ''),
    typedScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  if (!text) return '';
  var pu = urlmod.parse(typedScheme ? text : 'http://' + text);
  if (pu.protocol !== 'http:' && pu.protocol !== 'https:') return null;
  if (pu.auth || pu.search || pu.hash || (pu.pathname && pu.pathname !== '/')) return null;
  if (!pu.hostname || !/^[a-z0-9.-]+$/i.test(pu.hostname)) return null;
  var port = pu.port || (typedScheme ? '' : String(SERVER_PORT)),
    base = pu.protocol + '//' + pu.hostname + (port ? ':' + port : '');
  return LOCAL_PREFIX.test(base + '/') ? '' : base;
}

function readStored() {
  var dirs = configDirs();
  for (var i = 0; i < dirs.length; i++) {
    try {
      var j = JSON.parse(fs.readFileSync(path.join(dirs[i], FILE_NAME), 'utf8'));
      return normalizeAddress(j.address) || '';
    } catch (e) {}
  }
  return '';
}

var remote = readStored();

function remoteAddress() {
  return remote;
}

/* The addon links name the server on this TV; with another one set, they go there. */
function streamingUrl(u) {
  return remote ? String(u || '').replace(LOCAL_PREFIX, remote) : String(u || '');
}

function isStreamingUrl(u) {
  u = String(u || '');
  return LOCAL_PREFIX.test(u) || (!!remote && u.indexOf(remote + '/') === 0);
}

function streamingBase() {
  return remote || LOCAL_BASE;
}

/* Does a streaming server answer there? Asks for its settings, then its stats, since other
   servers may offer only one of them. */
function probeAddress(base, cb, limitMs) {
  var done = false;
  function finish(ok) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    cb(ok);
  }
  var timer = setTimeout(function () {
    finish(false);
  }, limitMs || PROBE_LIMIT_MS);
  fetchJson(base + '/settings', function (j) {
    if (j && typeof j === 'object') return finish(true);
    fetchJson(base + '/stats.json', function (s) {
      finish(!!s && typeof s === 'object');
    });
  });
}

function storeAddress(address) {
  var dirs = configDirs(),
    body = JSON.stringify({ address: address });
  for (var i = 0; i < dirs.length; i++) {
    var file = path.join(dirs[i], FILE_NAME),
      tmp = file + '.tmp';
    try {
      fs.mkdirSync(dirs[i], { recursive: true });
      fs.writeFileSync(tmp, body);
      fs.renameSync(tmp, file);
      return true;
    } catch (e) {}
  }
  return false;
}

/* cb({ ok: true, address }) or cb({ ok: false, err: 'invalid' | 'unreachable' | 'disk' }).
   An address only replaces the current one after a server answered there. */
function setServerAddress(raw, cb) {
  var base = normalizeAddress(raw);
  if (base === null) return cb({ ok: false, err: 'invalid' });
  function save() {
    if (!storeAddress(base)) return cb({ ok: false, err: 'disk' });
    remote = base;
    cb({ ok: true, address: base });
  }
  if (!base) return save();
  probeAddress(base, function (up) {
    if (up) save();
    else cb({ ok: false, err: 'unreachable' });
  });
}

module.exports = {
  isStreamingUrl: isStreamingUrl,
  normalizeAddress: normalizeAddress,
  probeAddress: probeAddress,
  remoteAddress: remoteAddress,
  setServerAddress: setServerAddress,
  streamingBase: streamingBase,
  streamingUrl: streamingUrl
};
