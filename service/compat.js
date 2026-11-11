// What the local server expects of Node that a television's own runtime may lack: Node 0.12.2 on
// webOS 3 and 4, 4.4.3 on Tizen 3 and 4. ES5, loaded before anything else. Each piece only fills
// in what is missing, so on a current Node this file changes nothing.
var dns = require('dns');
var fs = require('fs');
var http = require('http');
var path = require('path');
var tls = require('tls');

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
var major = parseInt(process.versions.node.split('.')[0], 10);
var old = major < 10;

var mkdirSync = fs.mkdirSync;
if (old)
  fs.mkdirSync = function (dir, options) {
    if (options && options.recursive) return mkdirs(String(dir));
    return mkdirSync.apply(fs, arguments);
  };

if (!http.ClientRequest.prototype.destroy)
  http.ClientRequest.prototype.destroy = function () {
    this.abort();
  };

/* Node 4.4 has a Buffer.from, but the one every typed array inherits: it does not take encodings.
   It is read-only there, so a plain assignment is ignored: it has to be defined. */
if (!Buffer.alloc) {
  Buffer.alloc = function (size) {
    var b = new Buffer(size);
    b.fill(0);
    return b;
  };
  Object.defineProperty(Buffer, 'from', {
    value: function (value, encoding) {
      return new Buffer(value, encoding);
    },
    writable: true,
    configurable: true
  });
}

if (!Object.assign)
  Object.assign = function (target) {
    for (var i = 1; i < arguments.length; i++) {
      var from = arguments[i];
      if (from === null || from === undefined) continue;
      for (var key in from) {
        if (Object.prototype.hasOwnProperty.call(from, key)) target[key] = from[key];
      }
    }
    return target;
  };

/* IPv4 first, as local-server.js asks of newer Node: on a network that hands out IPv6 without a
   working route, requests hang. Falls back to whatever the system offers. */
if (old) {
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
}

/* The certificates these versions know are years old, from before Let's Encrypt's current chain.
   A single context holds the current list: read when the first secure connection is made, and
   shared by all of them, since the TV has little memory to spare. These versions have no option
   for a shared context (tls.connect always asks for a new one), so it is handed out here.
   Whoever asks for their own certificates still gets their own context. */
if (old || process.env.STREMCOMPAT_FORCE_ROOTS) {
  var createContext = tls.createSecureContext;
  var shared = null;
  tls.createSecureContext = function (options) {
    var o = options || {};
    if (o.ca || o.cert || o.key || o.pfx || o.crl || o.secureProtocol)
      return createContext.apply(tls, arguments);
    if (!shared) shared = createContext.call(tls, { ca: require('./roots.json') });
    return shared;
  };
}
