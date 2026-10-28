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

console.log('OK: next-episode countdown, still-watching prompt and per-title audio, subtitles and delay.');
