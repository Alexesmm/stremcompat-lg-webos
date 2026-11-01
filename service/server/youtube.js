// Finding a playable MP4 for a trailer. YouTube's own API first, which gives a direct link when
// Google allows it, then public Piped servers, which serve the video themselves. Either way the
// player reaches it through the local proxy, so the TV's old TLS never talks to the outside.

var { dbg } = require('./log');
var { fetchJson, postJsonUpstream } = require('./http-util');
var { localProxy } = require('./proxy');

var LINK_LIFETIME_MS = 2 * 60 * 60 * 1000;
var RETRY_AFTER_MS = 3 * 60 * 1000;
var ANDROID_VERSION = '19.09.37';
var PIPED_SERVERS = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.ducks.party',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.adminforge.de'
];

/* video id -> { low, high, at } */
var found = {};
var unavailableAt = {};
var pipedFailedAt = {};
var lastGoodPiped = '';

function isMp4(format) {
  return String(format.mimeType || '').indexOf('video/mp4') === 0;
}

function hasLink(links) {
  return !!(links.low || links.high);
}

function fromYoutubeFormats(formats) {
  var links = { low: '', high: '' };
  formats.filter(isMp4).forEach(function (format) {
    if (!format.url) return;
    /* itag 22 is 720p, 18 is 360p; both come with their audio */
    if (format.itag === 22) links.high = format.url;
    else if (format.itag === 18 || !links.low) links.low = format.url;
  });
  return links;
}

function fromPipedStreams(streams) {
  var links = { low: '', high: '' };
  streams.filter(isMp4).forEach(function (stream) {
    if (stream.videoOnly || !stream.url) return;
    var slot = (parseInt(stream.quality, 10) || 0) >= 480 ? 'high' : 'low';
    links[slot] = links[slot] || stream.url;
  });
  return links;
}

function askYoutube(id, cb) {
  var request = JSON.stringify({
    videoId: id,
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: ANDROID_VERSION,
        androidSdkVersion: 30,
        hl: 'en',
        gl: 'US'
      }
    },
    contentCheckOk: true,
    racyCheckOk: true
  });
  var headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(request),
    'User-Agent': 'com.google.android.youtube/' + ANDROID_VERSION + ' (Linux; U; Android 11) gzip',
    'X-Youtube-Client-Name': '3',
    'X-Youtube-Client-Version': ANDROID_VERSION
  };
  postJsonUpstream(
    'www.youtube.com',
    '/youtubei/v1/player?prettyPrint=false',
    headers,
    request,
    function (answer) {
      var data = answer && answer.streamingData;
      var links = fromYoutubeFormats((data && data.formats) || []);
      cb(hasLink(links) ? links : null);
    }
  );
}

/* The server that worked last goes first; those that failed recently go last. */
function pipedOrder() {
  var now = Date.now();
  function resting(server) {
    return now - (pipedFailedAt[server] || 0) < RETRY_AFTER_MS;
  }
  var ordered = PIPED_SERVERS.filter(function (server) {
    return server !== lastGoodPiped;
  });
  if (lastGoodPiped) ordered.unshift(lastGoodPiped);
  return ordered
    .filter(function (server) {
      return !resting(server);
    })
    .concat(ordered.filter(resting));
}

function askPiped(id, servers, cb) {
  if (!servers.length) return cb(null);
  var server = servers[0];
  fetchJson(server + '/streams/' + encodeURIComponent(id), function (answer) {
    var links = fromPipedStreams((answer && answer.videoStreams) || []);
    if (hasLink(links)) {
      lastGoodPiped = server;
      delete pipedFailedAt[server];
      dbg('[yt] piped ok via ' + server);
      return cb(links);
    }
    if (!answer) pipedFailedAt[server] = Date.now();
    askPiped(id, servers.slice(1), cb);
  });
}

function linkFor(links, lowQuality) {
  var link = lowQuality ? links.low || links.high : links.high || links.low;
  return link ? localProxy(link) : '';
}

/* cb(address, ''), or cb('', why) */
function ytResolve(id, lowQuality, cb) {
  if (!/^[\w-]{6,16}$/.test(id)) return cb('', 'bad id');
  var known = found[id];
  if (known && Date.now() - known.at < LINK_LIFETIME_MS) {
    var link = linkFor(known, lowQuality);
    return cb(link, link ? '' : 'no format');
  }
  if (Date.now() - (unavailableAt[id] || 0) < RETRY_AFTER_MS) return cb('', 'unavailable');
  function finish(links) {
    if (!links) {
      unavailableAt[id] = Date.now();
      dbg('[yt] ' + id + ' unresolved');
      return cb('', 'unavailable');
    }
    links.at = Date.now();
    found[id] = links;
    cb(linkFor(links, lowQuality), '');
  }
  askYoutube(id, function (links) {
    if (links) finish(links);
    else askPiped(id, pipedOrder(), finish);
  });
}

module.exports = {
  ytResolve: ytResolve
};
