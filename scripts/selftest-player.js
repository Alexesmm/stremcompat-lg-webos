'use strict';

// Player behaviour that the Chromium 38 run cannot reach without real media:
// the next-episode countdown, per-title audio/subtitle memory and the subtitle lookup.
// Each case runs the player source modules in a fresh VM with small stubs.

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.resolve(__dirname, '..');
function src(name) {
  return fs.readFileSync(path.join(root, 'src', name), 'utf8');
}

function memoryStorage(initial) {
  var data = Object.assign({}, initial || {});
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; },
    data: data
  };
}
function element(id) {
  return { id: id, textContent: '', className: '', style: {}, addEventListener: function () {}, appendChild: function () {} };
}

// ---- next-episode countdown (up-next.js) ----
function countdown(autoCount, action) {
  var els = {}, timers = [], went = 0;
  var storage = memoryStorage({ uiLanguage: 'pt-BR', bingeAutoCount: String(autoCount) });
  var ctx = {
    SEASON: '1', EPISODE: '2', EPTITLE: '', BACK: 'beta', TYPE: 'series', ID: 'tt1',
    NEXTHREF: '/beta#detail/series/tt1/tt1:1:3', NEXTTITLE: 'Ep 3', NEXTVID: 'tt1:1:3', NEXTTHUMB: '',
    localStorage: storage,
    document: { getElementById: function (id) { return els[id] || (els[id] = element(id)); } },
    v: { addEventListener: function () {} },
    showBar: function () {}, saveProgress: function () {}, location: { replace: function () {} },
    lsGet: function (k, d) { var x = storage.getItem(k); return x == null ? d : x; },
    xhr: function () {}, streamAddonsIn: function () { return []; }, streamUrl: function () { return ''; },
    nextEp: function () { went++; },
    setTimeout: function (f) { timers.push(f); return timers.length; },
    clearTimeout: function () { timers.length = 0; }
  };
  vm.runInNewContext(src('shared/strings.js') + src('player/strings.js') + src('player/up-next.js') + ';startAutoNext();', ctx);
  var first = ctx.document.getElementById('npB').textContent;
  if (action === 'back') vm.runInNewContext('dismissNp()', ctx);
  while (timers.length) timers.shift()();
  return { first: first, label: ctx.document.getElementById('npL').textContent, went: went, count: storage.getItem('bingeAutoCount') };
}
var auto = countdown(0);
assert.strictEqual(auto.first, 'Próximo episódio em 10', 'countdown did not start at 10 seconds');
assert.strictEqual(auto.went, 1, 'countdown did not start the next episode');
assert.strictEqual(auto.count, '1', 'an automatic next episode was not counted');
var cancelled = countdown(0, 'back');
assert.strictEqual(cancelled.went, 0, 'Back did not cancel the countdown');
var asleep = countdown(3);
assert.strictEqual(asleep.label, 'Você ainda está assistindo?', 'three automatic episodes did not ask if anyone is watching');
assert.strictEqual(asleep.went, 0, 'the still-watching prompt continued on its own');

// ---- per-title audio, subtitles and delay (subtitles.js) ----
function subtitlePrefs(stored) {
  var storage = memoryStorage(stored);
  var ctx = {
    ID: 'tt9', TYPE: 'series', VID: '', URL: '', localStorage: storage,
    v: { addEventListener: function () {}, textTracks: [], currentTime: 0 },
    document: { getElementById: element, createElement: element },
    xhr: function () {}, showToast: function () {}, subEl: element('sub')
  };
  vm.runInNewContext(src('player/subtitles.js') + ';this.__out={sub:WANTSUB,aud:WANTAUD,delay:subDelay};', ctx);
  return ctx.__out;
}
var defaults = subtitlePrefs({ subsLang: 'por', enableDefaultAudioTrack: 'true', defaultAudioTrack: 'eng' });
assert.strictEqual(defaults.sub, 'por', 'Settings subtitle language was not used');
assert.strictEqual(defaults.aud, 'eng', 'Settings audio language was not used');
var remembered = subtitlePrefs({
  subsLang: 'por', enableDefaultAudioTrack: 'true', defaultAudioTrack: 'eng',
  tvtitle_tt9: JSON.stringify({ aud: 'jpn', sub: 'off', delay: 1.5 })
});
assert.strictEqual(remembered.aud, 'jpn', 'the audio chosen for this title did not win over Settings');
assert.strictEqual(remembered.sub, '', 'subtitles turned off for this title came back on');
assert.strictEqual(remembered.delay, 1.5, 'the subtitle delay for this title was not restored');

