'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var sourceHas = require('./lib/source-check').sourceHas;

var source = fs.readFileSync(path.join(__dirname, '..', 'service', 'beta-app.js'), 'utf8');

function element(id) {
  var el = {
    id: id || '', className: '', style: {}, value: '', innerHTML: '', textContent: '',
    children: [], offsetHeight: 100, offsetTop: 0, parentNode: null,
    appendChild: function (child) { child.parentNode = this;this.children.push(child);return child; },
    removeChild: function () {}, insertBefore: function () {}, addEventListener: function () {},
    getElementsByClassName: function (name) {
      if (name === 'navlabel') {
        if (!this._navLabel) this._navLabel = element(this.id + '-label');
        return [this._navLabel];
      }
      return [element()];
    },
    getElementsByTagName: function () { return []; },
    querySelector: function (selector) {
      if (selector === '.navlabel') {
        if (!this._navLabel) this._navLabel = element(this.id + '-label');
        return this._navLabel;
      }
      return null;
    },
    focus: function () {}, blur: function () {}, pause: function () {}, load: function () {},
    attributes: {},
    setAttribute: function (name, value) { this.attributes[name] = String(value); },
    getAttribute: function (name) { return this.attributes[name] || null; },
    removeAttribute: function (name) { delete this.attributes[name]; }
  };
  return el;
}

function run(storage, expectedScreen, missingIds, expectedLanguage) {
  var elements = {};
  var body = element('body');
  missingIds = missingIds || {};
  function get(id) { if (missingIds[id]) return null;if (!elements[id]) elements[id] = element(id);return elements[id]; }
  var document = {
    body: body, activeElement: null,
    getElementById: get,
    createElement: function (tag) { return element(tag); },
    addEventListener: function () {}
  };
  var failure = null;
  var context = {
    document: document,
    localStorage: storage,
    location: { hash: '', reload: function () {}, replace: function () {} },
    history: { state: null, pushState: function () {}, replaceState: function () {}, back: function () {} },
    navigator: { userAgent: 'QtWebEngine/5.2.1 Chrome/38.0.2125.122 WebAppManager' },
    XMLHttpRequest: function () { this.open=function(){};this.send=function(){};this.abort=function(){};this.setRequestHeader=function(){}; },
    Image: function () { return element('img'); },
    setTimeout: function (callback, delay) { if ((delay || 0) < 500) callback();return 1; }, clearTimeout: function () {},
    setInterval: function () { return 1; }, clearInterval: function () {},
    console: console
  };
  context.window = context;
  context.window.addEventListener = function () {};
  context.window.__STREMIO_PHASE__ = function (phase) { context.phase = phase; };
  context.window.__STREMIO_BOOT_ERROR__ = function (message, line) { failure = String(line) + ': ' + String(message); };
  vm.runInNewContext(source, context, { filename: 'beta-app.js', timeout: 2000 });
  assert.strictEqual(failure, null, failure || 'unexpected startup failure');
  assert.strictEqual(context.window.__STREMIO_BOOT_DONE__, true);
  expectedLanguage = expectedLanguage || 'en-US';
  assert.strictEqual(context.window.__STREMIO_UI_LANGUAGE__(), expectedLanguage, 'unexpected interface language');
  assert.strictEqual(get('chipSearch').querySelector('.navlabel').textContent, expectedLanguage === 'pt-BR' ? 'Buscar' : 'Search');
  assert.strictEqual(get('chipAddons').querySelector('.navlabel').textContent, 'Addons');
  assert.strictEqual(get('lgQrTitle').textContent, expectedLanguage === 'pt-BR' ? 'Entrar pelo celular' : 'Sign in with your phone');
  var passElement = get('lgPass');
  if (passElement) assert.strictEqual(passElement.getAttribute('placeholder'), expectedLanguage === 'pt-BR' ? 'Senha' : 'Password');
  assert.ok(get('lgLang').textContent.indexOf(expectedLanguage === 'pt-BR' ? 'Português (Brasil)' : 'English') >= 0, 'language picker label was not localized');
  assert.ok(/\bon\b/.test(get(expectedScreen).className), expectedScreen + ' was not shown');
  assert.strictEqual(get('boot').style.display, 'none');
  if (expectedScreen === 'scrLogin') {
    assert.ok(/\blogin\b/.test(body.className), 'login body state was not enabled');
    assert.strictEqual(get('logobg').className, '', 'login watermark was not disabled');
  } else {
    assert.ok(!/\blogin\b/.test(body.className), 'login body state leaked into authenticated UI');
  }
  return { context: context, get: get, body: body };
}

