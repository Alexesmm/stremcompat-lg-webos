// Requests this server makes on the interface's behalf, always with a limit on size and time,
// since one broken addon must not be able to fill the TV's small memory.

var http = require('http');
var https = require('https');
var urlmod = require('url');
var zlib = require('zlib');

var MAX_REDIRECTS = 5;
var FILE_LIMIT = 8 * 1024 * 1024;
var ADDON_LIMIT = 4 * 1024 * 1024;

function unpackGzip(buf) {
  var gzipped = buf.length > 1 && buf[0] === 0x1f && buf[1] === 0x8b;
  return gzipped ? zlib.gunzipSync(buf) : buf;
}

function collect(stream, limit, onDone) {
  var parts = [];
  var size = 0;
  stream.on('data', function (chunk) {
    size += chunk.length;
    if (size <= limit) parts.push(chunk);
    else {
      if (stream.destroy) stream.destroy();
      onDone('too large');
    }
  });
  stream.on('end', function () {
    onDone(null, Buffer.concat(parts));
  });
  stream.on('error', function (e) {
    onDone((e && e.code) || 'error');
  });
}

/* GET with redirects. cb(why, body): why is 'HTTP 503', 'timeout', 'too large', a network error
   code or 'error'; body is unpacked when it came gzipped. */
function download(address, settings, cb, hops) {
  var answered = false;
  function answer(why, body) {
    if (answered) return;
    answered = true;
    cb(why, body);
  }
  var target;
  try {
    target = urlmod.parse(String(address || ''));
  } catch (e) {
    return answer('error');
  }
  var secure = target.protocol === 'https:';
  if ((!secure && target.protocol !== 'http:') || !target.hostname || (hops || 0) > MAX_REDIRECTS)
    return answer('error');
  var request;
  try {
    request = (secure ? https : http).request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.path,
        method: 'GET',
        headers: settings.headers || {}
      },
      function (res) {
        var moved = res.statusCode >= 300 && res.statusCode < 400 && res.headers.location;
        if (moved) {
          res.resume();
          answered = true;
          return download(urlmod.resolve(target.href, res.headers.location), settings, cb, (hops || 0) + 1);
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          return answer('HTTP ' + res.statusCode);
        }
        collect(res, settings.limit, function (why, body) {
          if (why) return answer(why);
          try {
            body = unpackGzip(body);
          } catch (e) {
            return answer('invalid');
          }
          answer(body.length > settings.limit ? 'too large' : null, body);
        });
      }
    );
  } catch (e) {
    return answer('error');
  }
  request.on('error', function (e) {
    answer((e && e.code) || 'error');
  });
  request.setTimeout(settings.timeout, function () {
    answer('timeout');
    request.abort();
  });
  request.end();
}

function parseJson(buf) {
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch (e) {
    return null;
  }
}

/* cb(bytes), or cb(null) on any failure */
function fetchUrl(u, cb, hops, limit) {
  download(
    u,
    { limit: limit || FILE_LIMIT, timeout: 12000 },
    function (why, body) {
      cb(why ? null : body);
    },
    hops
  );
}

function fetchJson(u, cb) {
  fetchUrl(u, function (buf) {
    cb(buf ? parseJson(buf) : null);
  });
}

/* The addon bridge: old TV browsers fail on current TLS and CORS. cb(json, ''), or cb(null, why) */
function fetchAddonJson(u, cb) {
  var headers = {
    'User-Agent': 'Stremio/4.4 webOS-TV',
    'Accept': 'application/json,*/*',
    'Accept-Encoding': 'gzip'
  };
  download(u, { limit: ADDON_LIMIT, timeout: 45000, headers: headers }, function (why, body) {
    if (why) return cb(null, why);
    var json = parseJson(body);
    cb(json, json ? '' : 'invalid');
  });
}

function postJsonUpstream(host, path, headers, body, cb) {
  var answered = false;
  function answer(value) {
    if (answered) return;
    answered = true;
    cb(value);
  }
  var request = https.request(
    { hostname: host, path: path, method: 'POST', headers: headers },
    function (res) {
      collect(res, ADDON_LIMIT, function (why, data) {
        if (why) return answer(null);
        try {
          answer(parseJson(unpackGzip(data)));
        } catch (e) {
          answer(null);
        }
      });
    }
  );
  request.on('error', function () {
    answer(null);
  });
  request.setTimeout(10000, function () {
    answer(null);
    request.abort();
  });
  request.end(body);
}

function readJsonBody(req, maxBytes, cb) {
  var answered = false;
  collect(req, maxBytes, function (why, body) {
    if (answered) return;
    answered = true;
    cb(why ? null : parseJson(body));
  });
}

function sendJson(res, value) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(value));
}

module.exports = {
  fetchAddonJson: fetchAddonJson,
  fetchJson: fetchJson,
  fetchUrl: fetchUrl,
  postJsonUpstream: postJsonUpstream,
  readJsonBody: readJsonBody,
  sendJson: sendJson
};
