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
  var el = { id: id, textContent: '', className: '', style: {}, addEventListener: function () {}, appendChild: function () {} };
  el.getElementsByTagName = function () { return [el]; };
  return el;
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
  ].concat(opts.moreAddons || []);
  var asked = [], held = [];
  var ctx = {
    SEASON: '1', EPISODE: '2', EPTITLE: '', BACK: 'beta#detail/series/tt1/tt1:1:2', TYPE: 'series', ID: 'tt1',
    NEXTHREF: '/beta#detail/series/tt1/tt1:1:3', NEXTTITLE: '', NEXTVID: 'tt1:1:3', NEXTTHUMB: '',
    TITLE: 'One Piece', LOGO: 'https://img.example/logo.png', BG: 'https://img.example/bg.jpg', POSTER: '',
    ADDON: 'Torrentio', ADDONBASE: opts.base || '', QUALITY: '1080p', COMPAT: '', SNAME: opts.sname || 'Torrentio 1080p Show.S01E02.1080p 🇧🇷', BINGE: opts.binge || '',
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
      if (opts.late) held.push(cb);
      else if (!opts.silent) cb(streams ? { streams: streams } : null);
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
    (opts.ahead ? ';prefetchNext();' : '') + ';openNextDirect();',
    ctx
  );
  if (opts.timeout) while (timers.length) timers.shift()();
  /* the addon answers after the player already asked for the next episode */
  held.forEach(function (cb) { cb({ streams: streams }); });
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
assert.deepStrictEqual(direct.posted[0].meta, { name: 'One Piece', logo: 'https://img.example/logo.png', background: 'https://img.example/bg.jpg', poster: '' }, 'the next episode lost the title\'s name and artwork');
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
var ahead = nextDirect([directPt], { ahead: true });
assert.strictEqual(ahead.asked.length, 1, 'the sources asked for while the panel was up were asked for again');
assert.strictEqual(ahead.posted.length, 1, 'the answer that came in advance was not used');
var slowAddon = nextDirect([directPt], { ahead: true, late: true });
assert.strictEqual(slowAddon.asked.length, 1, 'a request still on its way was sent a second time');
assert.strictEqual(slowAddon.posted.length, 1, 'an addon that answered after the episode ended did not start the next one');
var twin = { transportUrl: 'https://other.example/manifest.json', manifest: { name: 'Torrentio', types: ['series'], resources: ['stream'] } };
var twins = nextDirect([directPt], { moreAddons: [twin], base: 'https://other.example' });
assert.deepStrictEqual(twins.asked, ['/addon?u=' + encodeURIComponent('https://other.example/stream/series/tt1%3A1%3A3.json')], 'two installations with one name were not told apart');
assert.strictEqual(twins.posted[0].addonBase, 'https://other.example', 'the source did not keep which installation gave it');

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

