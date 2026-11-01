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

// ---- the next episode opens straight from the player (up-next.js) ----
function nextDirect(streams, opts) {
  opts = opts || {};
  var els = {}, timers = [], went = [], posted = [], removed = [];
  var addons = [
    { transportUrl: 'http://127.0.0.1:11470/manifest.json', manifest: { name: 'Local', types: ['series'], resources: ['stream'] } },
    { transportUrl: 'https://torrentio.example/manifest.json', manifest: { name: 'Torrentio', types: ['series'], resources: ['stream'] } }
  ];
  var asked = [];
  var ctx = {
    SEASON: '1', EPISODE: '2', EPTITLE: '', BACK: 'beta#detail/series/tt1/tt1:1:2', TYPE: 'series', ID: 'tt1',
    NEXTHREF: '/beta#detail/series/tt1/tt1:1:3', NEXTTITLE: '', NEXTVID: 'tt1:1:3', NEXTTHUMB: '',
    ADDON: 'Torrentio', QUALITY: '1080p', COMPAT: '', SNAME: opts.sname || 'Torrentio 1080p Show.S01E02.1080p 🇧🇷', BINGE: opts.binge || '',
    exited: false, startupWatch: null, mode: 'video', menu: {}, bar: {}, load: { style: { display: 'none' } }, subEl: {},
    localStorage: memoryStorage({ uiLanguage: 'pt-BR', addons: JSON.stringify(addons) }),
    document: { getElementById: function (id) { return els[id] || (els[id] = element(id)); } },
    v: { addEventListener: function () {}, pause: function () { ctx.paused = true; } },
    showBar: function () {}, saveProgress: function () {}, showToast: function (m) { ctx.toast = m; },
    location: { replace: function (u) { went.push(u); } },
    lsGet: function (k, d) { return d; }, cancelAutoNext: function () {},
    forgetNextSource: function () { removed.push(1); },
    nextEp: function () {},
    nextSourcePref: null,
    xhr: function (u, cb) {
      asked.push(u);
      if (!opts.silent) cb(streams ? { streams: streams } : null);
    },
    XMLHttpRequest: function () {
      var x = this;
      x.open = x.setRequestHeader = function () {};
      x.send = function (b) {
        posted.push(JSON.parse(b));
        x.readyState = 4;
        x.responseText = opts.noRef ? '{}' : '{"ref":"R1"}';
        x.onreadystatechange();
      };
    },
    setTimeout: function (f) { timers.push(f); return timers.length; }, clearTimeout: function () {}
  };
  vm.runInNewContext(
    src('platform/lg/common.js') + src('shared/strings.js') + src('shared/stream-addons.js') + src('shared/source-info.js') + src('player/strings.js') + src('player/up-next.js') +
    ';function nextSourcePref(){return{addon:ADDON,quality:QUALITY,compat:COMPAT,text:SNAME,binge:BINGE,langs:subtitleLanguagesOnly({name:SNAME})?[]:streamLanguages({name:SNAME})};}' +
    ';openNextDirect();',
    ctx
  );
  if (opts.timeout) while (timers.length) timers.shift()();
  return { went: went, posted: posted, removed: removed, asked: asked, ctx: ctx };
}
var directPt = { name: 'Torrentio 1080p', title: 'Show.S01E03.1080p 🇧🇷', infoHash: 'a'.repeat(40) };
var directEn = { name: 'Torrentio 1080p', title: 'Show.S01E03.1080p 🇬🇧', infoHash: 'b'.repeat(40) };
var direct = nextDirect([directEn, directPt]);
assert.strictEqual(direct.posted[0].url, 'http://127.0.0.1:11470/' + 'a'.repeat(40) + '/0', 'the next episode did not keep the language being watched');
assert.strictEqual(
  direct.went[0],
  '/play?ref=R1&type=series&id=tt1&vid=tt1%3A1%3A3&back=' + encodeURIComponent('beta#detail/series/tt1/tt1:1:3'),
  'the next episode did not open straight in the player'
);
assert.strictEqual(direct.removed.length, 1, 'the used preference stayed behind and would autoplay on Back');
assert.strictEqual(direct.ctx.paused, true, 'the finished episode kept playing behind the cover');
assert.strictEqual(direct.ctx.toast, 'Próximo episódio…', 'no notice while the next episode was looked for');
assert.strictEqual(direct.asked.length, 1, 'addons other than the source addon were asked');
var boundBinge = nextDirect(
  [directEn, { name: 'Torrentio 720p', title: 'Other.720p 🇬🇧', infoHash: 'c'.repeat(40), behaviorHints: { bingeGroup: 'torrentio|pack' } }],
  { binge: 'torrentio|pack' }
);
assert.strictEqual(boundBinge.posted[0].bingeGroup, 'torrentio|pack', 'the same release marker did not win');
var otherLang = nextDirect([directEn]);
assert.deepStrictEqual(otherLang.went, ['/beta#detail/series/tt1/tt1:1:3'], 'a dubbed episode continued in another language instead of offering the list');
assert.strictEqual(otherLang.posted.length, 0, 'a source in another language was prepared');
assert.deepStrictEqual(nextDirect(null).went, ['/beta#detail/series/tt1/tt1:1:3'], 'an addon that failed did not fall back to the title page');
assert.deepStrictEqual(nextDirect([directPt], { noRef: true }).went, ['/beta#detail/series/tt1/tt1:1:3'], 'a failed source preparation did not fall back');
assert.deepStrictEqual(nextDirect([], { silent: true, timeout: true }).went, ['/beta#detail/series/tt1/tt1:1:3'], 'a slow addon held the viewer past the limit');