function memoryStorage(initial) {
  var values = initial || {};
  return {
    get length() { return Object.keys(values).length; },
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem: function (key, value) { values[key] = String(value); },
    removeItem: function (key) { delete values[key]; },
    key: function (index) { return Object.keys(values)[index] || null; }
  };
}

function emptyStorage() {
  return memoryStorage();
}

function unavailableStorage() {
  var storage = { getItem: function () { throw new Error('storage unavailable'); }, setItem: function () { throw new Error('storage unavailable'); }, key: function () { throw new Error('storage unavailable'); } };
  Object.defineProperty(storage, 'length', { get: function () { throw new Error('storage unavailable'); } });
  return storage;
}

function accountStorage() {
  return memoryStorage({
    user: JSON.stringify({ _id: 'test-user', email: 'test@example.com' }),
    authKey: JSON.stringify('test-auth-key'),
    addons: '[]'
  });
}

var firstRun = run(emptyStorage(), 'scrLogin', null, 'en-US');
assert.strictEqual(typeof firstRun.context.__STREMIO_RESUME_CHECK__, 'function', 'runtime resume recovery hook is missing');
assert.strictEqual(typeof firstRun.context.__STREMIO_MANUAL_RECOVER__, 'function', 'manual recovery hook is missing');
assert.deepStrictEqual(JSON.parse(JSON.stringify(firstRun.context.__STREMIO_STREAM_COMPAT__({ title: 'AV1 2160p' }))), { labels: ['AV1'], rank: 3 });
assert.deepStrictEqual(JSON.parse(JSON.stringify(firstRun.context.__STREMIO_STREAM_COMPAT__({ title: 'Dolby Vision HDR10 HEVC Main10 DTS' }))), { labels: ['Dolby Vision', 'HEVC 10-bit', 'DTS'], rank: 0 });
var manySources = [], qualities = ['4K', '1080p', '720p', 'SD', 'Other'];
for (var si = 0; si < 80; si++) manySources.push({
  url: 'https://media.example/' + si, quality: qualities[si % qualities.length],
  seeders: 80 - si, compatRank: si % 13 === 0 ? 2 : 0, _seq: si
});
var compacted = firstRun.context.__STREMIO_COMPACT_SOURCES__(manySources, 12);
assert.ok(compacted.items.length <= 12, 'global source budget was exceeded');
qualities.forEach(function (quality) {
  assert.ok(compacted.items.some(function (item) { return item.quality === quality; }), 'source sampling lost ' + quality);
});
assert.ok(!sourceHas(source, "location.assign('/play?u='"), 'beta player fallback leaked a source URL into browser history');
assert.ok(!sourceHas(source, 'self.poll=setInterval'), 'QR polling still allows overlapping interval requests');
assert.ok(sourceHas(source, "if(this.type!=='series')this.addBtn(tx('watch')"), 'movie details do not expose an explicit Watch action');
assert.ok(sourceHas(source, "$('dPoster')._detailId===this.id"), 'detail poster is not tied to the current title');
assert.ok(sourceHas(source, 'detail.meta===m&&detail.id===mediaId'), 'late detail artwork can overwrite the current title');
assert.ok(sourceHas(source, 'function queuePointerHover(target)'), 'Magic Remote hover navigation is not debounced');
assert.ok(sourceHas(source, "def.k==='__reload'"), 'Settings recovery action is not wired');
assert.ok(sourceHas(source, "$('bg2').style.backgroundImage='none'"), 'inactive backdrop texture is not released');
var episodeModel = firstRun.context.__STREMIO_EPISODE_MODEL__([
  { id:'show:2:2',season:2,episode:2,title:'Later' },
  { id:'show:0:1',season:0,episode:1,title:'Special' },
  { id:'show:1:2',season:1,episode:2,title:'Second' },
  { id:'show:1:1',season:1,episode:1,title:'First' },
  { id:'show:2:1',season:2,episode:1,title:'Third',absoluteEpisode:101 }
]);
assert.strictEqual(episodeModel.seasons[0].n, 1, 'regular seasons were not sorted before specials');
assert.strictEqual(episodeModel.seasons[episodeModel.seasons.length-1].n, 0, 'specials were not placed last');
assert.strictEqual(episodeModel.linear.length, 4, 'specials leaked into continuous episode order');
assert.strictEqual(episodeModel.linear[0]._stremAbsolute, 1, 'continuous numbering did not start at one');
assert.strictEqual(episodeModel.linear[2]._stremAbsolute, 101, 'provider absolute episode number was not preserved');
assert.strictEqual(firstRun.context.__STREMIO_EPISODE_INDEX__(episodeModel.linear,101),2,'overall episode lookup did not find the requested episode');
assert.strictEqual(firstRun.context.__STREMIO_EPISODE_INDEX__(episodeModel.linear,999),-1,'overall episode lookup accepted a missing episode');
var longSeason = [];
for (var le = 0; le < 30; le++) longSeason.push({ id:'long:1:x' + le, season:1, title:'Untitled ' + le });
longSeason.push({ id:'long:1:x3', season:1, title:'Duplicate of 3' });
longSeason.unshift({ id:'long:1:2', season:1, episode:2 }, { id:'long:1:1', season:1, episode:1 });
var longModel = firstRun.context.__STREMIO_EPISODE_MODEL__(longSeason);
assert.strictEqual(longModel.linear.length, 32, 'a video listed twice was counted twice');
assert.strictEqual(longModel.linear[0].id, 'long:1:1', 'numbered episodes did not come first');
assert.strictEqual(longModel.linear[2].id, 'long:1:x0', 'unnumbered episodes lost the order the addon sent');
assert.strictEqual(longModel.linear[31].id, 'long:1:x29', 'unnumbered episodes were reordered');
assert.strictEqual(longModel.linear[2]._stremSeasonEpisode, 3, 'an unnumbered episode reused an existing number');
assert.strictEqual(longModel.linear[31]._stremAbsolute, 32, 'overall numbering skipped or repeated an episode');
var flatModel = firstRun.context.__STREMIO_EPISODE_MODEL__([{ id:'ch:a', title:'A' }, { id:'ch:b', title:'B' }]);
assert.strictEqual(flatModel.linear.length, 2, 'a series without seasons had no overall numbering');
assert.strictEqual(flatModel.seasons[0].n, 1, 'a series without seasons was shown as specials');
assert.ok(!sourceHas(source, 'window.prompt('),'episode jump still depends on an unsupported browser prompt');
assert.strictEqual(typeof firstRun.context.__STREMIO_EPISODE_JUMP__,'object','in-app episode keypad is missing');
firstRun.context.__STREMIO_EPISODE_JUMP__.show(12);
firstRun.context.__STREMIO_EPISODE_JUMP__.press(6);
firstRun.context.__STREMIO_EPISODE_JUMP__.press(10);
assert.strictEqual(firstRun.context.__STREMIO_EPISODE_JUMP__.value,'70','episode keypad did not replace the suggested number and append digits');
firstRun.context.__STREMIO_EPISODE_JUMP__.close();
var cwCard = firstRun.context.__STREMIO_CW_CARD__;
var ep22 = 22 * 60000, movie = 120 * 60000;
var watching = cwCard({ _id:'tt5', type:'series', name:'Show', state:{ video_id:'tt5:2:5', timeOffset:10 * 60000, duration:ep22 } });
assert.strictEqual(watching.minutesLeft, 12, 'Continue Watching minutes left are wrong');
assert.strictEqual(watching.upNext, false, 'an episode in progress was treated as finished');
firstRun.context.localStorage.setItem('tvnext_tt5_tt5:2:5', 'tt5:2:6');
var done = cwCard({ _id:'tt5', type:'series', name:'Show', state:{ video_id:'tt5:2:5', timeOffset:ep22 - 90000, duration:ep22 } });
assert.strictEqual(done.upNext && done.videoId, 'tt5:2:6', 'a finished episode did not become its next episode');
assert.strictEqual(cwCard({ _id:'m', type:'movie', state:{ video_id:'m', timeOffset:movie - 10 * 60000, duration:movie } }).upNext, false, 'ten minutes before the end of a film counted as finished');
assert.strictEqual(cwCard({ _id:'c', type:'movie', state:{ video_id:'c', timeOffset:65000, duration:600000 } }).minutesLeft, 9, 'minutes left were not rounded');
var tagText = firstRun.context.__STREMIO_SOURCE_TAGS__({ name:'Torrentio 4k', title:'Show.2160p.WEB-DL.DDP5.1.DV.HDR10.HEVC 24.5 GB', quality:'4K', seeders:532 }).map(function (x) { return x.t; }).join(',');
assert.strictEqual(tagText, '4K,HDR,DV,HEVC,DD+,24.5 GB,532 seeds', 'source tags were not read from the stream text');
var afterFail = firstRun.context.__STREMIO_NEXT_AFTER_FAILURE__([
  { stored:'q', addon:'Last' },
  { addon:'Torrentio', name:'A', title:'broken' },
  { addon:'Torrentio', name:'B', title:'good' }
], { addon:'Torrentio', text:'A broken' });
assert.strictEqual(afterFail && afterFail.name, 'B', 'the failed source was offered again');
var baseEpisodes={videos:[{id:'show:1:1',season:1,episode:1}]};
assert.strictEqual(firstRun.context.__STREMIO_MERGE_EPISODES__(baseEpisodes,{videos:[{id:'show:1:1',season:1,episode:1,thumbnail:'/still.jpg',overview:'Overview'}]}),true,'metadata enrichment did not report a change');
assert.strictEqual(baseEpisodes.videos[0].thumbnail,'/still.jpg','metadata enrichment did not fill a missing thumbnail');
var nextMatch = firstRun.context.__STREMIO_MATCH_NEXT_SOURCE__([
  { addon:'Other',quality:'1080p',title:'H264 AAC',seeders:900,compatRank:0 },
  { addon:'Torrentio',quality:'4K',title:'HEVC 10bit DDP WEB-DL',seeders:20,compatRank:0 },
  { addon:'Torrentio',quality:'4K',title:'H264 AAC',seeders:200,compatRank:0 }
],{addon:'Torrentio',quality:'4K',text:'HEVC 10bit DDP WEB-DL',compat:'HEVC 10-bit'});
assert.strictEqual(nextMatch.title,'HEVC 10bit DDP WEB-DL','next episode did not prefer the closest safe source traits');
firstRun.context.__STREMIO_SET_UI_LANGUAGE__('pt-BR');
assert.strictEqual(firstRun.context.__STREMIO_UI_LANGUAGE__(), 'pt-BR');
assert.strictEqual(firstRun.context.localStorage.getItem('uiLanguage'), 'pt-BR', 'language preference was not persisted');
assert.strictEqual(firstRun.get('chipSearch').querySelector('.navlabel').textContent, 'Buscar', 'language change was not applied immediately');
run(unavailableStorage(), 'scrLogin');
run(accountStorage(), 'scrBoard');
var animeRun = run(memoryStorage({
  user: JSON.stringify({ _id: 'anime-user', email: 'anime@example.com' }),
  authKey: JSON.stringify('anime-auth-key'),
  addons: JSON.stringify([{ transportUrl: 'https://anime.example/manifest.json', manifest: { id: 'anime.test', name: 'Anime Test', catalogs: [{ type: 'anime', id: 'popular', name: 'Popular Anime' }] } }])
}), 'scrBoard');
var discoverTypes = JSON.parse(JSON.stringify(animeRun.context.__STREMIO_DISCOVER_TYPES__()));
assert.ok(discoverTypes.some(function (type) { return type.value === 'anime' && type.label === 'Anime'; }), 'Discover did not expose an installed anime catalog type');
run(memoryStorage({ uiLanguage: 'pt-BR' }), 'scrLogin', null, 'pt-BR');
run(memoryStorage({ uiLanguage: 'unsupported-locale' }), 'scrLogin', null, 'en-US');
run(emptyStorage(), 'scrLogin', { lgEmail: true, lgPass: true });
console.log('OK: Chromium 38 startup keeps English as the fallback, persists Brazilian Portuguese and reaches login or home.');