// ---- the source list keeps its focus while addons answer (ui/views/streams.js) ----
(function () {
  function node() { return { style: {}, appendChild: function () {}, innerHTML: '', offsetTop: 0 }; }
  var ctx = {
    document: { createElement: node }, $: node, tx: function () { return ''; }, lsRaw: function (k, d) { return d; },
    langRank: function () { return 0; }, preferredSourceLanguage: function () { return 'Auto'; }, fixedSourceLanguage: function () { return 'Auto'; }, inLangFilter: function () { return true; }, sourceLanguageLabel: function (c) { return c; }, langGroups: function () { return []; }, sourceTags: function () { return []; },
    setF: function () {}, bestSource: function () { return null; }, sourceOrder: function (a, b) { return b.seeds - a.seeds; }, window: {}
  };
  vm.runInNewContext(src('ui/views/streams.js') + ';this.list=streamsUI;', ctx);
  var list = ctx.list, slow = { seeds: 1 }, fast = { seeds: 5 }, faster = { seeds: 9 };
  var shown = [slow];
  list.all = function () { return shown.slice(); };
  list.paint = function () {};
  Object.assign(list, { items: [], idx: 0, moved: false, filter: 'All', langFilter: 'All', failed: [], els: [] });
  list.rebuild();
  shown = [slow, fast, faster];
  list.rebuild();
  assert.strictEqual(list.items[list.idx], faster, 'a late addon pulled the focus down the list');
  var noSources = Object.assign(Object.create(list), { open: true, zone: 'list', els: [], items: [], idx: 0, moved: false });
  noSources.key(40);
  assert.strictEqual(noSources.idx, 0, 'Down on an empty list lost the focus');
  assert.strictEqual(noSources.moved, false, 'Down on an empty list counted as moving');
  var hidden = Object.assign(Object.create(list), { open: true, searching: true, zone: 'list', els: [1, 2], idx: 0 });
  hidden.key(40);
  assert.strictEqual(hidden.idx, 0, 'a key moved a list that is not on screen');
  var started = 0;
  var top = Object.assign(Object.create(list), { open: true, zone: 'chips', langs: ['All', 'en'], chooseBest: function () { started++; } });
  top.key(38);
  assert.strictEqual(top.zone, 'best', 'Up from the filters did not reach Best source');
  top.key(13);
  assert.strictEqual(started, 1, 'OK on Best source did not start it');
  top.key(39);
  assert.strictEqual(top.zone, 'lang', 'Right from Best source did not reach the language selector');
  top.zone = 'best';
  top.key(40);
  assert.strictEqual(top.zone, 'chips', 'Down from Best source did not return to the filters');
  list.moved = true;
  list.idx = 1;
  shown = [slow, fast, faster, { seeds: 7 }];
  var on = list.items[1];
  list.rebuild();
  assert.strictEqual(list.items[list.idx], on, 'after the viewer moved, the focus left the source it was on');
})();

// ---- a source that answers after being given up on (core.js + controls.js) ----
(function () {
  function player(address) {
    var listeners = {}, timers = [], fail = element('fail');
    var ctx = {
      URL: address, ID: 'tt9', BACK: 'beta#detail/movie/tt9', BG: '', LOGO: '', TITLE: 'x', SE: '', VID: '', ADDON: '', SNAME: '', QUALITY: '',
      P: {}, location: { replace: function () {}, search: '' },
      setTimeout: function (fn, ms) { timers.push(ms); return timers.length; }, clearTimeout: function () {},
      diag: function () {}, showToast: function () {},
      document: { getElementById: function (id) { return id === 'fail' ? fail : element(id); }, createElement: element },
      createVideo: function () { return { addEventListener: function (name, fn) { (listeners[name] = listeners[name] || []).push(fn); } }; }
    };
    var controls = src('player/controls.js');
    var failing = controls.slice(controls.indexOf('var failShown = false;'), controls.indexOf('function tryAnotherSource'));
    vm.runInNewContext(src('player/core.js') + ';' + failing + ';this.fail=showSourceFailed;', ctx);
    return { ctx: ctx, listeners: listeners, timers: timers, fail: fail };
  }
  var direct = player('http://example.com/film.mp4');
  assert.strictEqual(direct.timers[0], 18000, 'a direct source lost its short wait');
  assert.strictEqual(player('http://127.0.0.1:11470/' + 'a'.repeat(40) + '/0').timers[0], 45000, 'a torrent was given up on before finding its peers');
  direct.ctx.fail();
  assert.strictEqual(direct.fail.className, 'show');
  direct.listeners.playing.forEach(function (fn) { fn(); });
  assert.strictEqual(direct.fail.className, '', 'the failure message stayed over a film that started');
})();