// ---- per-title audio, subtitles and delay (subtitles.js) ----
function subtitlePrefs(stored) {
  var storage = memoryStorage(stored);
  var ctx = {
    ID: 'tt9', TYPE: 'series', VID: '', URL: '', localStorage: storage, HAS_MEDIA_TOOLS: true,
    v: { addEventListener: function () {}, textTracks: [], currentTime: 0 },
    document: { getElementById: element, createElement: element },
    xhr: function () {}, showToast: function () {}, subEl: element('sub'),
    defaultMediaLanguage: function () { return 'por'; }
  };
  vm.runInNewContext(src('player/subtitles.js') + ';this.__out={sub:WANTSUB,aud:WANTAUD,delay:subDelay};', ctx);
  return ctx.__out;
}
assert.strictEqual(subtitlePrefs({}).sub, 'por', 'never configured, the subtitle language did not follow the interface');
assert.strictEqual(subtitlePrefs({ enableDefaultAudioTrack: 'true' }).aud, 'por', 'the audio language shown in Settings was not used');

// ---- backup languages, and a subtitle from inside the file chosen before (subtitles.js) ----
function languagePlayer(stored, tracks, audio) {
  var listeners = {}, chosen = { ext: '', emb: -1 };
  var ctx = {
    ID: 'tt9', TYPE: '', VID: '', URL: '', localStorage: memoryStorage(stored), HAS_MEDIA_TOOLS: true,
    v: { addEventListener: function (name, fn) { listeners[name] = fn; }, textTracks: [], currentTime: 0, audioTracks: audio || [] },
    document: { getElementById: element, createElement: element },
    xhr: function (url, cb) { cb({ tracks: tracks || [] }); }, showToast: function () {}, subEl: element('sub'), P: { subtitles: '' },
    defaultMediaLanguage: function () { return 'por'; }
  };
  vm.runInNewContext(src('player/subtitles.js') + ';' +
    'setExtSub=function(u){curSub="ext:"+u;this.chosen.ext=u}.bind(this);setEmbSub=function(n){curSub="emb:"+n;this.chosen.emb=n}.bind(this);' +
    'this.withSubs=function(l){extSubs=l;autoSub()};this.autoAudio=autoAudio;', Object.assign(ctx, { chosen: chosen }));
  ctx.listeners = listeners;
  return ctx;
}
var subs = [{ lang: 'eng', name: 'English', u: 'en' }, { lang: 'pob', name: 'Portuguese', u: 'pt' }];
var primary = languagePlayer({ subsLang: 'por', subsLang2: 'eng' });
primary.withSubs(subs);
assert.strictEqual(primary.chosen.ext, 'pt', 'the primary subtitle language lost to the backup, or pob was not Portuguese');
var backup = languagePlayer({ subsLang: 'jpn', subsLang2: 'eng' });
backup.withSubs(subs);
assert.strictEqual(backup.chosen.ext, 'en', 'the backup subtitle language was not used');
var noBackup = languagePlayer({ subsLang: 'jpn' });
noBackup.withSubs(subs);
assert.strictEqual(noBackup.chosen.ext, '', 'a subtitle in another language came on');
var setOff = languagePlayer({ subsLang: '', subsLang2: 'eng' });
setOff.withSubs(subs);
assert.strictEqual(setOff.chosen.ext, '', 'subtitles set to Off came on through the backup');

