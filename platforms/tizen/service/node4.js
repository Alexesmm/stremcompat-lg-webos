// What the local server expects of Node that the TV's service runtime (Node 4.4.3 on Tizen 3
// and 4) lacks. ES5, loaded before anything else. Each piece only fills in what is missing.
var dns = require('dns');
var fs = require('fs');
var http = require('http');
var path = require('path');
var tls = require('tls');
var urlmod = require('url');

function mkdirs(dir) {
  try {
    mkdirSync(dir);
  } catch (e) {
    if (e.code === 'ENOENT' && path.dirname(dir) !== dir) {
      mkdirs(path.dirname(dir));
      mkdirSync(dir);
    } else if (e.code !== 'EEXIST') throw e;
  }
}
var mkdirSync = fs.mkdirSync;
fs.mkdirSync = function (dir, options) {
  if (options && options.recursive) return mkdirs(String(dir));
  return mkdirSync.apply(fs, arguments);
};

if (typeof global.URL === 'undefined')
  global.URL = function (u, base) {
    this.href = base ? urlmod.resolve(String(base), String(u)) : urlmod.format(urlmod.parse(String(u)));
  };

if (!http.ClientRequest.prototype.destroy)
  http.ClientRequest.prototype.destroy = function () {
    this.abort();
  };

if (!Buffer.alloc)
  Buffer.alloc = function (size) {
    var b = new Buffer(size);
    b.fill(0);
    return b;
  };

/* IPv4 first, as tvserver.js asks of newer Node: on a network that hands out IPv6 without a
   working route, requests hang. Falls back to whatever the system offers. */
var lookup = dns.lookup;
dns.lookup = function (host, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }
  if (typeof options === 'number') options = { family: options };
  options = options || {};
  if (options.family || options.all) return lookup.call(dns, host, options, cb);
  return lookup.call(dns, host, { family: 4, hints: options.hints }, function (err, address, family) {
    if (!err) return cb(null, address, family);
    lookup.call(dns, host, options, cb);
  });
};

/* The certificates this Node knows are from 2016, before Let's Encrypt's current chain. A
   single context holds the current list: read when the first secure connection is made,
   and shared by all of them, since the TV has little memory to spare. */
var context = null;
function secureContext() {
  if (!context) context = tls.createSecureContext({ ca: require('./roots.json') });
  return context;
}
var parts = process.versions.node.split('.');
if (parseInt(parts[0], 10) < 10 || process.env.STREMCOMPAT_FORCE_ROOTS) {
  var connect = tls.connect;
  tls.connect = function (options) {
    if (options && typeof options === 'object' && !options.ca && !options.secureContext)
      options.secureContext = secureContext();
    return connect.apply(tls, arguments);
  };
}
