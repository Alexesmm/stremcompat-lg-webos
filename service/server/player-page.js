// The player's page: its files, with what it needs to know about the stream it will play.

var fs = require('fs');
var path = require('path');
var { DIR, PORT, SERVICE_ID } = require('./config');
var { dbg } = require('./log');
var { EMBEDDED_PLAYER_B64 } = require('./embedded');
var { nextEpisodeId } = require('./episodes');
var { fetchJson } = require('./http-util');
var { waitForServer } = require('./streaming-server');
var { safeScriptJson } = require('./text');
var { rememberVideos, rememberedVideos } = require('./watched');

var TORRENT_ADDRESS = /^https?:\/\/(?:127\.0\.0\.1|localhost):11470\//i;
var ARTWORK_WAIT_MS = 2500;
/* where a release name stops being a title */
var RELEASE_WORDS =
  /\b(1080p|720p|2160p|4k|web[- ]?dl|bluray|x264|x265|h ?264|h ?265|hevc|amzn|ddp?5 1|aac|atmos)\b.*$/i;

/* ---------- the player's files ---------- */
function embeddedFiles() {
  if (EMBEDDED_PLAYER_B64.indexOf('__EMBEDDED_') === 0) return {};
  return JSON.parse(Buffer.from(EMBEDDED_PLAYER_B64, 'base64').toString('utf8'));
}

function readPlayerFile(name, embedded) {
  if (process.env.SC_SERVER_FORCE_EMBEDDED_UI !== '1') {
    try {
      return fs.readFileSync(path.join(DIR, 'player', name), 'utf8');
    } catch (e) {
      dbg('[player] ' + name + ' read failed: ' + e.message);
    }
  }
  return embedded()[name] || '';
}

var PLAYER_FILES = (function () {
  var cached = null;
  function embedded() {
    cached = cached || embeddedFiles();
    return cached;
  }
  function oneLine(name) {
    return readPlayerFile(name, embedded).replace(/\r?\n/g, '');
  }
  return {
    css: oneLine('player.css'),
    body: oneLine('player-body.html'),
    client: readPlayerFile('player-client.js', embedded)
  };
})();

/* ---------- what is known about the title ---------- */
function titleFromStream(stream) {
  /* addons put something like "Movie (Year)" on the first line of the description */
  var written = String(stream.description || stream.title || '').split('\n')[0];
  var firstLine = written.replace(/^[^0-9A-Za-z(]+/, '').trim();
  if (firstLine.length >= 2) return firstLine;
  var fileName = stream.behaviorHints && stream.behaviorHints.filename;
  if (fileName)
    return fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[._]/g, ' ')
      .replace(RELEASE_WORDS, '')
      .trim();
  return stream.name || 'StremCompat';
}

function addEpisodeDetails(context, videos) {
  var parts = context.vid.split(':');
  context.episode = parts[parts.length - 1];
  context.season = parts[parts.length - 2];
  context.nextVid = nextEpisodeId(videos, context.vid);
  rememberVideos(context.id, videos);
  (videos || []).forEach(function (video) {
    var name = video.name || video.title || '';
    if (video.id === context.vid) context.epTitle = name;
    if (video.id === context.nextVid) {
      context.nextTitle = name;
      context.nextThumb = video.thumbnail || '';
    }
  });
}

/* Artwork and episode details, fetched here so the loading screen shows the logo at once. It
   waits only a moment for them; a torrent also waits for its address to answer. */
function playerContext(stream, query, done) {
  var context = {
    type: query.type || '',
    id: query.id || '',
    vid: query.vid || '',
    back: query.back || '',
    streamRef: query.ref || '',
    meta: null
  };
  var artworkSettled = false,
    isEpisode = context.vid.indexOf(':') >= 0;
  function ready() {
    if (!TORRENT_ADDRESS.test(stream.url || '')) return done(context);
    waitForServer(function (up) {
      context.streamServerReady = up;
      done(context);
    });
  }
  if (!context.type || !context.id) return ready();
  /* Without an answer in time the next episode still comes from the list kept from an earlier
     play of this series, or is the next number: the player cannot learn it afterwards. */
  function settled() {
    if (artworkSettled) return;
    artworkSettled = true;
    if (isEpisode && !context.meta) addEpisodeDetails(context, rememberedVideos(context.id));
    ready();
  }
  var address =
    'https://v3-cinemeta.strem.io/meta/' +
    encodeURIComponent(context.type) +
    '/' +
    encodeURIComponent(context.id) +
    '.json';
  fetchJson(address, function (answer) {
    var meta = (answer && answer.meta) || {};
    if (artworkSettled) return rememberVideos(context.id, meta.videos);
    context.meta = {
      name: meta.name || '',
      logo: meta.logo || '',
      background: meta.background || meta.poster || '',
      poster: meta.poster || '',
      cert: meta.certification || ''
    };
    if (isEpisode) addEpisodeDetails(context, meta.videos);
    settled();
  });
  setTimeout(settled, ARTWORK_WAIT_MS);
}

/* A source with headers, or one the TV cannot read directly, goes through the proxy. */
function playableAddress(stream, context) {
  var needsProxy = stream.notWebReady || Object.keys(stream.headers || {}).length > 0;
  if (context.streamRef && needsProxy)
    return 'http://127.0.0.1:' + PORT + '/proxy?ref=' + encodeURIComponent(context.streamRef);
  return stream.url || '';
}

/* where the player goes when it cannot start the next episode by itself (up-next.js) */
function nextEpisodePage(context) {
  if (!context.nextVid) return '';
  return (
    '/beta#detail/' +
    [context.type || '', context.id || '', context.nextVid].map(encodeURIComponent).join('/')
  );
}

/* What the player needs to know about this stream, by the names its code uses. */
function playerConstants(stream, context) {
  var ctx = context || {};
  var meta = ctx.meta || {};
  return {
    URL: playableAddress(stream, ctx),
    ADDON: stream.addon || '',
    ADDONBASE: stream.addonBase || '',
    QUALITY: stream.quality || '',
    TITLE: meta.name || titleFromStream(stream),
    TYPE: ctx.type || '',
    ID: ctx.id || '',
    VID: ctx.vid || '',
    LOGO: meta.logo || '',
    BG: meta.background || '',
    POSTER: meta.poster || '',
    SEASON: ctx.season || '',
    EPISODE: ctx.episode || '',
    EPTITLE: ctx.epTitle || '',
    NEXTVID: ctx.nextVid || '',
    NEXTHREF: nextEpisodePage(ctx),
    BACK: ctx.back || '',
    NEXTTITLE: ctx.nextTitle || '',
    NEXTTHUMB: ctx.nextThumb || '',
    SNAME: String((stream.name || '') + ' ' + (stream.title || stream.description || '')).slice(0, 400),
    CERT: meta.cert || '',
    COMPAT: stream.compat || '',
    BINGE: stream.bingeGroup || '',
    SERVICE_ID: SERVICE_ID,
    APP_PORT: PORT
  };
}

function playerPage(stream, context) {
  var constants = playerConstants(stream, context);
  var declarations = Object.keys(constants).map(function (name) {
    return name + '=' + safeScriptJson(constants[name]);
  });
  return [
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>',
    PLAYER_FILES.css,
    '</style></head><body>',
    PLAYER_FILES.body,
    '<script>(function(){var ' + declarations.join(',') + ';',
    PLAYER_FILES.client,
    '})();</script></body></html>'
  ].join('');
}

module.exports = {
  playerConstants: playerConstants,
  playerContext: playerContext,
  playerPage: playerPage
};