// ---- Best source asks the quality and the language, unless Settings names them (ui/views/card-menu.js) ----
(function () {
  var stored = {}, node = function () { return { style: {}, appendChild: function () {}, getElementsByTagName: function () { return [{}]; } }; };
  var ctx = {
    lsRaw: function (k, d) { return stored[k] || d; },
    lsRawSet: function (k, v) { stored[k] = v; },
    tx: function (k) { return k; }, esc: function (s) { return s; }, ICON: {}, GLOBE_ICON: '', setF: function () {}, $: node,
    document: { createElement: node }, UI_LANG: 'pt-BR', langBase: function (c) { return String(c).split('-')[0]; },
    SOURCE_LANGUAGES: [['pt', 'Português'], ['en', 'English']],
    sourceLanguageName: function (c) { return c; },
    preferredSourceLanguage: function () { return stored.preferredSourceLanguage && stored.preferredSourceLanguage !== 'Ask' ? stored.preferredSourceLanguage : stored.bestLanguage || 'Auto'; }
  };
  vm.runInNewContext(src('ui/views/card-menu.js') + ';this.menu=cwMenu;', ctx);
  var chosen = [], go = function (quality, language) { chosen.push(quality + '/' + language); };
  ctx.menu.withBestChoice(go);
  assert.strictEqual(chosen.length, 0, 'Best source started before the quality was answered');
  ctx.menu.key(37);
  assert.strictEqual(chosen.length, 0, 'Back started a source');
  ctx.menu.withBestChoice(go);
  ctx.menu.key(40);
  ctx.menu.key(13);
  assert.deepStrictEqual(chosen, ['720p/Auto'], 'the answer was not used, or the focus did not start on the qualities');
  /* the language row opens the list of languages; Left goes back, a language chosen comes back
     to the qualities and is kept for the next time */
  ctx.menu.withBestChoice(go);
  ctx.menu.key(38);
  ctx.menu.key(13);
  assert.strictEqual(ctx.menu.els.length, 3, 'the language row did not open the list of languages');
  ctx.menu.key(37);
  assert.strictEqual(ctx.menu.open, true, 'Left in the languages closed Best source');
  assert.strictEqual(ctx.menu.els.length, 5, 'Left in the languages did not go back to the qualities');
  ctx.menu.key(38);
  ctx.menu.key(13);
  ctx.menu.key(40);
  ctx.menu.key(13);
  assert.strictEqual(ctx.menu.open, true, 'changing the language started a source');
  ctx.menu.key(13);
  assert.deepStrictEqual(chosen, ['720p/Auto', '1080p/pt'], 'the language chosen did not go with the quality');
  assert.strictEqual(stored.bestLanguage, 'pt', 'the language chosen was not kept');
  stored.preferredSourceQuality = '1080p';
  stored.preferredSourceLanguage = 'en';
  ctx.menu.withBestChoice(go);
  assert.deepStrictEqual(chosen.slice(-1), ['1080p/en'], 'a quality and language set in Settings still asked');
})();

// ---- a subtitle kept on storage loads once (subtitles.js) ----
(function () {
  var requests = [], toasts = 0;
  var ctx = {
    ID: 'tt9', TYPE: '', VID: '', URL: 'http://x/f.mkv', localStorage: memoryStorage({}), HAS_MEDIA_TOOLS: true,
    v: { addEventListener: function () {}, textTracks: [], currentTime: 0 },
    document: { getElementById: element, createElement: element },
    xhr: function (url, cb) { requests.push(url); cb({ cached: true, done: true, final: true, cues: [{ s: 0, e: 1, t: 'x' }], gone: url.indexOf('/subtitle-cues') === 0 }); },
    showToast: function () { toasts++; }, subEl: element('sub'), P: {},
    defaultMediaLanguage: function () { return 'por'; }
  };
  vm.runInNewContext(src('player/subtitles.js') + ';setEmbSub(2,0);pollEmbCues();pollEmbCues();this.state=curSub;', ctx);
  assert.strictEqual(toasts, 1, 'a subtitle kept on storage kept loading again');
  assert.strictEqual(requests.length, 1, 'the player kept asking for a complete subtitle');
  assert.strictEqual(ctx.state, 'emb:2', 'the menu lost the subtitle in use');
})();

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
var twoPt = [{ lang: 'pob', name: 'PT-BR', u: 'sense1', src: 'SubSense' }, { lang: 'pob', name: 'Portuguese (BR)', u: 'comm1', src: 'Community' }];
var sameOne = languagePlayer({ tvtitle_tt9: JSON.stringify({ sub: 'pob', subUrl: 'comm1', subSrc: 'Community' }) });
sameOne.withSubs(twoPt);
assert.strictEqual(sameOne.chosen.ext, 'comm1', 'the subtitle chosen lost to another in the same language');
var nextEp = languagePlayer({ tvtitle_tt9: JSON.stringify({ sub: 'pob', subUrl: 'old', subSrc: 'Community' }) });
nextEp.withSubs(twoPt);
assert.strictEqual(nextEp.chosen.ext, 'comm1', 'another episode did not keep the addon chosen');
assert.strictEqual(audioChoice({ defaultAudioTrack: 'rum' }, [{ language: 'en', enabled: true }, { language: 'ron' }])[1], true, 'ron was not Romanian');
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
  ctx.intervals = intervals;
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

