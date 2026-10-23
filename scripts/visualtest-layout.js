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
  var browserProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'stremcompat-visual-'));
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
    var expression = "(function(){function r(id){var e=document.getElementById(id),b=e&&e.getBoundingClientRect();return b?{left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height}:null;}return JSON.stringify({width:innerWidth,height:innerHeight,done:!!window.__STREMIO_BOOT_DONE__,failed:!!window.__STREMIO_BOOT_FAILED__,login:document.getElementById('scrLogin').className,boot:document.getElementById('boot').style.display,loginBox:r('lgBox'),topnav:r('topnav'),bodyWidth:document.body.scrollWidth,bodyHeight:document.body.scrollHeight});})()";
    var evaluated = await protocol.call('Runtime.evaluate', { expression: expression, returnByValue: true });
    var state = JSON.parse(evaluated.result.value);
    assert.strictEqual(state.width, width, 'Unexpected viewport width.');
    assert.strictEqual(state.height, height, 'Unexpected viewport height.');
    assert.strictEqual(state.failed, false, 'Frontend reported a boot failure.');
    assert.strictEqual(state.done, true, 'Frontend did not complete boot.');
    assert.ok(/\bon\b/.test(state.login), 'Login screen is not active.');
    assert.strictEqual(state.boot, 'none', 'Boot overlay is still visible.');
    assert.ok(state.loginBox && state.loginBox.left >= 0 && state.loginBox.top >= 0, 'Login layout starts outside the viewport.');
    assert.ok(state.loginBox.right <= width && state.loginBox.bottom <= height, 'Login layout is clipped at ' + width + 'x' + height + '.');
    assert.strictEqual(protocol.exceptions.length, 0, 'Chrome reported a JavaScript exception.');
    var shot = await protocol.call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, Buffer.from(shot.data, 'base64'));
    console.log('OK: ' + width + 'x' + height + ' layout ' + JSON.stringify(state) + ' -> ' + output);
  } finally {
    if (protocol) protocol.close();
    if (browser) try { browser.kill(); } catch (e) {}
    try { server.kill(); } catch (e) {}
    try { fs.rmSync(browserProfile, { recursive: true, force: true }); } catch (e) {}
  }
}

main().catch(function (error) { console.error(error && error.stack || error);process.exitCode = 1; });