function audioChoice(stored, tracks) {
  var player = languagePlayer(Object.assign({ enableDefaultAudioTrack: 'true' }, stored), null, tracks);
  player.autoAudio();
  return tracks.map(function (track) { return !!track.enabled; });
}
assert.deepStrictEqual(audioChoice({ defaultAudioTrack: 'por' }, [{ language: 'en', enabled: true }, { language: 'pt' }]), [false, true], 'a two-letter pt did not match por');
assert.deepStrictEqual(audioChoice({ defaultAudioTrack: 'jpn', defaultAudioTrack2: 'eng' }, [{ language: 'pt', enabled: true }, { language: 'en' }]), [false, true], 'the backup audio language was not used');
assert.deepStrictEqual(audioChoice({ defaultAudioTrack: 'por' }, [{ language: '' }, { language: 'en', enabled: true }]), [false, true], 'a track without a language was taken for the wanted one');

var pref = JSON.stringify({ sub: 'jpn', embLang: 'jpn' });
var inside = languagePlayer({ tvtitle_tt9: pref }, [{ n: 4, ti: 1, lang: 'jpn', name: 'Japanese' }]);
inside.withSubs([{ lang: 'jpn', name: 'Japanese', u: 'ja' }]);
assert.strictEqual(inside.chosen.ext, '', 'an external subtitle replaced the one from inside the file');
inside.listeners.playing();
assert.strictEqual(inside.chosen.emb, 4, 'the subtitle from inside the file was not chosen again');
var gone = languagePlayer({ tvtitle_tt9: pref }, []);
gone.withSubs([{ lang: 'jpn', name: 'Japanese', u: 'ja' }]);
gone.listeners.playing();
assert.strictEqual(gone.chosen.ext, 'ja', 'a file without that track did not fall back to an external subtitle');
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

// ---- the controls stay up while a subtitle or audio track is loading (subtitles.js playerBusy) ----
var busyCtx = {
  ID: 'tt9', TYPE: 'series', VID: '', URL: 'u', localStorage: memoryStorage({}), mode: 'menu', HAS_MEDIA_TOOLS: true,
  v: { addEventListener: function () {}, textTracks: [], currentTime: 0, readyState: 4 },
  document: { getElementById: element, createElement: element }, location: { search: '' },
  xhr: function () {}, showToast: function () {}, subEl: element('sub')
};
vm.runInNewContext('function defaultMediaLanguage(){return "por"}' + src('player/subtitles.js'), busyCtx);
assert.strictEqual(vm.runInNewContext('playerBusy()', busyCtx), false, 'the controls were held with nothing loading');
vm.runInNewContext('embTracksLoading = true', busyCtx);
assert.strictEqual(vm.runInNewContext('playerBusy()', busyCtx), true, 'the controls could hide while the track list was loading');
vm.runInNewContext("embTracksLoading = false; setExtSub('http://sub')", busyCtx);
assert.strictEqual(vm.runInNewContext('playerBusy()', busyCtx), true, 'the controls could hide while the chosen subtitle was loading');
vm.runInNewContext('cues = []', busyCtx);
assert.strictEqual(vm.runInNewContext('playerBusy()', busyCtx), false, 'the controls stayed after the subtitle loaded');
vm.runInNewContext("setExtSub('http://slow'); trackChosenAt = Date.now() - 60000", busyCtx);
assert.strictEqual(vm.runInNewContext('playerBusy()', busyCtx), false, 'a subtitle that never loads kept the controls up forever');