/* a stream that stops short of its length and never reports the end */
(function () {
  function keepDefault(k, d) { return d; }
  var stuck = playSession({ vid: 'tt7:1:1', next: 'tt7:1:2' }), now = 1000, RealDate = Date, started = 0;
  function FakeDate() { return new RealDate(now); }
  FakeDate.now = function () { return now; };
  stuck.Date = FakeDate;
  stuck.lsGet = keepDefault;
  stuck.NEXTHREF = '/beta#detail/series/tt7/tt7:1:2';
  stuck.startAutoNext = function () { started++; };
  stuck.play(990);
  stuck.intervals[1]();
  assert.strictEqual(started, 0, 'the countdown began ten seconds before the end');
  stuck.v.currentTime = 999.2;
  for (var tick = 0; tick < 3; tick++) { stuck.intervals[1](); now += 1000; }
  assert.strictEqual(started, 0, 'three seconds without moving already counted as the end');
  now += 2000;
  stuck.intervals[1]();
  assert.strictEqual(started, 1, 'a video stopped in its last second never counted as ended');
  assert.strictEqual(stuck.lib().state.video_id, 'tt7:1:2', 'the stalled end did not move on to the next episode');
  stuck.fire('ended');
  assert.strictEqual(started, 1, 'the end was handled twice');
  var paused = playSession({ vid: 'tt7:1:1', next: 'tt7:1:2' });
  paused.Date = FakeDate;
  paused.lsGet = keepDefault;
  paused.startAutoNext = function () { started++; };
  paused.NEXTHREF = 'x';
  paused.v.currentTime = 999.2;
  paused.v.paused = true;
  for (tick = 0; tick < 8; tick++) { paused.intervals[1](); now += 1000; }
  assert.strictEqual(started, 1, 'a viewer who paused near the end was sent to the next episode');
})();

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
  function player(curSub, tracks, extSubs, more) {
    more = more || {};
    var rows = [], calls = [], stored = {};
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
    var names = ['settings', 'audioSubs', 'audio', 'subtitles', 'none', 'off', 'embedded', 'external', 'style', 'delay', 'language', 'selected', 'moreLanguages', 'episodes', 'chapters', 'files', 'sources', 'picture', 'pictureFit', 'pictureZoom', 'speed', 'higher', 'lower', 'opacity', 'later', 'earlier', 'reset', 'readingTracks'];
    var P = {};
    names.forEach(function (name) { P[name] = name; });
    var context = {
      history: { pushState: function () {} },
      menu: menu, P: P, curSub: curSub, extSubs: extSubs || [], embTracks: [], embTracksLoading: false,
      v: Object.assign({ audioTracks: tracks || [], addEventListener: function () {}, style: {}, currentTime: 0, playbackRate: 1 }, more.video),
      subColor: '#ffffff', subBgOp: 0, subBottom: 8, subOpacity: 1, subDelay: 0, subEl: { style: {} },
      eh: function (s) { return s; }, audioName: function () { return ''; }, subtitleName: function () { return ''; },
      ensureEmbTracks: function () {}, goBack: function () {}, paintBtns: function () {}, showBar: function () {},
      ensureTechProbe: function () {}, showToast: function () {}, saveTitlePref: function () {},
      lsGet: function (k, d) { return d; }, sameLanguage: function (a, b) { return !!a && a === b; },
      WANTAUD: more.audio || '', WANTAUD2: '', WANTSUB: more.subtitle || '', WANTSUB2: '', defaultMediaLanguage: function () { return 'eng'; },
      TYPE: more.type || 'movie', ID: 'tt5', VID: more.vid || '', BACK: 'beta#detail/x', URL: more.url || 'http://x/a.mp4', IS_TORRENT: !!more.torrent,
      ADDON: 'A', ADDONBASE: 'https://a.example', SNAME: 'A 1080p', QUALITY: '1080p', COMPAT: '', TITLE: 'Film', LOGO: '', BG: '', POSTER: '',
      window: { addEventListener: function () {}, innerWidth: 1920, innerHeight: 1080 }, localStorage: { setItem: function (k, v) { stored[k] = v; } },
      tx: function (key, n) { return key + ' ' + n; }, fmt: function (s) { return 't' + s; }, Date: more.clock || Date,
      xhr: function (u, cb) { calls.push(u); cb(more.answers && more.answers[u.split('?')[0]]); },
      seekTo: function (t) { calls.push('seek ' + t); }, saveProgress: function () {}, pushLib: function () {},
      rememberNextSource: function (vid) { calls.push('remember ' + vid); }, openEpisodeDirect: function (vid, page) { calls.push('open ' + vid + ' ' + page); },
      postStreamRef: function (source, cb) { calls.push('ref ' + source.url); cb('R9'); },
      nextEpisodeAddons: function () { return [{ name: 'Addon', base: 'https://a.example' }]; },
      nextSources: function (ad, vid, cb) { calls.push('sources ' + vid); cb({ streams: more.sources || [] }); },
      sourceItem: function (s, name) { return { url: s.url, quality: s.quality, title: s.title, addon: name }; }, location: { replace: function (u) { calls.push('go ' + u); } },
      appUrl: function (p) { return p; }, nextStarting: false, setTimeout: function () {}, dropButton: function () {}
    };
    vm.runInNewContext(label + src('player/options.js') + src('player/menus.js') + ';var menuItems,mIdx,subView,mode;this.menuRows=function(){return menu.querySelectorAll()};this.focus=function(){return mIdx};this.setFocus=function(i){mIdx=i;paintMenu()};this.texts=function(){return menu.querySelectorAll().map(function(r){return r.text})};this.press=function(i){mIdx=i;chooseMenu()};this.set=function(k,v){if(k==="mediaInfo")mediaInfo=v;};this.get=function(){return{bottom:subBottom,opacity:subOpacity,delay:subDelay,view:subView}};', context);
    context.calls = calls;
    context.stored = stored;
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

  /* the audio asked for comes first, each track with what the file says about it */
  var dubbed = player('off', [{ language: 'en', enabled: true }, { language: 'pt', enabled: false }], [], { audio: 'pt' });
  dubbed.set('mediaInfo', { audios: [{ lang: 'English', title: 'Commentary', format: 'AAC 2.0' }, { lang: 'Portuguese', title: '', format: 'Dolby Digital 5.1' }] });
  dubbed.openMenu('audio');
  assert.deepStrictEqual(dubbed.texts(), ['Portuguese  ·  Dolby Digital 5.1', 'English  ·  Commentary  ·  AAC 2.0 — selected'], 'the audio list is not in the asked order with its details');
  assert.strictEqual(dubbed.focus(), 1, 'the audio list did not open on the track in use after reordering');

  /* subtitle languages: the asked ones and English first, the rest behind one row */
  var many = [{ lang: 'eng', name: 'English', u: 'a' }, { lang: 'fre', name: 'French', u: 'b' }, { lang: 'ger', name: 'German', u: 'c' }, { lang: 'por', name: 'Portuguese', u: 'd' }];
  var grouped = player('ext:b', [], many, { subtitle: 'por' });
  grouped.openMenu('external');
  assert.deepStrictEqual(grouped.texts(), ['English ›', 'Portuguese ›', 'moreLanguages — selected ›'].map(function (t) { return t.replace(' ›', ' \u203a'); }), 'the other languages were not gathered under one row');
  grouped.press(2);
  assert.deepStrictEqual(grouped.texts(), ['French — selected \u203a', 'German \u203a'], 'More languages does not list the rest');

  /* the main menu offers only what this video has */
  var film = player('off', [], [], { video: { tagName: 'VIDEO', videoWidth: 1920, videoHeight: 800 } });
  film.openMenu('root');
  assert.deepStrictEqual(film.texts(), ['picture: pictureFit', 'speed: 1\u00d7 \u203a'], 'the settings offered chapters or files a film does not have, or what has its own button');
  film.openMenu('media');
  assert.deepStrictEqual(film.texts(), ['audio:  \u203a', 'subtitles:  \u203a'], 'Audio and subtitles does not lead to both');
  film.press(1);
  assert.strictEqual(film.get().view, 'subsroot', 'the subtitles row did not open them');
  film.openMenu('root');
  film.press(0);
  assert.strictEqual(film.v.style.objectFit, 'cover', 'Fill the screen did not crop the picture to the screen');
  assert.strictEqual(film.stored.pictureMode, 'zoom', 'the picture choice was not kept');
  film.press(0);
  assert.strictEqual(film.v.style.objectFit, 'contain', 'the whole picture did not come back');
  var samsung = player('off', [], []);
  samsung.openMenu('root');
  assert.deepStrictEqual(samsung.texts(), ['none'], 'picture and speed were offered where the video is not an element of the page');

  /* chapters */
  var chaptered = player('off', [], [], { video: { currentTime: 700 } });
  chaptered.set('mediaInfo', { chapters: [{ t: 0, name: 'Opening' }, { t: 600, name: '' }, { t: 1300, name: 'Credits' }] });
  chaptered.openMenu('root');
  assert.ok(chaptered.texts().indexOf('chapters \u203a') >= 0, 'a file with chapters does not offer them');
  chaptered.openMenu('chapters');
  assert.deepStrictEqual(chaptered.texts(), ['t0  ·  Opening', 't600 — selected', 't1300  ·  Credits'], 'the chapter list is wrong');
  chaptered.press(2);
  assert.deepStrictEqual(chaptered.calls, ['seek 1300'], 'choosing a chapter did not jump to it');

  /* the season's episodes, opened with the matching source */
  var series = player('off', [], [], { type: 'series', vid: 'tt5:2:1', answers: { '/episodes': { episodes: [{ id: 'tt5:2:1', episode: 1, name: 'One' }, { id: 'tt5:2:2', episode: 2, name: '' }] } } });
  series.openMenu('episodes');
  assert.deepStrictEqual(series.texts(), ['episode 1  ·  One — selected', 'episode 2'], 'the episode list is wrong');
  series.press(0);
  assert.strictEqual(series.calls.length, 1, 'choosing the episode being watched left the player');
  series.openMenu('episodes');
  series.press(1);
  assert.deepStrictEqual(series.calls.slice(1), ['remember tt5:2:2', 'open tt5:2:2 /beta#detail/series/tt5/tt5%3A2%3A2'], 'another episode did not open from the player');

  /* the other video files of a torrent */
  var hash = 'c'.repeat(40);
  var pack = player('off', [], [], { torrent: true, url: 'http://127.0.0.1:11470/' + hash + '/1?tr=x', answers: { '/torrentfiles': { files: [{ index: 1, name: 'a.mkv', size: 2147483648, playing: true }, { index: 4, name: 'b.mkv', size: 734003200, playing: false }] } } });
  pack.openMenu('root');
  assert.strictEqual(pack.texts()[0], 'files \u203a', 'a torrent with two films does not offer them');
  pack.press(0);
  assert.deepStrictEqual(pack.texts(), ['a.mkv  ·  2.0 GB — selected', 'b.mkv  ·  700 MB'], 'the file list is wrong');
  pack.press(1);
  assert.deepStrictEqual(pack.calls.slice(1), ['ref http://127.0.0.1:11470/' + hash + '/4?tr=x', 'go /play?ref=R9&type=movie&id=tt5&vid=&back=' + encodeURIComponent('beta#detail/x')], 'another file of the torrent did not open');
  var single = player('off', [], [], { torrent: true, answers: { '/torrentfiles': { files: [{ index: 0, name: 'a.mkv', size: 1, playing: true }] } } });
  single.openMenu('root');
  assert.ok(single.texts().indexOf('files \u203a') < 0, 'a torrent with one film offered a file list');

  /* another source of the same film, from the player */
  var switching = player('off', [], [], { url: 'http://x/a.mp4', sources: [{ url: 'http://x/a.mp4', quality: '1080p', title: 'Film.A' }, { url: 'http://x/b.mkv', quality: '720p', title: 'Film.B' + String.fromCharCode(10) + 'seeds' }] });
  switching.openMenu('sources');
  assert.deepStrictEqual(switching.texts(), ['1080p  ·  Addon  ·  Film.A — selected', '720p  ·  Addon  ·  Film.B'], 'the sources of this film are not listed, or the one playing is not marked');
  switching.press(1);
  assert.deepStrictEqual(switching.calls.slice(-2), ['ref http://x/b.mkv', 'go /play?ref=R9&type=movie&id=tt5&vid=&back=' + encodeURIComponent('beta#detail/x')], 'another source did not open in the player');

  /* subtitles: position, opacity and a delay that speeds up when the key is held */
  var now = 0, clock = { now: function () { return now; } };
  var styled = player('ext:a', [], [{ lang: 'eng', name: 'English', u: 'a' }], { clock: clock });
  styled.openMenu('style');
  styled.press(4);
  assert.strictEqual(styled.get().bottom, 12, 'subtitles did not move up');
  assert.strictEqual(styled.subEl.style.bottom, '12%', 'the new position was not applied at once');
  assert.strictEqual(styled.stored.subsBottom, '12', 'the subtitle position was not kept');
  styled.press(6);
  assert.strictEqual(styled.get().opacity, 0.8, 'the opacity did not change');
  styled.openMenu('delay');
  now = 10000;
  styled.press(0);
  assert.strictEqual(styled.get().delay, 0.1, 'one press is not a tenth of a second');
  for (var hold = 0; hold < 6; hold++) { now += 100; styled.press(0); }
  assert.strictEqual(styled.get().delay, 1.5, 'holding the key did not speed the delay up');
  now += 2000;
  styled.press(1);
  assert.strictEqual(styled.get().delay, 1.4, 'a single press after a hold kept the large step');
})();

