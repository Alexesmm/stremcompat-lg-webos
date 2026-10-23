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
    getElementsByClassName: function () { return [element()]; },
    getElementsByTagName: function () { return []; },
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
  assert.strictEqual(get('chipSearch').textContent, expectedLanguage === 'pt-BR' ? 'Buscar' : 'Search');
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
firstRun.context.__STREMIO_SET_UI_LANGUAGE__('pt-BR');
assert.strictEqual(firstRun.context.__STREMIO_UI_LANGUAGE__(), 'pt-BR');
assert.strictEqual(firstRun.context.localStorage.getItem('uiLanguage'), 'pt-BR', 'language preference was not persisted');
assert.strictEqual(firstRun.get('chipSearch').textContent, 'Buscar', 'language change was not applied immediately');
run(unavailableStorage(), 'scrLogin');
run(accountStorage(), 'scrBoard');
run(memoryStorage({ uiLanguage: 'pt-BR' }), 'scrLogin', null, 'pt-BR');
run(memoryStorage({ uiLanguage: 'unsupported-locale' }), 'scrLogin', null, 'en-US');
run(emptyStorage(), 'scrLogin', { lgEmail: true, lgPass: true });
console.log('OK: Chromium 38 startup keeps English as the fallback, persists Brazilian Portuguese and reaches login or home.');
