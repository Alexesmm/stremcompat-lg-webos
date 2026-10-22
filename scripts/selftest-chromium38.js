'use strict';

var assert = require('assert');
var childProcess = require('child_process');
var fs = require('fs');
var http = require('http');
var os = require('os');
var path = require('path');

var root = path.resolve(__dirname, '..');
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
  return getJson(8082, '/health').catch(function (error) {
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
  var server = childProcess.spawn(process.execPath, [path.join(root, 'service', 'tvserver.js')], { cwd: root, windowsHide: true, stdio: 'ignore' });
  var browser;
  try {
    await waitHealth(100);
    browser = childProcess.spawn(chrome, [
      '--remote-debugging-port=9223', '--user-data-dir=' + profile, '--no-first-run',
      '--disable-default-apps', '--disable-extensions', '--disable-sync', '--disable-gpu',
      '--no-sandbox', '--window-position=-32000,-32000', 'http://127.0.0.1:8082/beta?engine=38'
    ], { cwd: path.dirname(chrome), windowsHide: true, stdio: 'ignore' });
    var pages = await waitJson(9223, '/json', 150);
    var page = pages.filter(function (item) { return item.type === 'page' && item.url.indexOf('/beta') >= 0; })[0];
    assert.ok(page && page.webSocketDebuggerUrl, 'Chromium 38 did not open the beta shell.');
    var protocol = await devtools(page.webSocketDebuggerUrl);
    await protocol.call('Runtime.enable');
    await delay(1500);
    var evaluated = await protocol.call('Runtime.evaluate', { expression: "JSON.stringify({done:!!window.__STREMIO_BOOT_DONE__,failed:!!window.__STREMIO_BOOT_FAILED__,phase:window.__STREMIO_BOOT_PHASE__,message:window.__STREMIO_BOOT_MESSAGE__||'',line:window.__STREMIO_BOOT_LINE__||'',login:document.getElementById('scrLogin').className,boot:document.getElementById('boot').style.display})", returnByValue: true });
    var state = JSON.parse(evaluated.result.value);
    if (state.failed || !state.done || protocol.exceptions.length) console.log(JSON.stringify({ state: state, exceptions: protocol.exceptions }, null, 2));
    assert.strictEqual(state.failed, false, 'browser startup reported failure at ' + state.phase);
    assert.strictEqual(state.done, true, 'browser startup did not finish; phase ' + state.phase);
    assert.ok(/\bon\b/.test(state.login), 'login screen is not active');
    assert.strictEqual(state.boot, 'none', 'boot overlay is still visible');
    assert.strictEqual(protocol.exceptions.length, 0, 'Chromium 38 reported an exception.');

    await protocol.call('Runtime.evaluate', { expression: "document.getElementById('lgEmail').focus()" });
    await protocol.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40, key: 'ArrowDown' });
    await delay(100);
    var keyboard = await protocol.call('Runtime.evaluate', { expression: "document.getElementById('lgPass').className", returnByValue: true });
    assert.ok(/\bf\b/.test(keyboard.result.value), 'remote Down did not move login focus to password');

    await protocol.call('Runtime.evaluate', { expression: "localStorage.setItem('user',JSON.stringify({_id:'test-user',email:'test@example.com'}));localStorage.setItem('authKey',JSON.stringify('test-auth'));localStorage.setItem('addons','[]');location.reload()" });
    await delay(1800);
    var homeEval = await protocol.call('Runtime.evaluate', { expression: "JSON.stringify({done:!!window.__STREMIO_BOOT_DONE__,failed:!!window.__STREMIO_BOOT_FAILED__,phase:window.__STREMIO_BOOT_PHASE__,board:document.getElementById('scrBoard').className,boot:document.getElementById('boot').style.display})", returnByValue: true });
    var home = JSON.parse(homeEval.result.value);
    assert.strictEqual(home.failed, false, 'stored-account startup reported failure at ' + home.phase);
    assert.strictEqual(home.done, true, 'stored-account startup did not finish; phase ' + home.phase);
    assert.ok(/\bon\b/.test(home.board), 'home screen is not active for stored account');
    assert.strictEqual(home.boot, 'none', 'stored-account boot overlay is still visible');
    protocol.close();
    console.log('OK: real Chromium 38 opened login, handled remote input and reached home with a stored account.');
  } finally {
    if (browser) try { browser.kill(); } catch (e) {}
    try { server.kill(); } catch (e) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }
}

main().catch(function (error) { console.error(error && error.stack || error);process.exitCode=1; });