// ---- a paused picture goes dark after five minutes, and any key brings it back (paused.js) ----
(function () {
  var els = {}, events = {}, timers = [];
  var ctx = {
    LOGO: '', TITLE: 'Film', CERT: '', SNAME: '', URL: 'http://x/a.mp4', HAS_MEDIA_TOOLS: false, subHolding: false, mode: 'video',
    document: { getElementById: function (id) { return els[id] || (els[id] = element(id)); }, createElement: element },
    v: { paused: true, addEventListener: function (n, f) { events[n] = f; } },
    load: { style: { display: 'none' } }, subEl: { style: {} }, xhr: function () {}, setArt: function () {},
    setTimeout: function (f, ms) { timers.push({ f: f, ms: ms }); return timers.length; }, clearTimeout: function () {}
  };
  vm.runInNewContext(src('player/paused.js'), ctx);
  events.pause();
  var dim = timers.filter(function (t) { return t.ms === 300000; })[0];
  assert.ok(dim, 'a pause did not start the five-minute wait');
  timers.forEach(function (t) { if (t !== dim) t.f(); });
  assert.strictEqual(els.pv.className, 'show', 'the paused screen did not show');
  dim.f();
  assert.strictEqual(els.pv.className, 'show dim', 'a long pause did not darken the picture');
  assert.strictEqual(ctx.subEl.style.visibility, 'hidden', 'the subtitle stayed lit on the dark screen');
  vm.runInNewContext('wakePaused()', ctx);
  assert.strictEqual(els.pv.className, 'show', 'a key did not bring the paused screen back');
  assert.strictEqual(ctx.subEl.style.visibility, '', 'the subtitle did not come back');
  ctx.v.paused = false;
  events.play();
  assert.strictEqual(els.pv.className, '', 'playing kept the paused screen');
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
  assert.strictEqual(paused.context.reopenSource(), true, 'a torrent whose link ended was not opened again');
  assert.strictEqual(paused.video.src, torrent, 'the torrent did not go back to its address on :11470');
  assert.strictEqual(paused.video.loads, 1);
  paused.video.currentTime = 0;
  paused.listeners.loadedmetadata();
  assert.strictEqual(paused.video.currentTime, 1234, 'the film did not return to where it was');
  assert.strictEqual(paused.video.plays, 1, 'the film did not start again');
  assert.strictEqual(paused.listeners.loadedmetadata, undefined, 'a later load would jump back to the old position');
  assert.strictEqual(paused.context.reopenSource(), false, 'a link that keeps failing must offer another source, not loop');

  assert.strictEqual(player('http://example.com/film.mp4', true).context.reopenSource(), true, 'a direct link that dropped was not opened again');
  assert.strictEqual(player(torrent, false).context.reopenSource(), false, 'a torrent that never played is a startup failure, not a pause');
})();

