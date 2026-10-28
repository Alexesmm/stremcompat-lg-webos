// Short-lived cache of addon stream lists, so a prefetched next episode opens at once.

var { PROFILE } = require('./config');
var { fetchAddonJson } = require('./http-util');

/* Only stream lists are cached: the player asks for the next episode's lists while its
   panel is up (player up-next.js) and the title page asks again a few minutes later.
   Requests already in flight are shared instead of sent twice. */
var TTL_MS = 5 * 60 * 1000,
  MAX_ENTRIES = PROFILE.lowMemory ? 4 : 8,
  cache = {},
  order = [],
  waiting = {};

function isStreamList(u) {
  return /\/stream\/[^/?#]+\/[^/?#]+\.json(?:[?#]|$)/.test(String(u || ''));
}

function cachedAddonJson(u, cb) {
  if (!isStreamList(u)) return fetchAddonJson(u, cb);
  var hit = cache[u];
  if (hit && Date.now() - hit.at < TTL_MS) return cb(hit.json);
  if (waiting[u]) {
    waiting[u].push(cb);
    return;
  }
  waiting[u] = [cb];
  fetchAddonJson(u, function (json) {
    var callbacks = waiting[u] || [];
    delete waiting[u];
    if (json) {
      if (!cache[u]) order.push(u);
      cache[u] = { at: Date.now(), json: json };
      while (order.length > MAX_ENTRIES) delete cache[order.shift()];
    }
    callbacks.forEach(function (fn) {
      fn(json);
    });
  });
}

module.exports = {
  cachedAddonJson: cachedAddonJson
};
