// HTTP helpers: JSON responses, request bodies and bounded upstream fetches.

var http = require('http');
var https = require('https');
var urlmod = require('url');
var zlib = require('zlib');

function readJsonBody(req, maxBytes, cb) {
  var chunks = [],
    total = 0,
    done = false;
  function finish(v) {
    if (done) return;
    done = true;
    cb(v);
  }
  req.on('data', function (d) {
    total += d.length;
    if (total > maxBytes) {
      try {
        req.destroy();
      } catch (e) {}
      finish(null);
    } else chunks.push(d);
  });
  req.on('end', function () {
    if (done) return;
    try {
      finish(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch (e) {
      finish(null);
    }
  });
  req.on('error', function () {
    finish(null);
  });
}

// ---- helpers for meta/subtitle fetching ----
function sendJson(res, obj) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

function fetchUrl(u, cb, depth, maxBytes) {
  depth = depth || 0;
  maxBytes = maxBytes || 8 * 1024 * 1024;
  var pu,
    done = false;
  function finish(v) {
    if (done) return;
    done = true;
    cb(v);
  }
  try {
    pu = urlmod.parse(String(u || ''));
  } catch (e) {
    return finish(null);
  }
  if ((pu.protocol !== 'http:' && pu.protocol !== 'https:') || !pu.hostname || depth > 5) return finish(null);
  var lib = pu.protocol === 'https:' ? https : http;
  var req;
  try {
    req = lib.get(u, onres);
  } catch (e) {
    return finish(null);
  }
  function onres(r) {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
      r.resume();
      var loc = r.headers.location;
      if (loc.indexOf('http') !== 0)
        loc = pu.protocol + '//' + pu.host + (loc.charAt(0) === '/' ? '' : '/') + loc;
      done = true;
      return fetchUrl(loc, cb, depth + 1, maxBytes);
    }
    if (r.statusCode < 200 || r.statusCode >= 300) {
      r.resume();
      return finish(null);
    }
    var chunks = [],
      total = 0;
    r.on('data', function (d) {
      total += d.length;
      if (total > maxBytes) {
        try {
          r.destroy();
        } catch (e) {}
        finish(null);
      } else chunks.push(d);
    });
    r.on('end', function () {
      if (done) return;
      var buf = Buffer.concat(chunks);
      if (buf.length > 1 && buf[0] === 0x1f && buf[1] === 0x8b) {
        try {
          buf = zlib.gunzipSync(buf);
        } catch (e) {}
      }
      if (buf.length > maxBytes) return finish(null);
      finish(buf);
    });
  }
  req.on('error', function () {
    finish(null);
  });
  req.setTimeout(12000, function () {
    try {
      req.abort();
    } catch (e) {}
    finish(null);
  });
}

function fetchJson(u, cb) {
  fetchUrl(u, function (buf) {
    if (!buf) return cb(null);
    try {
      cb(JSON.parse(buf.toString('utf8')));
    } catch (e) {
      cb(null);
    }
  });
}

// Add-on GET bridge: Chromium 53 otherwise fails on modern TLS/CORS. Limit the
// response so a broken add-on cannot exhaust the TV's very small RAM budget.
function fetchAddonJson(u, cb, depth) {
  depth = depth || 0;
  var pu,
    done = false;
  function finish(v) {
    if (done) return;
    done = true;
    cb(v);
  }
  try {
    pu = urlmod.parse(String(u || ''));
  } catch (e) {
    return finish(null);
  }
  if ((pu.protocol !== 'http:' && pu.protocol !== 'https:') || !pu.hostname || depth > 5) return finish(null);
  var lib = pu.protocol === 'https:' ? https : http;
  var opts = {
    protocol: pu.protocol,
    hostname: pu.hostname,
    port: pu.port,
    path: pu.path,
    method: 'GET',
    headers: {
      'User-Agent': 'Stremio/4.4 webOS-TV',
      'Accept': 'application/json,*/*',
      'Accept-Encoding': 'gzip'
    }
  };
  var rq;
  try {
    rq = lib.request(opts, function (up) {
      if (up.statusCode >= 300 && up.statusCode < 400 && up.headers.location) {
        up.resume();
        var loc = up.headers.location;
        if (loc.indexOf('http') !== 0)
          loc = pu.protocol + '//' + pu.host + (loc.charAt(0) === '/' ? '' : '/') + loc;
        done = true;
        return fetchAddonJson(loc, cb, depth + 1);
      }
      if (up.statusCode < 200 || up.statusCode >= 300) {
        up.resume();
        return finish(null);
      }
      var chunks = [],
        total = 0;
      up.on('data', function (d) {
        total += d.length;
        if (total > 4 * 1024 * 1024) {
          try {
            up.destroy();
          } catch (e) {}
          finish(null);
        } else chunks.push(d);
      });
      up.on('end', function () {
        if (done) return;
        var buf = Buffer.concat(chunks);
        if (String(up.headers['content-encoding'] || '').toLowerCase() === 'gzip') {
          try {
            buf = zlib.gunzipSync(buf);
          } catch (e) {
            return finish(null);
          }
        }
        if (buf.length > 4 * 1024 * 1024) return finish(null);
        try {
          finish(JSON.parse(buf.toString('utf8')));
        } catch (e) {
          finish(null);
        }
      });
      up.on('error', function () {
        finish(null);
      });
    });
  } catch (e) {
    return finish(null);
  }
  rq.on('error', function () {
    finish(null);
  });
  rq.setTimeout(45000, function () {
    try {
      rq.abort();
    } catch (e) {}
    finish(null);
  });
  rq.end();
}

// videoId -> ts (10min negative cache; stop hammering dead videos)
function postJsonUpstream(host, path, headers, body, cb) {
  var req = https.request({ hostname: host, path: path, method: 'POST', headers: headers }, function (r) {
    var chunks = [];
    r.on('data', function (d) {
      chunks.push(d);
    });
    r.on('end', function () {
      var buf = Buffer.concat(chunks);
      if (buf.length > 1 && buf[0] === 0x1f && buf[1] === 0x8b) {
        try {
          buf = zlib.gunzipSync(buf);
        } catch (e) {}
      }
      try {
        cb(JSON.parse(buf.toString('utf8')));
      } catch (e) {
        cb(null);
      }
    });
  });
  req.on('error', function () {
    cb(null);
  });
  req.setTimeout(10000, function () {
    try {
      req.abort();
    } catch (e) {}
  });
  req.end(body);
}

module.exports = {
  fetchAddonJson: fetchAddonJson,
  fetchJson: fetchJson,
  fetchUrl: fetchUrl,
  postJsonUpstream: postJsonUpstream,
  readJsonBody: readJsonBody,
  sendJson: sendJson
};