// ---- addon request URLs keep the installed link's query string (shared/stream-addons.js) ----
var shared = {};
vm.runInNewContext(src('shared/stream-addons.js'), shared);
var keyed = { transportUrl: 'https://latam.example/manifest.json?token=ABC', manifest: { name: 'Latam', resources: ['stream'], types: ['movie'] } };
var pathed = { transportUrl: 'https://torrentio.example/qualityfilter=4k/manifest.json', manifest: { name: 'Torrentio', resources: ['stream'], types: ['movie'] } };
var urls = shared.streamAddonsIn([keyed, pathed], 'movie').map(function (ad) { return shared.streamUrl(ad, 'movie', 'tt1'); });
assert.strictEqual(urls[0], 'https://latam.example/stream/movie/tt1.json?token=ABC', 'an addon key after manifest.json was dropped');
assert.strictEqual(urls[1], 'https://torrentio.example/qualityfilter=4k/stream/movie/tt1.json', 'a path-configured addon URL changed');

// ---- subtitle addons of the account (shared/stream-addons.js addonsFor) ----
var subAddons = [
  { transportUrl: 'https://opensubs.example/cfg/manifest.json?key=K', manifest: { name: 'OpenSubtitles', types: ['movie', 'series'], idPrefixes: ['tt'], resources: ['subtitles'] } },
  { transportUrl: 'https://anime.example/manifest.json', manifest: { name: 'Anime Subs', types: ['series'], resources: [{ name: 'subtitles', types: ['series'], idPrefixes: ['kitsu:'] }] } },
  { transportUrl: 'https://streams.example/manifest.json', manifest: { name: 'Streams', types: ['series'], resources: ['stream'] } }
];
function subNames(type, id) { return shared.addonsFor(subAddons, 'subtitles', type, id).map(function (a) { return a.name; }).join(','); }
assert.strictEqual(subNames('series', 'tt1:1:2'), 'OpenSubtitles', 'an IMDb episode did not reach only the IMDb subtitle addon');
assert.strictEqual(subNames('series', 'kitsu:12:1180'), 'Anime Subs', 'a Kitsu episode was not sent to the addon that accepts Kitsu ids');
assert.strictEqual(subNames('movie', 'tt5'), 'OpenSubtitles', 'a film reached a series-only subtitle addon');
assert.strictEqual(shared.addonsFor(subAddons, 'subtitles', 'series', 'tt1:1:2')[0].query, '?key=K', 'the subtitle addon key was dropped');
assert.strictEqual(shared.streamAddonsIn(subAddons, 'series').map(function (a) { return a.name; }).join(','), 'Streams', 'stream addon selection changed');

// ---- watched state written like the official apps (progress.js + server/watched.js) ----
var watchedLib = require(path.join(root, 'service', 'server', 'watched.js'));
var eps = [
  { id: 'tt7:1:2', season: 1, episode: 2 }, { id: 'tt7:1:1', season: 1, episode: 1 },
  { id: 'tt7:2:1', season: 2, episode: 1 }, { id: 'tt7:0:1', season: 0, episode: 1 }
];
assert.deepStrictEqual(watchedLib.orderedIds(eps), ['tt7:0:1', 'tt7:1:1', 'tt7:1:2', 'tt7:2:1'], 'episodes were not ordered by season and episode');
var field = watchedLib.setWatched('', eps, 'tt7:1:1');
field = watchedLib.setWatched(field, eps, 'tt7:1:2');
assert.ok(/^tt7:1:2:3:/.test(field), 'the field anchor is not the last watched episode: ' + field);
var decoded = watchedLib.decodeField(field);
assert.deepStrictEqual(decoded.bits.slice(0, 4), [0, 1, 1, 0], 'watched bits did not round-trip');
// an episode added to the list later keeps the earlier bits on the right episodes
var grown = eps.concat([{ id: 'tt7:0:0', season: 0, episode: 0 }]);
var regrown = watchedLib.decodeField(watchedLib.setWatched(field, grown, 'tt7:2:1'));
assert.deepStrictEqual(regrown.bits.slice(0, 5), [0, 0, 1, 1, 1], 'the anchor shift lost watched episodes');
assert.strictEqual(watchedLib.setWatched(field, eps, 'tt7:9:9'), '', 'an unknown episode was written');

