'use strict';

var assert = require('assert');
var childProcess = require('child_process');
var fs = require('fs');
var http = require('http');
var os = require('os');
var path = require('path');

var stage = path.resolve(process.argv[2] || '');
var appPort = parseInt(process.argv[3], 10);
var width = parseInt(process.argv[4], 10);
var height = parseInt(process.argv[5], 10);
var output = path.resolve(process.argv[6] || '');
var chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
if (!stage || !appPort || !width || !height || !output) throw new Error('Usage: node visualtest-layout.js <stage> <port> <width> <height> <output.png>');
if (!fs.existsSync(chrome)) throw new Error('Chrome was not found: ' + chrome);

function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
function getJson(port, pathname) {
  return new Promise(function (resolve, reject) {
    var req = http.get({ hostname: '127.0.0.1', port: port, path: pathname }, function (res) {
      var chunks = [];res.on('data', function (d) { chunks.push(d); });res.on('end', function () {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(e); }
      });
    });
    req.setTimeout(1500, function () { req.destroy(new Error('timeout')); });req.on('error', reject);
  });
}
function waitJson(port, pathname, left) {
  return getJson(port, pathname).catch(function (error) {
    if (!left) throw error;
    return delay(120).then(function () { return waitJson(port, pathname, left - 1); });
  });
}
function devtools(url) {
  return new Promise(function (resolve, reject) {
    var socket = new WebSocket(url), next = 1, pending = {}, exceptions = [];
    socket.onopen = function () {
      socket.onmessage = function (event) {
        var message = JSON.parse(event.data);
        if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params && message.params.exceptionDetails);
        if (message.id && pending[message.id]) {
          var item = pending[message.id];delete pending[message.id];
          if (message.error) item.reject(new Error(message.error.message));else item.resolve(message.result);
        }
      };
      function call(method, params) {
        return new Promise(function (ok, bad) {
          var id = next++;pending[id] = { resolve: ok, reject: bad };
          socket.send(JSON.stringify({ id: id, method: method, params: params || {} }));
        });
      }
      resolve({ call: call, exceptions: exceptions, close: function () { socket.close(); } });
    };
    socket.onerror = function () { reject(new Error('DevTools websocket failed')); };
  });
}

