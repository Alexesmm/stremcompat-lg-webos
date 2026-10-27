'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

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
assert.ok(source.indexOf("location.assign('/play?u='") < 0, 'beta player fallback leaked a source URL into browser history');
assert.ok(source.indexOf('self.poll=setInterval') < 0, 'QR polling still allows overlapping interval requests');
assert.ok(source.indexOf("if(this.type!=='series')this.addBtn(tx('watch')") >= 0, 'movie details do not expose an explicit Watch action');
assert.ok(source.indexOf("$('dPoster')._detailId===this.id") >= 0, 'detail poster is not tied to the current title');
assert.ok(source.indexOf('detail.meta===m&&detail.id===mediaId') >= 0, 'late detail artwork can overwrite the current title');
assert.ok(source.indexOf('function queuePointerHover(target)') >= 0, 'Magic Remote hover navigation is not debounced');
assert.ok(source.indexOf("def.k==='__reload'") >= 0, 'Settings recovery action is not wired');
assert.ok(source.indexOf("$('bg2').style.backgroundImage='none'") >= 0, 'inactive backdrop texture is not released');
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
assert.ok(source.indexOf('window.prompt(')<0,'episode jump still depends on an unsupported browser prompt');
assert.strictEqual(typeof firstRun.context.__STREMIO_EPISODE_JUMP__,'object','in-app episode keypad is missing');
firstRun.context.__STREMIO_EPISODE_JUMP__.show(12);
firstRun.context.__STREMIO_EPISODE_JUMP__.press(6);
firstRun.context.__STREMIO_EPISODE_JUMP__.press(10);
assert.strictEqual(firstRun.context.__STREMIO_EPISODE_JUMP__.value,'70','episode keypad did not replace the suggested number and append digits');
firstRun.context.__STREMIO_EPISODE_JUMP__.close();
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
