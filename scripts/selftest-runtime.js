'use strict';

var assert = require('assert');
var childProcess = require('child_process');
var fs = require('fs');
var http = require('http');
var os = require('os');
var path = require('path');

var root = path.resolve(__dirname, '..');
var childLogGlobal = '';

function request(options, body) {
  return new Promise(function (resolve, reject) {
    var req = http.request(options, function (res) {
      var chunks = [];
      res.on('data', function (d) { chunks.push(d); });
      res.on('end', function () {
        var text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, text: text, headers: res.headers });
      });
    });
    req.setTimeout(5000, function () { req.destroy(new Error('request timeout')); });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function waitForHealth(attempt) {
  return request({ hostname: '127.0.0.1', port: 8082, path: '/health' }).catch(function () {
    if (attempt > 120) throw new Error('tvserver did not become ready');
    return new Promise(function (resolve) { setTimeout(resolve, 100); }).then(function () { return waitForHealth(attempt + 1); });
  });
}

async function main() {
  var upstream = http.createServer(function (req, res) {
    if (req.url === '/playlist.m3u8') {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.end('#EXTM3U\n#EXTINF:5,\nsegment.ts\n');return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      ok: true,
      auth: req.headers.authorization || '',
      referer: req.headers.referer || '',
      range: req.headers.range || '',
      blocked: req.headers['x-blocked'] || ''
    }));
  });
  await new Promise(function (resolve, reject) { upstream.once('error', reject);upstream.listen(9191, '127.0.0.1', resolve); });

  var testLog = path.join(os.tmpdir(), 'stremio-lg-selftest-' + process.pid + '.log');
  var child = childProcess.spawn(process.execPath, [path.join(root, 'service', 'tvserver.js')], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { TVSERVER_LOG: testLog })
  });
  var childLog = '';
  child.stdout.on('data', function (d) { childLog += d.toString(); childLogGlobal = childLog; });
  child.stderr.on('data', function (d) { childLog += d.toString(); childLogGlobal = childLog; });

  try {
    var health = await waitForHealth(0);
    assert.strictEqual(JSON.parse(health.text).version, '1.2.2');

    var addon = await request({ hostname: '127.0.0.1', port: 8082, path: '/addon?u=' + encodeURIComponent('http://127.0.0.1:9191/addon') });
    assert.strictEqual(JSON.parse(addon.text).ok, true);

    var payload = JSON.stringify({
      url: 'http://127.0.0.1:9191/video', notWebReady: true,
      headers: { Authorization: 'Bearer test-token', Referer: 'https://addon.example/', 'X-Blocked': 'no' }
    });
    var made = await request({ hostname: '127.0.0.1', port: 8082, path: '/streamref', method: 'POST', headers: {
      'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload)
    } }, payload);
    var ref = JSON.parse(made.text).ref;
    assert.match(ref, /^[0-9a-f]{24}$/);

    var proxied = await request({ hostname: '127.0.0.1', port: 8082, path: '/proxy?ref=' + ref, headers: { Range: 'bytes=0-99' } });
    var echoed = JSON.parse(proxied.text);
    assert.strictEqual(echoed.auth, 'Bearer test-token');
    assert.strictEqual(echoed.referer, 'https://addon.example/');
    assert.strictEqual(echoed.range, 'bytes=0-99');
    assert.strictEqual(echoed.blocked, '');

    var hlsPayload = JSON.stringify({ url: 'http://127.0.0.1:9191/playlist.m3u8', headers: { Authorization: 'Bearer hls-token' } });
    var hlsMade = await request({ hostname: '127.0.0.1', port: 8082, path: '/streamref', method: 'POST', headers: {
      'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(hlsPayload)
    } }, hlsPayload);
    var hlsRef = JSON.parse(hlsMade.text).ref;
    var playlist = await request({ hostname: '127.0.0.1', port: 8082, path: '/proxy?ref=' + hlsRef });
    var segmentUrl = playlist.text.split('\n').filter(function (line) { return /^http:/.test(line); })[0];
    assert.ok(segmentUrl && segmentUrl.indexOf('/proxy?ref=') >= 0, 'relative HLS segment was not rewritten');
    var parsedSegment = new URL(segmentUrl);
    var segment = await request({ hostname: parsedSegment.hostname, port: parsedSegment.port, path: parsedSegment.pathname + parsedSegment.search });
    assert.strictEqual(JSON.parse(segment.text).auth, 'Bearer hls-token');
    console.log('OK: health, addon bridge, stream references, proxy headers and relative HLS.');
  } finally {
    try { child.kill(); } catch (e) {}
    await new Promise(function (resolve) { upstream.close(resolve); });
    try { fs.unlinkSync(testLog); } catch (e) {}
  }
}

main().catch(function (error) {
  console.error(error && error.stack || error);
  if (childLogGlobal) console.error('tvserver output:\n' + childLogGlobal);
  process.exitCode = 1;
});