async function main() {
  var debugPort = 9300 + Math.floor(Math.random() * 400);
  var mockPort = 9700 + Math.floor(Math.random() * 400);
  var browserProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'stremcompat-visual-'));
  var mockCatalogs = [], mockAddon;
  for (var ci = 0; ci < 14; ci++) mockCatalogs.push({ type: 'movie', id: 'catalog-' + ci, name: 'Catalog ' + ci });
  var mockServer = http.createServer(function (req, res) {
    var match = req.url.match(/^\/catalog\/movie\/catalog-(\d+)\.json/);
    if (!match) { res.writeHead(404);res.end();return; }
    var index = parseInt(match[1], 10);
    if (index === 0 || index === 2) { res.writeHead(503);res.end();return; }
    var metas = [];
    for (var mi = 0; mi < 3; mi++) metas.push({ id: 'visual-test:' + index + ':' + mi, type: 'movie', name: 'Catalog ' + index + ' item ' + mi });
    res.writeHead(200, { 'Content-Type': 'application/json' });res.end(JSON.stringify({ metas: metas }));
  });
  await new Promise(function (resolve, reject) { mockServer.once('error', reject);mockServer.listen(mockPort, '127.0.0.1', resolve); });
  mockAddon = [{ transportUrl: 'http://127.0.0.1:' + mockPort + '/manifest.json', manifest: {
    id: 'org.stremcompat.visualtest', name: 'Visual Test', types: ['movie'], resources: ['catalog'], catalogs: mockCatalogs
  } }];
  var server = childProcess.spawn(process.execPath, [path.join(stage, 'service', 'tvserver.js')], {
    cwd: stage, windowsHide: true, stdio: 'ignore', env: Object.assign({}, process.env, { TVSERVER_LOG: path.join(stage, 'visualtest-tvserver.log') })
  });
  var browser, protocol;
  try {
    await waitJson(appPort, '/health', 120);
    browser = childProcess.spawn(chrome, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-default-apps', '--disable-extensions',
      '--disable-sync', '--hide-scrollbars', '--no-first-run', '--remote-debugging-port=' + debugPort,
      '--window-size=' + width + ',' + height, '--user-data-dir=' + browserProfile,
      'http://127.0.0.1:' + appPort + '/beta?visualtest=1'
    ], { cwd: path.dirname(chrome), windowsHide: true, stdio: 'ignore' });
    var pages = await waitJson(debugPort, '/json', 160);
    var page = pages.filter(function (item) { return item.type === 'page' && item.url.indexOf('/beta') >= 0; })[0];
    assert.ok(page && page.webSocketDebuggerUrl, 'Chrome did not open the StremCompat shell.');
    protocol = await devtools(page.webSocketDebuggerUrl);
    await protocol.call('Runtime.enable');
    await protocol.call('Page.enable');
    await protocol.call('Emulation.setDeviceMetricsOverride', { width: width, height: height, deviceScaleFactor: 1, mobile: false });
    await protocol.call('Page.navigate', { url: 'http://127.0.0.1:' + appPort + '/beta?visualtest=' + width });
    await delay(2200);
    var expression = "(function(){function r(id){var e=document.getElementById(id),b=e&&e.getBoundingClientRect();return b?{left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height}:null;}function d(id){var e=document.getElementById(id);return e?getComputedStyle(e).display:'';}function s(id){var e=document.getElementById(id);return e?e.textContent:'';}return JSON.stringify({width:innerWidth,height:innerHeight,done:!!window.__STREMIO_BOOT_DONE__,failed:!!window.__STREMIO_BOOT_FAILED__,login:document.getElementById('scrLogin').className,bodyClass:document.body.className,boot:document.getElementById('boot').style.display,loginBox:r('lgBox'),languageBox:r('lgLang'),language:window.__STREMIO_UI_LANGUAGE__&&window.__STREMIO_UI_LANGUAGE__(),languageText:s('lgLang'),loginTitle:s('lgQrTitle'),topnavDisplay:d('topnav'),logoDisplay:d('logobg'),bodyWidth:document.body.scrollWidth,bodyHeight:document.body.scrollHeight});})()";
    var evaluated = await protocol.call('Runtime.evaluate', { expression: expression, returnByValue: true });
    var state = JSON.parse(evaluated.result.value);
    assert.strictEqual(state.width, width, 'Unexpected viewport width.');
    assert.strictEqual(state.height, height, 'Unexpected viewport height.');
    assert.strictEqual(state.failed, false, 'Frontend reported a boot failure.');
    assert.strictEqual(state.done, true, 'Frontend did not complete boot.');
    assert.ok(/\bon\b/.test(state.login), 'Login screen is not active.');
    assert.ok(/\blogin\b/.test(state.bodyClass), 'Login body state is not active.');
    assert.strictEqual(state.boot, 'none', 'Boot overlay is still visible.');
    assert.strictEqual(state.topnavDisplay, 'none', 'Top navigation is visible before login.');
    assert.strictEqual(state.logoDisplay, 'none', 'Decorative Stremio watermark is visible before login.');
    assert.strictEqual(state.language, 'en-US', 'First-run interface did not default to English.');
    assert.ok(state.languageText.indexOf('English') >= 0, 'English language selector is missing.');
    assert.strictEqual(state.loginTitle, 'Sign in with your phone', 'Login text was not rendered in English.');
    assert.ok(state.loginBox && state.loginBox.left >= 0 && state.loginBox.top >= 0, 'Login layout starts outside the viewport.');
    assert.ok(state.loginBox.right <= width && state.loginBox.bottom <= height, 'Login layout is clipped at ' + width + 'x' + height + '.');
    assert.ok(state.languageBox && state.languageBox.left >= 0 && state.languageBox.top >= 0, 'Language selector starts outside the viewport.');
    assert.ok(state.languageBox.right <= width && state.languageBox.bottom <= height, 'Language selector is clipped at ' + width + 'x' + height + '.');
    assert.strictEqual(protocol.exceptions.length, 0, 'Chrome reported a JavaScript exception.');
    var shot = await protocol.call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, Buffer.from(shot.data, 'base64'));
    var localized = await protocol.call('Runtime.evaluate', { expression: "window.__STREMIO_SET_UI_LANGUAGE__('pt-BR');JSON.stringify({language:window.__STREMIO_UI_LANGUAGE__(),languageText:document.getElementById('lgLang').textContent,loginTitle:document.getElementById('lgQrTitle').textContent,password:document.getElementById('lgPass').getAttribute('placeholder')})", returnByValue: true });
    var localizedState = JSON.parse(localized.result.value);
    assert.strictEqual(localizedState.language, 'pt-BR', 'Brazilian Portuguese selection was not persisted.');
    assert.ok(localizedState.languageText.indexOf('Português (Brasil)') >= 0, 'Portuguese language selector was not rendered.');
    assert.strictEqual(localizedState.loginTitle, 'Entrar pelo celular', 'Login text was not translated.');
    assert.strictEqual(localizedState.password, 'Senha', 'Login placeholder was not translated.');
    await protocol.call('Runtime.evaluate', { expression: "window.__STREMIO_SET_UI_LANGUAGE__('en-US')" });
    await protocol.call('Runtime.evaluate', { expression: "localStorage.setItem('user',JSON.stringify({_id:'visual-user',email:'visual@example.com'}));localStorage.setItem('authKey',JSON.stringify('visual-test-key'));localStorage.setItem('addons'," + JSON.stringify(JSON.stringify(mockAddon)) + ");" });
    await protocol.call('Page.navigate', { url: 'http://127.0.0.1:' + appPort + '/beta?visualtest=authenticated' });
    await delay(1800);
    var authenticated = await protocol.call('Runtime.evaluate', { expression: "JSON.stringify({bodyClass:document.body.className,topnavDisplay:getComputedStyle(document.getElementById('topnav')).display,home:document.getElementById('scrBoard').className,done:!!window.__STREMIO_BOOT_DONE__,failed:!!window.__STREMIO_BOOT_FAILED__,message:window.__STREMIO_BOOT_MESSAGE__||'',line:window.__STREMIO_BOOT_LINE__||'',phase:window.__STREMIO_BOOT_PHASE__||''})", returnByValue: true });
    var authenticatedState = JSON.parse(authenticated.result.value);
    assert.strictEqual(authenticatedState.failed, false, 'Authenticated frontend reported a boot failure: ' + JSON.stringify(authenticatedState));
    assert.strictEqual(authenticatedState.done, true, 'Authenticated frontend did not complete boot.');
    assert.ok(!/\blogin\b/.test(authenticatedState.bodyClass), 'Login body state leaked after authentication.');
    assert.notStrictEqual(authenticatedState.topnavDisplay, 'none', 'Top navigation stayed hidden after authentication.');
    assert.ok(/\bon\b/.test(authenticatedState.home), 'Home screen is not active after authentication.');
    var boardExpression = "(function(){var rows=document.querySelectorAll('#rows>.row'),visible=0,focused=-1,card=null;for(var i=0;i<rows.length;i++){if(getComputedStyle(rows[i]).display!=='none')visible++;var f=rows[i].querySelector('.card.f');if(f){focused=i;card=f;}}var cr=card&&card.getBoundingClientRect(),clip=document.getElementById('rowsClip').getBoundingClientRect();return JSON.stringify({total:rows.length,visible:visible,focused:focused,transform:document.getElementById('rows').style.transform,card:cr?{top:cr.top,bottom:cr.bottom,left:cr.left,right:cr.right}:null,clip:{top:clip.top,bottom:clip.bottom}});})()";
    var boardEval = await protocol.call('Runtime.evaluate', { expression: boardExpression, returnByValue: true });
    var boardState = JSON.parse(boardEval.result.value);
    assert.strictEqual(boardState.total, 14, 'Profile discarded addon catalogs before the configured row limit.');
    assert.strictEqual(boardState.visible, 12, 'Failed addon catalogs were not isolated from successful rows.');
    assert.strictEqual(boardState.focused, 1, 'Focus did not settle on the first successful catalog after an initial failure.');
    assert.ok(boardState.card && boardState.card.top >= boardState.clip.top && boardState.card.bottom <= height, 'Focused catalog card is clipped at ' + width + 'x' + height + '.');
    await protocol.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40, key: 'ArrowDown' });
    await delay(180);
    var nextBoardEval = await protocol.call('Runtime.evaluate', { expression: boardExpression, returnByValue: true });
    var nextBoardState = JSON.parse(nextBoardEval.result.value);
    assert.strictEqual(nextBoardState.focused, 3, 'Remote Down did not skip the failed catalog row.');
    assert.notStrictEqual(nextBoardState.transform, 'translateY(0px)', 'Catalog board stayed fixed after moving to the next successful row.');
    assert.ok(nextBoardState.card && nextBoardState.card.top >= nextBoardState.clip.top && nextBoardState.card.bottom <= height, 'Next catalog card is clipped at ' + width + 'x' + height + '.');
    var boardShot = await protocol.call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    fs.writeFileSync(output.replace(/\.png$/i, '-board.png'), Buffer.from(boardShot.data, 'base64'));
    await protocol.call('Runtime.evaluate', { expression: "(function(){function key(code){var e=document.createEvent('Event');e.initEvent('keydown',true,true);e.keyCode=code;document.dispatchEvent(e);}key(38);key(38);key(39);key(39);key(39);key(40);})()" });
    await delay(150);
    var settingsView = await protocol.call('Runtime.evaluate', { expression: "(function(){var labels=document.querySelectorAll('#setItems .set .lb'),values=document.querySelectorAll('#setItems .set .vl');return JSON.stringify({screen:document.getElementById('scrSet').className,firstLabel:labels.length?labels[0].textContent:'',firstValue:values.length?values[0].textContent:''});})()", returnByValue: true });
    var settingsState = JSON.parse(settingsView.result.value);
    assert.ok(/\bon\b/.test(settingsState.screen), 'Remote navigation did not open Settings.');
    assert.strictEqual(settingsState.firstLabel, 'Interface language', 'Interface language setting is missing.');
    assert.ok(settingsState.firstValue.indexOf('English') >= 0, 'Saved interface language is not shown in Settings.');
    console.log('OK: ' + width + 'x' + height + ' login ' + JSON.stringify(state) + ', catalog navigation ' + JSON.stringify(nextBoardState) + ' -> ' + output);
  } finally {
    if (protocol) protocol.close();
    if (browser) try { browser.kill(); } catch (e) {}
    try { server.kill(); } catch (e) {}
    try { mockServer.close(); } catch (e) {}
    try { fs.rmSync(browserProfile, { recursive: true, force: true }); } catch (e) {}
  }
}

main().catch(function (error) { console.error(error && error.stack || error);process.exitCode = 1; });