// ---- Skip intro and recap (skips.js), from the databases and from chapter names ----
(function () {
  var listeners = {}, asked = [];
  var el = { className: '', textContent: '', addEventListener: function () {} };
  var ctx = {
    VID: 'tt1:1:2', P: { skipIntro: 'Skip intro', skipRecap: 'Skip recap' }, mediaInfo: null,
    v: { currentTime: 0, duration: 3000, addEventListener: function (n, fn) { (listeners[n] = listeners[n] || []).push(fn); } },
    document: { getElementById: function () { return el; } },
    xhr: function (u, cb) { asked.push(u); cb({ segments: [{ kind: 'recap', start: 0, end: 40 }, { kind: 'outro', start: 2800, end: 2990 }] }); }
  };
  vm.runInNewContext(src('player/skips.js') + ';this.skipNow=skipNow;this.creditsStart=creditsStart;this.chapterSkips=chapterSkips;', ctx);
  function at(t) { ctx.v.currentTime = t; listeners.timeupdate.forEach(function (fn) { fn(); }); }
  listeners.playing[0]();
  listeners.playing[0]();
  assert.deepStrictEqual(asked, ['/skips?vid=tt1%3A1%3A2'], 'the episode times were not asked once');
  at(10);
  assert.strictEqual(el.textContent + '|' + el.className, 'Skip recap|show', 'the recap did not offer to be skipped');
  assert.strictEqual(ctx.skipNow(), true, 'OK did not skip');
  assert.strictEqual(ctx.v.currentTime, 40, 'the recap was not skipped to its end');
  assert.strictEqual(ctx.skipNow(), false, 'OK skipped with nothing to skip');
  ctx.mediaInfo = { chapters: [{ t: 0, name: 'Recap' }, { t: 60, name: 'Opening' }, { t: 150, name: 'Episode' }] };
  ctx.chapterSkips();
  at(70);
  assert.strictEqual(el.textContent, 'Skip intro', 'a chapter named Opening did not offer to be skipped');
  ctx.skipNow();
  assert.strictEqual(ctx.v.currentTime, 150, 'the opening chapter was not skipped to the next chapter');
  at(500);
  assert.strictEqual(el.className, '', 'the button stayed after the opening');
  assert.strictEqual(ctx.creditsStart(), 2800, 'the end credits were not known');
})();
console.log('OK: settings menu shows what is in use, with episodes, chapters, torrent files, picture, speed and subtitle position.');
console.log('OK: torrent opened again after a long pause.');
console.log('OK: watched state like the official apps, next-episode countdown, next episode opened directly, waiting for a chosen subtitle, do not save history, still-watching prompt, per-title audio, subtitles and delay, addon request URLs, subtitle addon choice, controls kept while loading, exact seek steps.');