function playSession(opts) {
  var storage = memoryStorage({ user: JSON.stringify({ _id: 'abcd1234' }) });
  if (opts.lib) storage.setItem('lib_abcd_tt7', JSON.stringify(opts.lib));
  var events = {}, sent = [], intervals = [];
  var video = {
    duration: 1000, currentTime: 0, paused: false,
    addEventListener: function (n, f) { (events[n] = events[n] || []).push(f); }
  };
  var ctx = {
    ID: 'tt7', VID: opts.vid, TYPE: 'series', NEXTVID: opts.next || '', TITLE: 'Show', POSTER: 'p', BG: '', LOGO: '',
    v: video, localStorage: storage, location: { search: '?x' }, Date: Date, JSON: JSON, Math: Math,
    document: { getElementById: element }, P: {}, showToast: function () {}, fmt: String,
    xhr: function (u, cb) { sent.push(u); if (u.indexOf('/watchedset') === 0) cb({ watched: 'tt7:1:1:2:x' }); },
    lsGet: function () { return 'false'; }, NEXTHREF: '', npDismissed: false, startAutoNext: function () {},
    setTimeout: function () {}, setInterval: function (f) { intervals.push(f); },
    XMLHttpRequest: function () { this.open = function () {}; this.setRequestHeader = function () {}; this.send = function () {}; }
  };
  vm.runInNewContext(src('shared/watch-state.js') + src('player/progress.js'), ctx);
  function fire(n) { (events[n] || []).forEach(function (f) { f(); }); }
  ctx.play = function (to) { while (video.currentTime < to) { video.currentTime = Math.min(to, video.currentTime + 10); intervals[0](); } };
  ctx.seek = function (to) { fire('seeking'); video.currentTime = to; };
  ctx.fire = fire;
  ctx.lib = function () { return JSON.parse(storage.getItem('lib_abcd_tt7')); };
  ctx.sent = sent;
  return ctx;
}
var ep = playSession({ vid: 'tt7:1:1', next: 'tt7:1:2' });
ep.play(600);
assert.strictEqual(ep.lib().state.flaggedWatched, 0, 'an episode was watched before 70 %');
ep.play(720);
var st = ep.lib().state;
assert.strictEqual(st.flaggedWatched, 1, 'an episode played past 70 % was not marked watched');
assert.strictEqual(st.timesWatched, 1, 'times watched was not counted');
assert.strictEqual(st.watched, 'tt7:1:1:2:x', 'the watched field from the server was not stored');
ep.play(800);
assert.strictEqual(ep.lib().state.timesWatched, 1, 'an episode was counted watched twice');
ep.play(950);
ep.fire('ended');
st = ep.lib().state;
assert.strictEqual(st.video_id, 'tt7:1:2', 'the finished episode did not move on to the next one');
assert.strictEqual(st.timeOffset, 1, 'the next episode pointer is not at the start');
assert.strictEqual(st.flaggedWatched, 0, 'the next episode inherited the watched flag');
vm.runInNewContext('saveProgress()', ep);
assert.strictEqual(ep.lib().state.video_id, 'tt7:1:2', 'saving after the end moved the item back');

var skim = playSession({ vid: 'tt7:1:1', next: 'tt7:1:2' });
skim.play(100);
skim.seek(920);
skim.play(940);
vm.runInNewContext('finishSession(false)', skim);
st = skim.lib().state;
assert.strictEqual(st.flaggedWatched, 0, 'skipping to the credits counted as watched');
assert.strictEqual(st.video_id, 'tt7:1:2', 'leaving in the credits did not move on to the next episode');

var early = playSession({ vid: 'tt7:1:1', next: 'tt7:1:2' });
early.play(400);
vm.runInNewContext('finishSession(false)', early);
assert.strictEqual(early.lib().state.timeOffset, 400000, 'leaving mid-episode lost the position');

console.log('OK: watched state like the official apps, next-episode countdown, still-watching prompt, per-title audio, subtitles and delay, addon request URLs, subtitle addon choice.');
