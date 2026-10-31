// The bare player page assembled from service/player assets.

var fs = require('fs');
var path = require('path');
var { DIR, PORT, SERVICE_ID } = require('./config');
var { dbg } = require('./log');
var { EMBEDDED_PLAYER_B64 } = require('./embedded');
var { safeScriptJson } = require('./text');

function loadPlayerAssets() {
  var names = ['player.css', 'player-body.html', 'player-client.js'],
    text = {},
    embedded = null;
  names.forEach(function (name) {
    if (process.env.TVSERVER_FORCE_EMBEDDED_UI !== '1') {
      try {
        text[name] = fs.readFileSync(path.join(DIR, 'player', name), 'utf8');
      } catch (e) {
        dbg('[player] ' + name + ' read failed: ' + e.message);
      }
    }
    if (!text[name] && EMBEDDED_PLAYER_B64.indexOf('__EMBEDDED_') !== 0) {
      if (!embedded) embedded = JSON.parse(Buffer.from(EMBEDDED_PLAYER_B64, 'base64').toString('utf8'));
      text[name] = embedded[name] || '';
    }
  });
  function joined(name) {
    return String(text[name] || '').replace(/\r?\n/g, '');
  }
  return {
    css: joined('player.css'),
    body: joined('player-body.html'),
    client: String(text['player-client.js'] || '')
  };
}

var PLAYER = loadPlayerAssets();

function cleanTitle(stream) {
  // Prefer a human title from the description (addons put "🎬 Movie (Year)" on
  // the first line); fall back to a cleaned filename; then the stream name.
  var desc = stream.description || stream.title || '';
  var first = (desc.split('\n')[0] || '').replace(/^[^0-9A-Za-z(]+/, '').trim();
  if (first && first.length >= 2) return first;
  var fn = stream.behaviorHints && stream.behaviorHints.filename;
  if (fn) {
    return fn
      .replace(/\.[^.]+$/, '')
      .replace(/[._]/g, ' ')
      .replace(
        /\b(1080p|720p|2160p|4k|web[- ]?dl|bluray|x264|x265|h ?264|h ?265|hevc|amzn|ddp?5 1|aac|atmos)\b.*$/i,
        ''
      )
      .trim();
  }
  return stream.name || 'Stremio';
}

/* What the player needs to know about this stream, by the names its code uses. */
function playerConstants(stream, ctx) {
  var streamUrl = stream.url || '';
  ctx = ctx || {};
  var streamHeaders = stream.headers || {};
  if (ctx.streamRef && (stream.notWebReady || Object.keys(streamHeaders).length)) {
    streamUrl = 'http://127.0.0.1:' + PORT + '/proxy?ref=' + encodeURIComponent(ctx.streamRef);
  }
  var meta = ctx.meta || {};
  var title = meta.name || cleanTitle(stream);
  var nextVid = ctx.nextVid || '';
  // The title page of the next episode: where the player goes when it cannot start that
  // episode by itself (up-next.js).
  var nextHref = !nextVid
    ? ''
    : '/beta#detail/' +
      encodeURIComponent(ctx.type || '') +
      '/' +
      encodeURIComponent(ctx.id || '') +
      '/' +
      encodeURIComponent(nextVid);
  return {
    URL: streamUrl,
    ADDON: stream.addon || '',
    QUALITY: stream.quality || '',
    TITLE: title,
    TYPE: ctx.type || '',
    ID: ctx.id || '',
    VID: ctx.vid || '',
    LOGO: meta.logo || '',
    BG: meta.background || '',
    POSTER: meta.poster || '',
    SEASON: ctx.season || '',
    EPISODE: ctx.episode || '',
    EPTITLE: ctx.epTitle || '',
    NEXTVID: nextVid,
    NEXTHREF: nextHref,
    BACK: ctx.back || '',
    NEXTTITLE: ctx.nextTitle || '',
    NEXTTHUMB: ctx.nextThumb || '',
    SNAME: String((stream.name || '') + ' ' + (stream.title || stream.description || '')).slice(0, 400),
    CERT: (ctx.meta && ctx.meta.cert) || '',
    COMPAT: stream.compat || '',
    BINGE: stream.bingeGroup || '',
    SERVICE_ID: SERVICE_ID,
    APP_PORT: PORT
  };
}

function playerPage(stream, ctx) {
  var constants = playerConstants(stream, ctx);
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>' +
    PLAYER.css +
    '</style></head><body>' +
    PLAYER.body +
    '<script>(function(){var ' +
    Object.keys(constants)
      .map(function (name) {
        return name + '=' + safeScriptJson(constants[name]);
      })
      .join(',') +
    ';' +
    PLAYER.client +
    '})();</script></body></html>'
  );
}

module.exports = {
  playerConstants: playerConstants,
  playerPage: playerPage
};
