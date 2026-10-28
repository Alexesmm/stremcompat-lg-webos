'use strict';

var assert = require('assert');
var childProcess = require('child_process');
var fs = require('fs');
var http = require('http');
var os = require('os');
var path = require('path');
var sourceHas = require('./lib/source-check').sourceHas;

var root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
var profile = require(path.join(root, 'service', 'profile.js')).current;
var appPort = parseInt(process.argv[3], 10) || profile.port;
var appVersion = process.argv[4] || profile.version;
var forceEmbedded = process.argv[5] === 'embedded';
var childLogGlobal = '';

var nextEpisodeId = require(path.join(root, 'service', 'server', 'episodes.js')).nextEpisodeId;
var showVideos = [
  { id: 'tt1:2:1', season: 2, episode: 1, released: '2020-02-01T00:00:00Z' },
  { id: 'tt1:1:2', season: 1, episode: 2, released: '2020-01-08T00:00:00Z' },
  { id: 'tt1:0:1', season: 0, episode: 1 },
  { id: 'tt1:1:1', season: 1, episode: 1, released: '2020-01-01T00:00:00Z' },
  { id: 'tt1:2:2', season: 2, episode: 2, released: '2999-01-01T00:00:00Z' }
];
assert.strictEqual(nextEpisodeId(showVideos, 'tt1:1:1'), 'tt1:1:2', 'next episode inside a season');
assert.strictEqual(nextEpisodeId(showVideos, 'tt1:1:2'), 'tt1:2:1', 'next episode did not cross into the next season');
assert.strictEqual(nextEpisodeId(showVideos, 'tt1:2:1'), '', 'next episode pointed to an episode that has not aired');
assert.strictEqual(nextEpisodeId(showVideos, 'tt1:0:1'), '', 'a special led into the regular seasons');
assert.strictEqual(nextEpisodeId(showVideos, 'tt1:9:9'), '', 'an unknown video produced a next episode');
assert.strictEqual(nextEpisodeId(null, 'tt1:1:4'), 'tt1:1:5', 'without metadata the next number is the fallback');

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
  return request({ hostname: '127.0.0.1', port: appPort, path: '/health' }).catch(function () {
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
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { TVSERVER_LOG: testLog, TVSERVER_FORCE_EMBEDDED_UI: forceEmbedded ? '1' : '0' })
  });
  var childLog = '';
  child.stdout.on('data', function (d) { childLog += d.toString(); childLogGlobal = childLog; });
  child.stderr.on('data', function (d) { childLog += d.toString(); childLogGlobal = childLog; });

  try {
    var health = await waitForHealth(0);
    var healthJson = JSON.parse(health.text);
    assert.strictEqual(healthJson.version, appVersion);
    assert.ok(healthJson.memory.rssMiB > 0 && healthJson.memory.heapMiB > 0, 'health memory diagnostics missing');

    var logged = await request({ hostname: '127.0.0.1', port: appPort, path: '/log?ev=selftest&compat=AV1&ignored=secret' });
    assert.strictEqual(logged.status, 200);
    var persistedLog = fs.readFileSync(testLog, 'utf8');
    assert.ok(persistedLog.indexOf('"ev":"selftest"') >= 0, 'client diagnostic was not persisted');
    assert.ok(persistedLog.indexOf('"compat":"AV1"') >= 0, 'codec hint was not persisted');
    assert.ok(persistedLog.indexOf('secret') < 0, 'unapproved diagnostic field was persisted');

    var rootPage = await request({ hostname: '127.0.0.1', port: appPort, path: '/' });
    assert.strictEqual(rootPage.status, 302);
    assert.strictEqual(rootPage.headers.location, '/beta?v=' + appVersion, 'root does not open the television interface');
    var unknown = await request({ hostname: '127.0.0.1', port: appPort, path: '/shell-v4.4/unknown.js' });
    assert.strictEqual(unknown.status, 404, 'unknown routes must not be forwarded upstream');

    var shell = await request({ hostname: '127.0.0.1', port: appPort, path: '/beta?v=' + appVersion });
    assert.strictEqual(shell.status, 200);
    assert.ok(shell.text.indexOf('/beta-app.js?v=' + appVersion) >= 0);
    assert.ok(shell.text.indexOf('__APP_VERSION__') < 0 && shell.text.indexOf('<!--@profile-->') < 0, 'interface template markers were not rendered');
    assert.ok(shell.text.indexOf('window.__STREMIO_PROFILE__=') >= 0 && shell.text.indexOf('"id":"' + profile.profile + '"') >= 0, 'interface profile was not injected');
    var application = await request({ hostname: '127.0.0.1', port: appPort, path: '/beta-app.js?v=' + appVersion });
    assert.strictEqual(application.status, 200);
    assert.ok(/^application\/javascript/.test(application.headers['content-type'] || ''));
    assert.ok(sourceHas(application.text, "window.__STREMIO_PHASE__('M0')"));
    assert.ok(sourceHas(application.text, "'/stremioapi?path='"));

    var blockedApiPayload = JSON.stringify({ test: true });
    var blockedApi = await request({ hostname: '127.0.0.1', port: appPort, path: '/stremioapi?path=' + encodeURIComponent('/api/notAllowed'), method: 'POST', headers: {
      'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(blockedApiPayload)
    } }, blockedApiPayload);
    assert.strictEqual(blockedApi.status, 403);

    var addon = await request({ hostname: '127.0.0.1', port: appPort, path: '/addon?u=' + encodeURIComponent('http://127.0.0.1:9191/addon') });
    assert.strictEqual(JSON.parse(addon.text).ok, true);

    var payload = JSON.stringify({
      url: 'http://127.0.0.1:9191/video', notWebReady: true, quality: '1080p', compat: 'DTS',
      title: '</script><script>globalThis.__injected=true</script>',
      headers: { Authorization: 'Bearer test-token', Referer: 'https://addon.example/', 'X-Blocked': 'no' }
    });
    var made = await request({ hostname: '127.0.0.1', port: appPort, path: '/streamref', method: 'POST', headers: {
      'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload)
    } }, payload);
    var ref = JSON.parse(made.text).ref;
    assert.match(ref, /^[0-9a-f]{24}$/);

    var player = await request({ hostname: '127.0.0.1', port: appPort, path: '/play?ref=' + ref + '&back=beta' });
    assert.strictEqual(player.status, 200);
    assert.ok(sourceHas(player.text, 'COMPAT="DTS"'), 'player did not receive the sanitized compatibility hint');
    assert.ok(sourceHas(player.text, 'webkitvisibilitychange'), 'player lifecycle recovery is missing');
    assert.ok(sourceHas(player.text, 'PalmServiceBridge'), 'player runtime restart bridge is missing');
    assert.ok(sourceHas(player.text, 'MediaPlayPause') && sourceHas(player.text, 'mode==="seek"'), 'player media keys or focus zones are missing');
    assert.ok(sourceHas(player.text, 'function audioName') && sourceHas(player.text, 'function subtitleName'), 'active track labels are missing');
    assert.ok(sourceHas(player.text, 'document.addEventListener("click"'), 'Magic Remote player clicks are missing');
    assert.ok(!sourceHas(player.text, '</script><script>globalThis.__injected'), 'external player text escaped the script context');
    assert.ok(sourceHas(player.text, '\\u003c/script\\u003e'), 'external player text was not encoded safely');
    assert.ok(sourceHas(player.text, 'function dismissNp') && sourceHas(player.text, 'rem<=180'), 'early compact dismissible next-title prompt is missing');
    assert.ok(sourceHas(player.text, 'rememberNextSource') && sourceHas(player.text, 'tvnextpref_'), 'next-episode source preference handoff is missing');
    assert.ok(sourceHas(player.text, 'media_start_retry') && sourceHas(player.text, 'armStartupWatch'), 'single source startup recovery is missing');
    assert.ok(sourceHas(player.text, 'SEEN=') && sourceHas(player.text, 'SEPT='), 'localized episode line is missing');

    var proxied = await request({ hostname: '127.0.0.1', port: appPort, path: '/proxy?ref=' + ref, headers: { Range: 'bytes=0-99' } });
    var echoed = JSON.parse(proxied.text);
    assert.strictEqual(echoed.auth, 'Bearer test-token');
    assert.strictEqual(echoed.referer, 'https://addon.example/');
    assert.strictEqual(echoed.range, 'bytes=0-99');
    assert.strictEqual(echoed.blocked, '');

    var hlsPayload = JSON.stringify({ url: 'http://127.0.0.1:9191/playlist.m3u8', headers: { Authorization: 'Bearer hls-token' } });
    var hlsMade = await request({ hostname: '127.0.0.1', port: appPort, path: '/streamref', method: 'POST', headers: {
      'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(hlsPayload)
    } }, hlsPayload);
    var hlsRef = JSON.parse(hlsMade.text).ref;
    var playlist = await request({ hostname: '127.0.0.1', port: appPort, path: '/proxy?ref=' + hlsRef });
    var segmentUrl = playlist.text.split('\n').filter(function (line) { return /^http:/.test(line); })[0];
    assert.ok(segmentUrl && segmentUrl.indexOf('/proxy?ref=') >= 0, 'relative HLS segment was not rewritten');
    var parsedSegment = new URL(segmentUrl);
    var segment = await request({ hostname: parsedSegment.hostname, port: parsedSegment.port, path: parsedSegment.pathname + parsedSegment.search });
    assert.strictEqual(JSON.parse(segment.text).auth, 'Bearer hls-token');
    console.log('OK: health, ' + (forceEmbedded ? 'embedded' : 'file') + ' UI, addon bridge, stream references, proxy headers and relative HLS.');
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
