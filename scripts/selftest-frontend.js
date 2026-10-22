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
    setAttribute: function () {}, removeAttribute: function () {}
  };
  return el;
}

function run(storage, expectedScreen, missingIds) {
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
  assert.ok(/\bon\b/.test(get(expectedScreen).className), expectedScreen + ' was not shown');
  assert.strictEqual(get('boot').style.display, 'none');
}

function emptyStorage() {
  return { length: 0, getItem: function () { return null; }, setItem: function () {}, removeItem: function () {}, key: function () { return null; } };
}

function unavailableStorage() {
  var storage = { getItem: function () { throw new Error('storage unavailable'); }, setItem: function () { throw new Error('storage unavailable'); }, key: function () { throw new Error('storage unavailable'); } };
  Object.defineProperty(storage, 'length', { get: function () { throw new Error('storage unavailable'); } });
  return storage;
}

function accountStorage() {
  var values = {
    user: JSON.stringify({ _id: 'test-user', email: 'test@example.com' }),
    authKey: JSON.stringify('test-auth-key'),
    addons: '[]'
  };
  var keys = Object.keys(values);
  return {
    length: keys.length,
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem: function (key, value) { values[key] = value; }, removeItem: function (key) { delete values[key]; },
    key: function (index) { return keys[index] || null; }
  };
}

run(emptyStorage(), 'scrLogin');
run(unavailableStorage(), 'scrLogin');
run(accountStorage(), 'scrBoard');
run(emptyStorage(), 'scrLogin', { lgEmail: true, lgPass: true });
console.log('OK: Chromium 38 startup reaches login or home with storage failures and degraded input elements.');