// ---- playback waits for a subtitle chosen in the menu (subtitles.js holdForSubtitle) ----
function holdSession(paused) {
  var timers = [], xhrs = [], toasts = [];
  var ctx = {
    ID: 'tt9', TYPE: 'series', VID: '', URL: 'u', localStorage: memoryStorage({}), mode: 'video', EMBMODE: 'server', HAS_MEDIA_TOOLS: true,
    NO_HISTORY: false, load: { style: { display: 'none' } },
    v: {
      paused: !!paused, ended: false, addEventListener: function () {}, textTracks: [], currentTime: 0, readyState: 4,
      pause: function () { this.paused = true; ctx.pauses = (ctx.pauses || 0) + 1; },
      play: function () { this.paused = false; ctx.plays = (ctx.plays || 0) + 1; }
    },
    document: { getElementById: element, createElement: element }, location: { search: '' },
    xhr: function (u, cb) { xhrs.push(cb); }, showToast: function (m) { toasts.push(m); }, subEl: element('sub'),
    P: { loadingSubtitle: 'loading', preparingSubs: 'late' },
    setTimeout: function (f) { timers.push(f); return timers.length; }, clearTimeout: function (i) { timers[i - 1] = null; },
    setInterval: function () { return 99; }, clearInterval: function () {}
  };
  vm.runInNewContext('function defaultMediaLanguage(){return "por"}' + src('player/subtitles.js'), ctx);
  ctx.fireTimer = function () { timers.filter(Boolean).forEach(function (f) { f(); }); };
  ctx.answer = function (j) { xhrs.shift()(j); };
  ctx.toasts = toasts;
  return ctx;
}
var hold = holdSession();
vm.runInNewContext("setExtSub('http://sub'); holdForSubtitle()", hold);
assert.strictEqual(hold.v.paused, true, 'playback did not wait for the chosen subtitle');
assert.strictEqual(hold.subHolding, true, 'the wait was not marked, so the paused screen would cover the video');
hold.answer({ cues: [{ s: 0, e: 1, t: 'x' }] });
assert.strictEqual(hold.v.paused, false, 'playback did not continue when the subtitle arrived');
var late = holdSession();
vm.runInNewContext("setExtSub('http://slow'); holdForSubtitle()", late);
late.fireTimer();
assert.strictEqual(late.v.paused, false, 'a late subtitle held playback past the limit');
assert.strictEqual(late.toasts.pop(), 'late', 'a late subtitle did not say it was still coming');
var wasPaused = holdSession(true);
vm.runInNewContext("setExtSub('http://sub'); holdForSubtitle()", wasPaused);
wasPaused.answer({ cues: [] });
assert.strictEqual(wasPaused.plays, undefined, 'a video paused by the viewer started by itself');
var takeover = holdSession();
vm.runInNewContext("setExtSub('http://sub'); holdForSubtitle(); dropSubHold()", takeover);
takeover.answer({ cues: [] });
assert.strictEqual(takeover.v.paused, true, 'a pause key during the wait was overridden when the subtitle arrived');
var switched = holdSession();
vm.runInNewContext("setExtSub('http://old'); holdForSubtitle(); setExtSub('http://new')", switched);
switched.answer({ cues: [{ s: 0, e: 1, t: 'old' }] });
assert.strictEqual(vm.runInNewContext('cues', switched), null, 'the answer for a previous subtitle replaced the chosen one');
assert.strictEqual(switched.v.paused, true, 'the answer for a previous subtitle ended the wait');
var turnedOff = holdSession();
vm.runInNewContext("setExtSub('http://sub'); holdForSubtitle(); subsOff()", turnedOff);
assert.strictEqual(turnedOff.v.paused, false, 'turning subtitles off during the wait left the video paused');
var embHold = holdSession();
vm.runInNewContext('setEmbSub(2); holdForSubtitle()', embHold);
assert.strictEqual(embHold.v.paused, true, 'playback did not wait for an embedded subtitle');
embHold.answer({ err: 'no' });
assert.strictEqual(embHold.v.paused, false, 'a failed embedded subtitle left the video paused');

