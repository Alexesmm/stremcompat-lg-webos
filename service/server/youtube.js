// Trailer URL resolution (YouTube Innertube with Piped fallbacks).

var { dbg } = require('./log');
var { fetchJson, postJsonUpstream } = require('./http-util');
var { localProxy } = require('./proxy');

// ---- YouTube trailer resolver ----
// Innertube ANDROID first (direct googlevideo mp4 when Google allows it), then
// public Piped instances (they proxy the stream themselves, so their URL plays
// from anywhere). The final URL is wrapped in our localhost /proxy so the TV's
// old TLS/CA stack never talks to the outside world.
var ytCache = {};

// videoId -> { lo, hi, at }  (lo=360p-ish, hi=720p-ish)
var PIPED = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.ducks.party',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.adminforge.de'
];

var pipedGood = -1;

// remember the instance that worked last
var pipedBad = {};

// instance idx -> last-failure ts (3min cooldown)
var ytFail = {};

function ytInnertube(vid, cb) {
  var body = JSON.stringify({
    videoId: vid,
    context: {
      client: { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, hl: 'en', gl: 'US' }
    },
    contentCheckOk: true,
    racyCheckOk: true
  });
  postJsonUpstream(
    'www.youtube.com',
    '/youtubei/v1/player?prettyPrint=false',
    {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
      'X-Youtube-Client-Name': '3',
      'X-Youtube-Client-Version': '19.09.37'
    },
    body,
    function (j) {
      if (!j) return cb(null);
      var fm = (j.streamingData && j.streamingData.formats) || [];
      var out = { lo: '', hi: '' };
      for (var i = 0; i < fm.length; i++) {
        var f = fm[i];
        if (!f.url || String(f.mimeType || '').indexOf('video/mp4') !== 0) continue;
        if (f.itag === 22) out.hi = f.url;
        else if (f.itag === 18) out.lo = f.url;
        else if (!out.lo) out.lo = f.url;
      }
      cb(out.lo || out.hi ? out : null);
    }
  );
}

function ytPiped(vid, idx, cb) {
  var now = Date.now(),
    fresh = [],
    cooling = [];
  function push(i) {
    (pipedBad[i] && now - pipedBad[i] < 180000 ? cooling : fresh).push(i);
  }
  if (pipedGood >= 0) push(pipedGood);
  for (var i = 0; i < PIPED.length; i++) if (i !== pipedGood) push(i);
  var order = fresh.concat(cooling); // throttled instances only as a last resort
  function tryOne(k) {
    if (k >= order.length) return cb(null);
    var ii = order[k];
    var u = PIPED[ii] + '/streams/' + encodeURIComponent(vid);
    fetchJson(u, function (j) {
      var vs = (j && j.videoStreams) || [];
      var out = { lo: '', hi: '' };
      for (var s = 0; s < vs.length; s++) {
        var v = vs[s];
        if (v.videoOnly || !v.url || String(v.mimeType || '').indexOf('video/mp4') !== 0) continue;
        var q = parseInt(v.quality, 10) || 0;
        if (q >= 480) {
          if (!out.hi) out.hi = v.url;
        } else if (!out.lo) out.lo = v.url;
      }
      if (out.lo || out.hi) {
        pipedGood = ii;
        delete pipedBad[ii];
        dbg('[yt] piped ok via ' + PIPED[ii]);
        return cb(out);
      }
      if (!j) pipedBad[ii] = Date.now(); // network/parse fail -> cool this instance down
      tryOne(k + 1);
    });
  }
  tryOne(0);
}

function ytResolve(vid, lq, cb) {
  if (!/^[\w-]{6,16}$/.test(vid)) return cb('', 'bad id');
  function pick(cc) {
    var u = lq ? cc.lo || cc.hi : cc.hi || cc.lo;
    return u ? localProxy(u) : ''; // play through our proxy: node's TLS, Range honoured
  }
  var c = ytCache[vid];
  if (c && Date.now() - c.at < 2 * 3600 * 1000) {
    var u0 = pick(c);
    return cb(u0, u0 ? '' : 'no format');
  }
  if (ytFail[vid] && Date.now() - ytFail[vid] < 180000) return cb('', 'unavailable'); // retry after 3min (mirror outages recover)
  ytInnertube(vid, function (a) {
    if (a) {
      a.at = Date.now();
      ytCache[vid] = a;
      return cb(pick(a), '');
    }
    ytPiped(vid, 0, function (b) {
      if (b) {
        b.at = Date.now();
        ytCache[vid] = b;
        return cb(pick(b), '');
      }
      ytFail[vid] = Date.now();
      dbg('[yt] ' + vid + ' unresolved');
      cb('', 'unavailable');
    });
  });
}

module.exports = {
  ytResolve: ytResolve
};
