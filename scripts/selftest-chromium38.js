'use strict';

var assert = require('assert');
var childProcess = require('child_process');
var fs = require('fs');
var http = require('http');
var os = require('os');
var path = require('path');

var root = path.resolve(__dirname, '..');
var serviceRoot = process.argv[2] ? path.resolve(process.argv[2]) : root;
var appPort = parseInt(process.argv[3], 10) || 8082;
var chrome = path.join(root, '.cache', 'chromium38', 'runtime', 'chrome-win32', 'chrome.exe');
var profile = fs.mkdtempSync(path.join(os.tmpdir(), 'stremio-chrome38-'));
if (!fs.existsSync(chrome)) throw new Error('Chromium 38 runtime is missing: ' + chrome);

function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
function getJson(port, pathname) {
  return new Promise(function (resolve, reject) {
    var req = http.get({ hostname: '127.0.0.1', port: port, path: pathname }, function (res) {
      var chunks=[];res.on('data',function(d){chunks.push(d);});res.on('end',function(){
        try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(e){reject(e);}
      });
    });
    req.setTimeout(1000,function(){req.destroy(new Error('timeout'));});req.on('error',reject);
  });
}
function waitJson(port, pathname, left) {
  return getJson(port, pathname).catch(function (error) {
    if (!left) throw error;
    return delay(100).then(function () { return waitJson(port, pathname, left - 1); });
  });
}
function waitHealth(left) {
  return getJson(appPort, '/health').catch(function (error) {
    if (!left) throw error;
    return delay(100).then(function () { return waitHealth(left - 1); });
  });
}
function devtools(url) {
  return new Promise(function (resolve, reject) {
    var socket = new WebSocket(url), next=1, pending={}, exceptions=[];
    socket.onopen=function(){
      socket.onmessage=function(event){var msg=JSON.parse(event.data);
        if(msg.method==='Runtime.exceptionThrown')exceptions.push(msg.params&&msg.params.exceptionDetails);
        if(msg.id&&pending[msg.id]){var p=pending[msg.id];delete pending[msg.id];if(msg.error)p.reject(new Error(msg.error.message));else p.resolve(msg.result);}
      };
      function call(method,params){return new Promise(function(ok,bad){var id=next++;pending[id]={resolve:ok,reject:bad};socket.send(JSON.stringify({id:id,method:method,params:params||{}}));});}
      resolve({call:call,exceptions:exceptions,close:function(){socket.close();}});
    };
    socket.onerror=function(){reject(new Error('DevTools websocket failed'));};
  });
}

