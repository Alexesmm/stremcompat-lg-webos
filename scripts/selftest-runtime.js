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
// subtitle decoding without the streaming server's converter (what the TV does when it is not ready)
var subtitleLib = require(path.join(root, 'service', 'server', 'subtitles.js'));
var directCues = subtitleLib.parseSrt(subtitleLib.subtitleText(Buffer.concat([
  Buffer.from('1\n00:00:01,000 --> 00:00:02,500\nCora'), Buffer.from([0xe7, 0xe3]), Buffer.from('o\n')
])));
assert.strictEqual(directCues.length && directCues[0].t, 'Coração', 'a Windows-1252 subtitle read directly lost its accents or kept a line break');
var vttCues = subtitleLib.parseSrt('WEBVTT\n\n01:02.500 --> 01:04.000 align:start\n<i>Olá</i>');
assert.strictEqual(vttCues.length && vttCues[0].s + ':' + vttCues[0].t, '62.5:Olá', 'a WebVTT cue without hours was not read');
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
  var subtitleRequests = [];
  var upstream = http.createServer(function (req, res) {
    var subMatch = req.url.match(/^\/(subA|subB)\/subtitles\//);
    if (subMatch) {
      subtitleRequests.push(req.url);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ subtitles: subMatch[1] === 'subA'
        ? [{ lang: 'por', url: 'http://127.0.0.1:9191/latin.srt' }, { lang: 'eng', url: 'http://127.0.0.1:9191/a-eng.srt' }]
        : [{ lang: 'por', url: 'http://127.0.0.1:9191/latin.srt' }, { lang: 'spa', url: 'http://127.0.0.1:9191/b-spa.srt' }] }));
      return;
    }
    if (req.url === '/latin.srt') {
      res.end(Buffer.concat([Buffer.from('1\n00:00:01,000 --> 00:00:02,500\nCora'), Buffer.from([0xe7, 0xe3]), Buffer.from('o\n')]));
      return;
    }
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
    assert.ok(sourceHas(player.text, 'SEASON=') && sourceHas(player.text, 'EPISODE=') && sourceHas(player.text, 'playerText()'), 'localized episode line is missing');

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
    var packed = require('zlib').deflateSync(Buffer.from([6])).toString('base64');
    var bitsRes = await request({ hostname: '127.0.0.1', port: appPort, path: '/watchedbits?f=' + encodeURIComponent('tt1:1:2:3:' + packed) });
    var bitsJson = JSON.parse(bitsRes.text);
    assert.strictEqual(bitsJson.anchor, 'tt1:1:2', 'watched field anchor was not parsed');
    assert.deepStrictEqual(bitsJson.bits.slice(0, 4), [0, 1, 1, 0], 'watched field bits are not in Stremio order');
    var parsedSegment = new URL(segmentUrl);
    var segment = await request({ hostname: parsedSegment.hostname, port: parsedSegment.port, path: parsedSegment.pathname + parsedSegment.search });
    assert.strictEqual(JSON.parse(segment.text).auth, 'Bearer hls-token');
    // subtitles from the account's subtitle addons, with the file name as extra, merged
    var forgedTakeover = await request({ hostname: '127.0.0.1', port: appPort, path: '/takeover', method: 'POST' });
    assert.strictEqual(forgedTakeover.status, 403, 'the local server could be stopped without the takeover header');
    var subRefBody = JSON.stringify({ url: 'http://127.0.0.1:9191/video.mkv', filename: 'Show S01E02.mkv' });
    var subRef = JSON.parse((await request({ hostname: '127.0.0.1', port: appPort, path: '/streamref', method: 'POST', headers: {
      'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(subRefBody)
    } }, subRefBody)).text).ref;
    var subsBody = JSON.stringify({ ref: subRef, type: 'series', vid: 'tt9:1:2', addons: [
      { name: 'Subs A', base: 'http://127.0.0.1:9191/subA', query: '?key=1' },
      { name: 'Subs B', base: 'http://127.0.0.1:9191/subB', query: '' }
    ] });
    var subsAnswer = JSON.parse((await request({ hostname: '127.0.0.1', port: appPort, path: '/subs', method: 'POST', headers: {
      'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(subsBody)
    } }, subsBody)).text).subtitles;
    assert.deepStrictEqual(subsAnswer.map(function (x) { return x.lang + ':' + x.src; }), ['eng:Subs A', 'por:Subs A', 'spa:Subs B'], 'subtitle addons were not merged without duplicates, English first');
    assert.ok(subtitleRequests.indexOf('/subA/subtitles/series/tt9%3A1%3A2/filename=Show%20S01E02.mkv.json?key=1') >= 0, 'the subtitle request lost the file name or the addon key: ' + subtitleRequests.join(' '));
    var subsAgain = await request({ hostname: '127.0.0.1', port: appPort, path: '/subs', method: 'POST', headers: {
      'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(subsBody)
    } }, subsBody);
    assert.strictEqual(subtitleRequests.length, 2, 'the same subtitles were asked again instead of reused');
    assert.strictEqual(JSON.parse(subsAgain.text).subtitles.length, 3);
    var latin = JSON.parse((await request({ hostname: '127.0.0.1', port: appPort, path: '/sub?u=' + encodeURIComponent('http://127.0.0.1:9191/latin.srt') })).text).cues;
    assert.strictEqual(latin.length && latin[0].t, 'Coração', 'a Windows-1252 subtitle lost its accents');
    var tracks = JSON.parse((await request({ hostname: '127.0.0.1', port: appPort, path: '/embtracks?u=' + encodeURIComponent('http://127.0.0.1:9191/nothing.mkv') })).text);
    assert.ok(Array.isArray(tracks.tracks) && tracks.err, 'a failed track read did not report an error');

    console.log('OK: health, ' + (forceEmbedded ? 'embedded' : 'file') + ' UI, addon bridge, stream references, proxy headers, relative HLS, subtitle addons, subtitle decoding and protected takeover.');
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
