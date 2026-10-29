// XHR helpers. Addon GETs and Stremio API POSTs go through the local bridges in tvserver.js.
function xhrGetUrl(u) {
  return /^https?:\/\//i.test(String(u || '')) ? '/addon?u=' + encodeURIComponent(u) : u;
}
/* cb(json, failure): failure is null on success, otherwise 'timeout', 'offline'
   (the local service did not answer), 'unavailable' (HTTP error, e.g. the addon
   bridge's 502) or 'invalid' (the body was not JSON). */
function xhrJson(u, cb, tmo) {
  var done = false;
  try {
    var x = new XMLHttpRequest();
    x.open('GET', xhrGetUrl(u), true);
    x.onreadystatechange = function () {
      if (x.readyState === 4 && !done) {
        done = true;
        var j = null,
          failure = null;
        if (!x.status) failure = 'offline';
        else if (x.status >= 400) failure = 'unavailable';
        try {
          j = JSON.parse(x.responseText);
        } catch (e) {
          failure = failure || 'invalid';
        }
        cb(failure ? null : j, failure);
      }
    };
    x.send();
    setTimeout(function () {
      if (!done) {
        done = true;
        try {
          x.abort();
        } catch (e) {}
        cb(null, 'timeout');
      }
    }, tmo || 14000);
    return x;
  } catch (e) {
    cb(null, 'offline');
    return null;
  }
}
/* After a request failed: asks the local server whether Stremio answers at all, so the
   screen can say the TV has no connection instead of a vague error. cb(code) gets the
   network error (such as ENOTFOUND or ETIMEDOUT), or '' when Stremio is reachable or
   the local server itself did not answer. Never runs while things work. */
function checkConnection(cb) {
  xhrJson(
    '/netcheck',
    function (j) {
      cb(j && j.ok === false ? String(j.code || 'ERROR') : '');
    },
    15000
  );
}
function apiPostUrl(u) {
  var p = API + '/api/';
  return String(u || '').indexOf(p) === 0
    ? '/stremioapi?path=' + encodeURIComponent(String(u).slice(API.length))
    : u;
}
function postJson(u, body, cb, tmo) {
  var done = false;
  try {
    var x = new XMLHttpRequest();
    x.open('POST', apiPostUrl(u), true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.onreadystatechange = function () {
      if (x.readyState === 4 && !done) {
        done = true;
        var j = null;
        try {
          j = JSON.parse(x.responseText);
        } catch (e) {}
        cb(j);
      }
    };
    x.send(JSON.stringify(body));
    setTimeout(function () {
      if (!done) {
        done = true;
        try {
          x.abort();
        } catch (e) {}
        cb(null);
      }
    }, tmo || 14000);
  } catch (e) {
    cb(null);
  }
}