// ---- seek steps are exact even though the video keeps playing until the jump (seek.js) ----
function seekSession() {
  var timers = [];
  var ctx = {
    v: { duration: 3600, currentTime: 100 }, mode: 'video', embN: -1,
    seekTarget: -1, seekTimer: null, seekHideT: null,
    seekEl: { textContent: '', style: {} }, seekBar: { className: '' }, fill: { style: {} }, knob: { style: {} },
    paintTime: function () {}, schedPreview: function () {}, showBar: function () {}, showBuf: function () {},
    pollEmbCues: function () {},
    setTimeout: function (f) { timers.push(f); return timers.length; }, clearTimeout: function () {}
  };
  vm.runInNewContext(src('player/seek.js'), ctx);
  ctx.commitNow = function () { vm.runInNewContext('commitSeek()', ctx); };
  return ctx;
}
var sk = seekSession();
vm.runInNewContext('seek(10)', sk);
sk.v.currentTime = 101.2; // played on while waiting for more presses
vm.runInNewContext('seek(10)', sk);
assert.strictEqual(sk.seekEl.textContent, '+20s', 'two presses of 10 s did not read +20s');
sk.v.currentTime = 102.4;
sk.commitNow();
assert.strictEqual(Math.round(sk.v.currentTime * 10) / 10, 122.4, 'the jump was not exactly 20 s from where the video was');
var digits = seekSession();
vm.runInNewContext('seekTo(1800)', digits);
digits.v.currentTime = 101;
digits.commitNow();
assert.strictEqual(digits.v.currentTime, 1800, 'a number-key jump did not land on its absolute time');

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
  var events = {}, sent = [], intervals = [], posts = [];
  var video = {
    duration: 1000, currentTime: 0, paused: false,
    addEventListener: function (n, f) { (events[n] = events[n] || []).push(f); }
  };
  var ctx = {
    ID: 'tt7', VID: opts.vid, TYPE: 'series', NEXTVID: opts.next || '', TITLE: 'Show', POSTER: 'p', BG: '', LOGO: '',
    v: video, localStorage: storage, location: { search: '?x' }, Date: Date, JSON: JSON, Math: Math,
    document: { getElementById: element }, P: {}, showToast: function () {}, fmt: String,
    xhr: function (u, cb) { sent.push(u); if (u.indexOf('/watchedset') === 0) cb({ watched: 'tt7:1:1:2:x' }); },
    lsGet: function (k, d) { return k === 'noHistory' && opts.noHistory ? 'true' : k === 'noHistory' ? d : 'false'; },
    NEXTHREF: '', npDismissed: false, startAutoNext: function () {}, subHolding: false,
    setTimeout: function () {}, setInterval: function (f) { intervals.push(f); },
    XMLHttpRequest: function () { this.open = function (m, u) { posts.push(u); }; this.setRequestHeader = function () {}; this.send = function () {}; }
  };
  vm.runInNewContext(src('shared/watch-state.js') + src('player/progress.js'), ctx);
  function fire(n) { (events[n] || []).forEach(function (f) { f(); }); }
  ctx.play = function (to) { while (video.currentTime < to) { video.currentTime = Math.min(to, video.currentTime + 10); intervals[0](); } };
  ctx.seek = function (to) { fire('seeking'); video.currentTime = to; };
  ctx.fire = fire;
  ctx.lib = function () { return JSON.parse(storage.getItem('lib_abcd_tt7')); };
  ctx.sent = sent;
  ctx.storage = storage;
  ctx.posts = posts;
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

var before = { user: 1, state: { video_id: 'tt7:1:1', timeOffset: 120000, duration: 1000000 } };
var off = playSession({ vid: 'tt7:1:1', next: 'tt7:1:2', noHistory: true, lib: before });
off.play(800);
off.fire('pause');
off.fire('ended');
vm.runInNewContext('finishSession(true); pushLib(true)', off);
assert.deepStrictEqual(off.lib(), before, 'history was written with Do not save history on');
assert.deepStrictEqual(off.posts, [], 'progress was sent to the account with Do not save history on');
assert.deepStrictEqual(off.sent.filter(function (u) { return u.indexOf('/watchedset') === 0; }), [], 'an episode was marked watched with Do not save history on');
assert.strictEqual(off.storage.getItem('tvstream_tt7_tt7:1:1'), null, 'the source was remembered with Do not save history on');
var pushed = false;
vm.runInNewContext('pushLib(true, function () { doneCalled = true; })', Object.assign(off, { doneCalled: false }));
pushed = off.doneCalled;
assert.strictEqual(pushed, true, 'leaving the player would wait for a push that never happens');