async function main() {
  var mockPort = 10100 + Math.floor(Math.random() * 300), mockCatalogs = [], mockAddon;
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
    id: 'org.stremcompat.chrome38test', name: 'Chromium 38 Test', types: ['movie'], resources: ['catalog'], catalogs: mockCatalogs
  } }];
  var server = childProcess.spawn(process.execPath, [path.join(serviceRoot, 'service', 'tvserver.js')], { cwd: serviceRoot, windowsHide: true, stdio: 'ignore' });
  var browser;
  try {
    await waitHealth(100);
    browser = childProcess.spawn(chrome, [
      '--remote-debugging-port=9223', '--user-data-dir=' + profile, '--no-first-run',
      '--disable-default-apps', '--disable-extensions', '--disable-sync', '--disable-gpu',
      '--no-sandbox', '--window-position=-32000,-32000', 'http://127.0.0.1:' + appPort + '/beta?engine=38'
    ], { cwd: path.dirname(chrome), windowsHide: true, stdio: 'ignore' });
    var pages = await waitJson(9223, '/json', 150);
    var page = pages.filter(function (item) { return item.type === 'page' && item.url.indexOf('/beta') >= 0; })[0];
    assert.ok(page && page.webSocketDebuggerUrl, 'Chromium 38 did not open the beta shell.');
    var protocol = await devtools(page.webSocketDebuggerUrl);
    await protocol.call('Runtime.enable');
    await delay(1500);
    var evaluated = await protocol.call('Runtime.evaluate', { expression: "JSON.stringify({done:!!window.__STREMIO_BOOT_DONE__,failed:!!window.__STREMIO_BOOT_FAILED__,phase:window.__STREMIO_BOOT_PHASE__,message:window.__STREMIO_BOOT_MESSAGE__||'',line:window.__STREMIO_BOOT_LINE__||'',login:document.getElementById('scrLogin').className,boot:document.getElementById('boot').style.display,language:window.__STREMIO_UI_LANGUAGE__(),languagePicker:document.getElementById('lgLang').textContent})", returnByValue: true });
    var state = JSON.parse(evaluated.result.value);
    if (state.failed || !state.done || protocol.exceptions.length) console.log(JSON.stringify({ state: state, exceptions: protocol.exceptions }, null, 2));
    assert.strictEqual(state.failed, false, 'browser startup reported failure at ' + state.phase);
    assert.strictEqual(state.done, true, 'browser startup did not finish; phase ' + state.phase);
    assert.ok(/\bon\b/.test(state.login), 'login screen is not active');
    assert.strictEqual(state.boot, 'none', 'boot overlay is still visible');
    assert.strictEqual(state.language, 'en-US', 'first-run interface language is not English');
    assert.ok(/^Language: English/.test(state.languagePicker), 'login language selector is not in English');
    assert.strictEqual(protocol.exceptions.length, 0, 'Chromium 38 reported an exception.');

    var languageEval = await protocol.call('Runtime.evaluate', { expression: "window.__STREMIO_SET_UI_LANGUAGE__('pt-BR');JSON.stringify({language:window.__STREMIO_UI_LANGUAGE__(),stored:localStorage.getItem('uiLanguage'),languagePicker:document.getElementById('lgLang').textContent,emailTitle:document.getElementById('lgEmailTitle').textContent})", returnByValue: true });
    var language = JSON.parse(languageEval.result.value);
    assert.strictEqual(language.language, 'pt-BR', 'Portuguese interface selection was not applied');
    assert.strictEqual(language.stored, 'pt-BR', 'interface language was not persisted locally');
    assert.ok(/^Idioma: Português/.test(language.languagePicker), 'login language selector was not translated');
    assert.strictEqual(language.emailTitle, 'Ou use seu e-mail', 'login copy was not translated');
    await protocol.call('Runtime.evaluate', { expression: "window.__STREMIO_SET_UI_LANGUAGE__('en-US')" });

    await protocol.call('Runtime.evaluate', { expression: "document.getElementById('lgEmail').focus()" });
    await protocol.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40, key: 'ArrowDown' });
    await delay(100);
    var keyboard = await protocol.call('Runtime.evaluate', { expression: "document.getElementById('lgPass').className", returnByValue: true });
    assert.ok(/\bf\b/.test(keyboard.result.value), 'remote Down did not move login focus to password');

    await protocol.call('Runtime.evaluate', { expression: "localStorage.setItem('user',JSON.stringify({_id:'test-user',email:'test@example.com'}));localStorage.setItem('authKey',JSON.stringify('test-auth'));localStorage.setItem('addons'," + JSON.stringify(JSON.stringify(mockAddon)) + ");location.reload()" });
    await delay(1800);
    var homeEval = await protocol.call('Runtime.evaluate', { expression: "(function(){var rows=document.querySelectorAll('#rows>.row'),visible=0,focused=-1;for(var i=0;i<rows.length;i++){if(getComputedStyle(rows[i]).display!=='none')visible++;if(rows[i].querySelector('.card.f'))focused=i;}return JSON.stringify({done:!!window.__STREMIO_BOOT_DONE__,failed:!!window.__STREMIO_BOOT_FAILED__,phase:window.__STREMIO_BOOT_PHASE__,board:document.getElementById('scrBoard').className,boot:document.getElementById('boot').style.display,total:rows.length,visible:visible,focused:focused});})()", returnByValue: true });
    var home = JSON.parse(homeEval.result.value);
    assert.strictEqual(home.failed, false, 'stored-account startup reported failure at ' + home.phase);
    assert.strictEqual(home.done, true, 'stored-account startup did not finish; phase ' + home.phase);
    assert.ok(/\bon\b/.test(home.board), 'home screen is not active for stored account');
    assert.strictEqual(home.boot, 'none', 'stored-account boot overlay is still visible');
    assert.strictEqual(home.total, 14, 'Chromium 38 discarded addon catalogs before the profile limit');
    assert.strictEqual(home.visible, 12, 'Chromium 38 did not isolate failed catalog rows');
    assert.strictEqual(home.focused, 1, 'Chromium 38 focus did not settle on the first successful catalog');
    await protocol.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40, key: 'ArrowDown' });
    await delay(150);
    var movedEval = await protocol.call('Runtime.evaluate', { expression: "(function(){var rows=document.querySelectorAll('#rows>.row'),focused=-1;for(var i=0;i<rows.length;i++)if(rows[i].querySelector('.card.f'))focused=i;return JSON.stringify({focused:focused,transform:document.getElementById('rows').style.transform});})()", returnByValue: true });
    var moved = JSON.parse(movedEval.result.value);
    assert.strictEqual(moved.focused, 3, 'Chromium 38 remote Down did not skip a failed catalog');
    assert.notStrictEqual(moved.transform, 'translateY(0px)', 'Chromium 38 catalog board did not move');

    await protocol.call('Runtime.evaluate', { expression: "document.querySelector('.card.f').click()" });
    await delay(120);
    var clicked = await protocol.call('Runtime.evaluate', { expression: "document.getElementById('scrDetail').className", returnByValue: true });
    assert.ok(/\bon\b/.test(clicked.result.value), 'Magic Remote click did not open the focused home card');
    await protocol.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 461, nativeVirtualKeyCode: 461, key: 'GoBack' });
    await delay(200);
    var backEval = await protocol.call('Runtime.evaluate', { expression: "(function(){var rows=document.querySelectorAll('#rows>.row'),focused=-1;for(var i=0;i<rows.length;i++)if(rows[i].querySelector('.card.f'))focused=i;return JSON.stringify({board:document.getElementById('scrBoard').className,focused:focused});})()", returnByValue: true });
    var back = JSON.parse(backEval.result.value);
    assert.ok(/\bon\b/.test(back.board), 'Back from a title did not return to Home');
    assert.strictEqual(back.focused, 3, 'Back from a title did not keep the Home focus');
    assert.strictEqual(protocol.exceptions.length, 0, 'Back navigation raised an exception: ' + JSON.stringify(protocol.exceptions));

    await protocol.call('Runtime.evaluate', { expression: "location.href='http://127.0.0.1:" + appPort + "/play?u='+encodeURIComponent('http://127.0.0.1:" + mockPort + "/fake.mp4')+'&back=beta'" });
    await delay(700);
    var playerInitial = await protocol.call('Runtime.evaluate', { expression: "JSON.stringify(window.__tv&&window.__tv.st())", returnByValue: true });
    assert.strictEqual(JSON.parse(playerInitial.result.value).mode, 'video', 'player did not start in video focus mode');
    await protocol.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 38, nativeVirtualKeyCode: 38, key: 'ArrowUp' });
    await delay(50);
    var playerControls = JSON.parse((await protocol.call('Runtime.evaluate', { expression: "JSON.stringify(window.__tv.st())", returnByValue: true })).result.value);
    assert.strictEqual(playerControls.mode, 'controls', 'Up did not focus the player buttons');
    assert.strictEqual(playerControls.bIdx, 1, 'Play/Pause was not the default focused button');
    await protocol.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 38, nativeVirtualKeyCode: 38, key: 'ArrowUp' });
    await delay(50);
    assert.strictEqual(JSON.parse((await protocol.call('Runtime.evaluate', { expression: "JSON.stringify(window.__tv.st())", returnByValue: true })).result.value).mode, 'seek', 'Up from the buttons did not focus the progress bar');
    await protocol.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40, key: 'ArrowDown' });
    await protocol.call('Runtime.evaluate', { expression: "document.getElementById('b_pp').click();document.getElementById('b_set').click()" });
    await delay(80);
    var playerMenu = await protocol.call('Runtime.evaluate', { expression: "JSON.stringify({state:window.__tv.st(),text:document.getElementById('menu').textContent})", returnByValue: true });
    var playerMenuState = JSON.parse(playerMenu.result.value);
    assert.strictEqual(playerMenuState.state.mode, 'menu', 'Magic Remote click did not open player settings');
    assert.ok(playerMenuState.text.indexOf('Audio:') >= 0 && playerMenuState.text.indexOf('Subtitles:') >= 0, 'active audio/subtitle labels are missing');
    protocol.close();
    console.log('OK: Chromium 38 login, catalogs, Magic Remote clicks and player focus/audio/subtitle UI.');
  } finally {
    if (browser) try { browser.kill(); } catch (e) {}
    try { server.kill(); } catch (e) {}
    try { mockServer.close(); } catch (e) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }
}

main().catch(function (error) { console.error(error && error.stack || error);process.exitCode=1; });