// ---- the settings menu shows what is in use (menus.js) ----
(function () {
  var subtitleCode = src('player/subtitles.js');
  var label = subtitleCode.slice(subtitleCode.indexOf('function selectedLabel'), subtitleCode.indexOf('function eh('));
  function player(curSub, tracks, extSubs) {
    var rows = [];
    var menu = {
      className: '',
      querySelectorAll: function () { return rows; },
      set innerHTML(html) {
        rows = (html.match(/<div class=("mi[^"]*"|mi)[^>]*>[^<]*/g) || []).map(function (row) {
          return {
            className: /class="mi on"/.test(row) ? 'mi on' : 'mi',
            text: row.replace(/^[^>]*>/, ''),
            scrollIntoView: function () {}
          };
        });
      }
    };
    var names = ['settings', 'audio', 'subtitles', 'none', 'off', 'embedded', 'external', 'style', 'delay', 'language', 'selected'];
    var P = {};
    names.forEach(function (name) { P[name] = name; });
    var context = {
      history: { pushState: function () {} }, window: { addEventListener: function () {} },
      menu: menu, P: P, curSub: curSub, extSubs: extSubs || [], embTracks: [], embTracksLoading: false,
      v: { audioTracks: tracks || [] }, subColor: '#ffffff', subBgOp: 0,
      eh: function (s) { return s; }, audioName: function () { return ''; }, subtitleName: function () { return ''; },
      ensureEmbTracks: function () {}, goBack: function () {}, paintBtns: function () {}
    };
    vm.runInNewContext(label + src('player/menus.js') + ';var menuItems,mIdx,subView,mode;this.menuRows=function(){return menu.querySelectorAll()};this.focus=function(){return mIdx};this.setFocus=function(i){mIdx=i;paintMenu()};', context);
    return context;
  }
  var audio = player('off', [{ language: 'en', enabled: false }, { language: 'pt', enabled: true }]);
  audio.openMenu('audio');
  assert.strictEqual(audio.focus(), 1, 'the audio list did not open on the track in use');
  assert.strictEqual(audio.menuRows()[1].className, 'mi on f');
  assert.ok(audio.menuRows()[1].text.indexOf('selected') >= 0, 'the track in use does not say so in words');
  audio.setFocus(0);
  assert.strictEqual(audio.menuRows()[1].className, 'mi on', 'moving the focus erased the mark of the track in use');
  assert.strictEqual(audio.menuRows()[0].className, 'mi f');

  var external = player('ext:b', [], [{ lang: 'eng', name: 'English', u: 'a' }, { lang: 'por', name: 'Portuguese', u: 'b' }]);
  external.openMenu('subsroot');
  assert.strictEqual(external.focus(), 2, 'the subtitle menu did not open on the kind in use');
  external.openMenu('external');
  assert.strictEqual(external.focus(), 1, 'the language list did not open on the language in use');
  assert.ok(external.menuRows()[1].text.indexOf('selected') >= 0);
  assert.ok(external.menuRows()[0].text.indexOf('selected') < 0);

  var embedded = player('emb:3');
  embedded.openMenu('subsroot');
  assert.strictEqual(embedded.focus(), 1, 'the subtitle menu did not open on the embedded row');
  var off = player('off');
  off.openMenu('subsroot');
  assert.strictEqual(off.focus(), 0, 'Off in use is the first row');
  off.openMenu('style');
  assert.strictEqual(off.focus(), 0, 'lists without a selection open on the first row');
})();

// ---- a torrent's link ending during a long pause (controls.js) ----
(function () {
  var code = src('player/controls.js');
  var body = code.slice(code.indexOf('var reopenedAt = 0;'), code.indexOf("v.addEventListener('error', function () {"));
  function player(address, usable) {
    var listeners = {};
    var video = {
      currentTime: 1234, src: 'old', loads: 0, plays: 0,
      addEventListener: function (name, fn) { listeners[name] = fn; },
      removeEventListener: function (name) { delete listeners[name]; },
      load: function () { this.loads++; },
      play: function () { this.plays++; }
    };
    var context = {
      URL: address, mediaUsable: usable, v: video, P: { retrying: '' }, Date: Date,
      diag: function () {}, showToast: function () {}
    };
    vm.runInNewContext(body, context);
    return { context: context, video: video, listeners: listeners };
  }
  var torrent = 'http://127.0.0.1:11470/' + 'a'.repeat(40) + '/0';

  var paused = player(torrent, true);
  assert.strictEqual(paused.context.reopenTorrent(), true, 'a torrent whose link ended was not opened again');
  assert.strictEqual(paused.video.src, torrent, 'the torrent did not go back to its address on :11470');
  assert.strictEqual(paused.video.loads, 1);
  paused.video.currentTime = 0;
  paused.listeners.loadedmetadata();
  assert.strictEqual(paused.video.currentTime, 1234, 'the film did not return to where it was');
  assert.strictEqual(paused.video.plays, 1, 'the film did not start again');
  assert.strictEqual(paused.listeners.loadedmetadata, undefined, 'a later load would jump back to the old position');
  assert.strictEqual(paused.context.reopenTorrent(), false, 'a link that keeps failing must offer another source, not loop');

  assert.strictEqual(player('http://example.com/film.mp4', true).context.reopenTorrent(), false, 'only torrents have a new link to ask for');
  assert.strictEqual(player(torrent, false).context.reopenTorrent(), false, 'a torrent that never played is a startup failure, not a pause');
})();

console.log('OK: settings menu shows what is in use.');
console.log('OK: torrent opened again after a long pause.');
console.log('OK: watched state like the official apps, next-episode countdown, next episode opened directly, waiting for a chosen subtitle, do not save history, still-watching prompt, per-title audio, subtitles and delay, addon request URLs, subtitle addon choice, controls kept while loading, exact seek steps.');
