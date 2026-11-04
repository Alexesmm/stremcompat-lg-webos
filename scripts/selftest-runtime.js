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
/* service modules loaded by this test must not leave a log in the staged package */
process.env.SC_SERVER_LOG = path.join(os.tmpdir(), 'stremcompat-selftest-modules-' + process.pid + '.log');

var nextEpisodeId = require(path.join(root, 'service', 'server', 'episodes.js')).nextEpisodeId;
// subtitle decoding without the streaming server's converter (what the TV does when it is not ready)
var subtitleLib = require(path.join(root, 'service', 'server', 'subtitles.js'));
var directCues = subtitleLib.parseSrt(subtitleLib.subtitleText(Buffer.concat([
  Buffer.from('1\n00:00:01,000 --> 00:00:02,500\nCora'), Buffer.from([0xe7, 0xe3]), Buffer.from('o\n')
])));
assert.strictEqual(directCues.length && directCues[0].t, 'Coração', 'a Windows-1252 subtitle read directly lost its accents or kept a line break');
var assCues = subtitleLib.parseCues('[Script Info]\nTitle: x\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:05.50,0:00:07.00,Default,,0,0,0,,{\\i1}Second, with a comma\\Nline{\\i0}\nDialogue: 0,0:00:01.25,0:00:02.00,Default,,0,0,0,,First\n');
assert.deepStrictEqual(assCues, [{ s: 1.25, e: 2, t: 'First' }, { s: 5.5, e: 7, t: 'Second, with a comma\nline' }], 'an ASS subtitle was not read');
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
    if (attempt > 120) throw new Error('local server did not become ready');
    return new Promise(function (resolve) { setTimeout(resolve, 100); }).then(function () { return waitForHealth(attempt + 1); });
  });
}


/* The paused screen's resolution, and free space read from df even when a long name wraps. */
function mediaAndDiskTests() {
  var media = require(path.join(root, 'service', 'server', 'media.js'));
  var disk = require(path.join(root, 'service', 'server', 'disk.js'));
  function res(width, height) {
    return media.describe([{ codec_type: 'video', codec_name: 'hevc', width: width, height: height }], {}).res;
  }
  assert.strictEqual(res(3840, 1600), '4K', 'a 4K film in a cinema format was not called 4K');
  assert.strictEqual(res(1920, 800), '1080p', 'a 1080p film in a cinema format was not called 1080p');
  assert.strictEqual(res(1280, 534), '720p', 'a 720p film in a cinema format was not called 720p');
  var table = 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/mmcblk0p20 1024000 863232 160768 85% /media/developer\n';
  assert.deepStrictEqual(disk.parse(table), { totalMb: 1000, freeMb: 157 }, 'free space was not read from df');
  assert.strictEqual(disk.parse('df: unknown option -- P'), null, 'an error from df was taken for a size');
  /* the torrent cache: the engine's own size (null) where it fits, smaller only where it would not */
  var limit = require(path.join(root, 'service', 'server', 'streaming-server.js')).cacheLimitMiB;
  assert.deepStrictEqual([157, 200, 250, 1000].map(limit), [16, 50, null, null], 'the torrent cache limit is off');
}

/* Another streaming server: only one that answers is kept, and torrents go there. */
async function serverAddressTests() {
  var address = require(path.join(root, 'service', 'server', 'server-address.js'));
  var refs = require(path.join(root, 'service', 'server', 'stream-refs.js'));
  var home = fs.mkdtempSync(path.join(os.tmpdir(), 'stremcompat-address-')),
    realHome = process.env.HOME;
  process.env.HOME = home;
  function set(value) {
    return new Promise(function (resolve) {
      address.setServerAddress(value, resolve);
    });
  }
  assert.strictEqual(address.normalizeAddress('192.168.0.10'), 'http://192.168.0.10:11470', 'a bare address did not get the server port');
  assert.strictEqual(address.normalizeAddress(' 192.168.0.10:8000/ '), 'http://192.168.0.10:8000', 'an address with a port changed');
  assert.strictEqual(address.normalizeAddress('https://tv.example'), 'https://tv.example', 'a full address gained a port');
  assert.strictEqual(address.normalizeAddress('http://127.0.0.1:11470'), '', 'this TV was treated as another server');
  assert.strictEqual(address.normalizeAddress(''), '', 'empty is not this TV');
  ['ftp://host', 'http://user:pw@host', 'http://host/path', 'http://host?x=1', 'file:///etc/passwd', 'a b/c'].forEach(function (bad) {
    assert.strictEqual(address.normalizeAddress(bad), null, 'accepted as an address: ' + bad);
  });
  var seen = [],
    fake = http.createServer(function (req, res) {
      seen.push(req.url);
      res.writeHead(req.url === '/stats.json' ? 200 : 404, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
  await new Promise(function (resolve) { fake.listen(0, '127.0.0.1', resolve); });
  var base = 'http://127.0.0.1:' + fake.address().port;
  try {
    var bad = await set('http://host/path');
    assert.strictEqual(bad.err, 'invalid', 'an invalid address was not refused');
    var silent = http.createServer(function (req, res) { res.writeHead(500); res.end(); });
    await new Promise(function (resolve) { silent.listen(0, '127.0.0.1', resolve); });
    var down = await set('http://127.0.0.1:' + silent.address().port);
    silent.close();
    assert.strictEqual(down.err, 'unreachable', 'an address with no server was kept');
    assert.strictEqual(address.remoteAddress(), '', 'a refused address replaced the current one');
    var localRef = refs.getStreamRef(refs.storeStreamRef({ url: 'http://127.0.0.1:11470/abc/0' }));
    assert.strictEqual(localRef.url, 'http://127.0.0.1:11470/abc/0', 'a torrent left this TV with no other server set');
    var saved = await set(base);
    assert.strictEqual(saved.ok, true, 'a server that answers only its stats was refused');
    assert.ok(seen.indexOf('/settings') >= 0 && seen.indexOf('/stats.json') >= 0, 'the connection was not tested');
    assert.strictEqual(address.remoteAddress(), base, 'the address was not kept');
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(home, '.stremcompat', 'server-address.json'), 'utf8')).address, base, 'the address did not reach the disk');
    var torrent = refs.getStreamRef(refs.storeStreamRef({ url: 'http://127.0.0.1:11470/abc/0' }));
    assert.strictEqual(torrent.url, base + '/abc/0', 'a torrent did not go to the server given');
    assert.ok(address.isStreamingUrl(torrent.url), 'a torrent at the server given was not recognised');
    var direct = refs.getStreamRef(refs.storeStreamRef({ url: 'https://cdn.example/a.mp4' }));
    assert.strictEqual(direct.url, 'https://cdn.example/a.mp4', 'a direct link was sent to the streaming server');
    var back = await set('');
    assert.strictEqual(back.ok, true, 'going back to this TV failed');
    assert.strictEqual(address.remoteAddress(), '', 'this TV was not restored');
    assert.strictEqual(address.streamingBase(), 'http://127.0.0.1:11470', 'this TV was not the base again');
  } finally {
    fake.close();
    if (realHome === undefined) delete process.env.HOME;
    else process.env.HOME = realHome;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

function engineLogicTests() {
  var torrents = require(path.join(root, 'service', 'server', 'streaming-server.js'));
  var files = [
    { index: 0, size: 300, path: 'readme.txt' },
    { index: 1, size: 900, path: 'Show/ep1.mkv' },
    { index: 2, size: 40, path: 'Show/sample.mkv' }
  ];
  assert.strictEqual(torrents.chooseFile(files, 1).index, 1, 'the file the addon names was not used');
  assert.strictEqual(torrents.chooseFile(files, 2).index, 2, 'a smaller file the addon names was replaced');
  assert.strictEqual(torrents.chooseFile(files, 0).index, 1, 'file 0, a text file, was played instead of the video');
  assert.strictEqual(torrents.chooseFile([{ index: 0, size: 40, path: 'sample.mkv' }, { index: 1, size: 900, path: 'movie.mkv' }], 0).index, 1, 'a small file 0 won over the film');
  assert.strictEqual(torrents.chooseFile([{ index: 0, size: 900, path: 'movie.mkv' }, { index: 1, size: 800, path: 'other.mkv' }], 0).index, 0, 'file 0, a video of the right size, was skipped');
  assert.strictEqual(torrents.chooseFile([{ index: 0, size: 5, path: 'a.txt' }], 3).index, 0, 'a torrent without videos was refused');
  /* the published example: breakdance.avi, 12909756 bytes, hash 8e245d9679d31e12 */
  var zero = Buffer.alloc(65536);
  assert.strictEqual(torrents.opensubHash(4294967298, zero, zero), '0000000100000002', 'the OpenSubtitles hash lost the high part of the size');
  var one = Buffer.alloc(16);
  one.writeUInt32LE(0xffffffff, 0);
  one.writeUInt32LE(5, 4);
  one.writeUInt32LE(0xffffffff, 8);
  assert.strictEqual(torrents.opensubHash(2, one, Buffer.alloc(0)), '0000000700000000', 'the OpenSubtitles hash lost a carry');
}

/* The real server, with the stand-in engine: address, redirect, hash, statistics, a torrent the
   engine refuses, and the engine dying in the middle. */
async function engineRoutesTests() {
  var hash = 'a'.repeat(40);
  async function ask(p, method) {
    return await request({ hostname: '127.0.0.1', port: 11470, path: p, method: method || 'GET' });
  }
  var redirect = await ask('/' + hash + '/1?tr=' + encodeURIComponent('udp://addon.example:80/announce'));
  assert.strictEqual(redirect.status, 302, 'a torrent address did not lead to the engine: ' + redirect.text);
  var link = redirect.headers.location;
  assert.ok(/^http:\/\/127\.0\.0\.1:\d+\/stream\/a+\/1$/.test(link), 'unexpected engine link: ' + link);
  var again = await ask('/' + hash + '/1', 'HEAD');
  assert.strictEqual(again.headers.location, link, 'the same file got a second stream');
  var zero = await ask('/' + hash + '/0');
  assert.strictEqual(zero.headers.location, link, 'file 0, a text file, was not replaced by the film');
  var sample = await ask('/' + hash + '/2');
  assert.ok(/\/2$/.test(sample.headers.location), 'the file an addon names was replaced');
  var sub = await ask('/opensubHash?videoUrl=' + encodeURIComponent('http://127.0.0.1:11470/' + hash + '/1'));
  var subJson = JSON.parse(sub.text);
  assert.strictEqual(subJson.result.size, 200000, 'the hash answer has no size');
  var low = 200000, high = 0;
  function add(start) {
    for (var i = start; i + 8 <= start + 65536; i += 8) {
      function word(at) { var b = []; for (var k = 0; k < 4; k++) b.push((at + k) * 7 + 13); return b.reduce(function (s, n, x) { return s + (n % 251) * Math.pow(256, x); }, 0); }
      low += word(i);
      high += word(i + 4) + Math.floor(low / 4294967296);
      low %= 4294967296;
      high %= 4294967296;
    }
  }
  add(0);
  add(200000 - 65536);
  assert.strictEqual(subJson.result.hash, high.toString(16).padStart(8, '0') + low.toString(16).padStart(8, '0'), 'wrong OpenSubtitles hash');
  var settings = JSON.parse((await ask('/settings')).text);
  assert.strictEqual(settings.running, true, 'the engine is not reported as running');
  assert.strictEqual((await ask('/not-a-torrent')).status, 404, 'an unknown address was answered');
  assert.strictEqual((await ask('/' + 'b'.repeat(39) + '/1')).status, 404, 'a malformed hash was accepted');
  var refused = await ask('/' + 'deadbeef'.repeat(5) + '/0');
  assert.strictEqual(refused.status, 503, 'a torrent the engine refuses was not reported');
  var file = await ask('/streamfile');
  assert.strictEqual(file.status, 404, 'the torrent address answers the interface routes');
  console.log('OK: torrent address, redirect to the engine, file choice, OpenSubtitles hash, refused torrent.');
}

var proxyHits = { debrid: 0, cdn: [] };

/* /proxy, as the player and FFmpeg use it */
async function proxyTests() {
  function viaProxy(target, options) {
    return request(Object.assign({ hostname: '127.0.0.1', port: appPort, path: '/proxy?u=' + encodeURIComponent('http://127.0.0.1:9191' + target) }, options || {}));
  }
  async function reference(url, headers) {
    var payload = JSON.stringify({ url: url, headers: headers });
    var made = await request({ hostname: '127.0.0.1', port: appPort, path: '/streamref', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, payload);
    return JSON.parse(made.text).ref;
  }
  var whole = await viaProxy('/ranged');
  assert.strictEqual(whole.text, '0123456789', 'a file did not come through the proxy');
  assert.strictEqual(whole.headers['accept-ranges'], 'bytes', 'the player was not told it can seek');
  assert.strictEqual(whole.headers.etag, '"v1"', 'a useful header was dropped');
  assert.strictEqual(whole.headers['x-secret-server'], undefined, 'other headers from the server were passed on');
  var part = await viaProxy('/ranged', { headers: { Range: 'bytes=2-4' } });
  assert.strictEqual(part.status, 206, 'a Range request lost its status');
  assert.strictEqual(part.text, '234', 'a Range request returned the wrong bytes');
  assert.strictEqual(part.headers['content-range'], 'bytes 2-4/10', 'Content-Range was lost');
  var head = await viaProxy('/echo-headers', { method: 'HEAD' });
  assert.strictEqual(head.status, 200, 'HEAD failed');
  assert.strictEqual((await viaProxy('/moved-loop')).status, 502, 'endless redirects were not stopped');
  assert.strictEqual((await request({ hostname: '127.0.0.1', port: appPort, path: '/proxy?u=' + encodeURIComponent('file:///etc/passwd') })).status, 400, 'another protocol was accepted');
  assert.strictEqual((await request({ hostname: '127.0.0.1', port: appPort, path: '/proxy' })).status, 502, 'a request with no target was not refused');

  var secrets = { Authorization: 'Bearer secret', Cookie: 'a=b', Referer: 'https://addon.example/' };
  var sameRef = await reference('http://127.0.0.1:9191/moved-same', secrets);
  var same = JSON.parse((await request({ hostname: '127.0.0.1', port: appPort, path: '/proxy?ref=' + sameRef })).text);
  assert.strictEqual(same.auth, 'Bearer secret', 'a redirect on the same host lost its credentials');
  var awayRef = await reference('http://127.0.0.1:9191/moved-away', secrets);
  var away = JSON.parse((await request({ hostname: '127.0.0.1', port: appPort, path: '/proxy?ref=' + awayRef })).text);
  assert.strictEqual(away.auth, '', 'credentials went to another host');
  assert.strictEqual(away.cookie, '', 'a cookie went to another host');
  assert.strictEqual(away.referer, 'https://addon.example/', 'an ordinary header was lost on a redirect');

  /* the working CDN link is remembered; once it expires, the original link gives a new one */
  assert.strictEqual((await viaProxy('/debrid')).text, 'from /cdn-1', 'the redirect was not followed');
  assert.strictEqual((await viaProxy('/debrid')).text, 'from /cdn-2', 'an expired CDN link was not replaced');
  assert.strictEqual(proxyHits.debrid, 2, 'the working link was not remembered');
  assert.strictEqual((await viaProxy('/debrid')).text, 'from /cdn-2', 'the new link was not remembered');
  assert.strictEqual(proxyHits.debrid, 2, 'the new link was not reused');

  var hlsRef = await reference('http://127.0.0.1:9191/attrs.m3u8');
  var list = await request({ hostname: '127.0.0.1', port: appPort, path: '/proxy?ref=' + hlsRef });
  assert.strictEqual(list.headers['content-type'], 'application/vnd.apple.mpegurl', 'a playlist kept the wrong type');
  assert.strictEqual(list.headers['content-length'], String(Buffer.byteLength(list.text)), 'a rewritten playlist kept the old length');
  assert.ok(/URI="http:\/\/127\.0\.0\.1:\d+\/proxy\?ref=[^"]*key\.bin[^"]*"/.test(list.text), 'an attribute in a playlist was not rewritten');
  assert.ok(list.text.indexOf('URI="data:text/plain,x"') >= 0, 'a data link was rewritten');
  assert.ok(list.text.indexOf('seg%2Fone.ts') >= 0 && list.text.indexOf('other.example') >= 0, 'playlist lines were not rewritten');
  var forged = list.text.split('\n').filter(function (l) { return /one\.ts/.test(l); })[0].replace(/sig=[0-9a-f]+/, 'sig=00');
  assert.ok(/sig=00/.test(forged), 'no signature in a playlist line');
  console.log('OK: proxy Range, HEAD, redirects, credentials kept from other hosts, expired CDN links, playlists.');
}

async function main() {
  engineLogicTests();
  await serverAddressTests();
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
    /* what /proxy meets out there: moved links, a CDN link that expires, a file with Range */
    if (req.url === '/moved-same') { res.writeHead(302, { Location: '/echo-headers' }); res.end(); return; }
    if (req.url === '/moved-away') { res.writeHead(302, { Location: 'http://localhost:9191/echo-headers' }); res.end(); return; }
    if (req.url === '/moved-loop') { res.writeHead(302, { Location: '/moved-loop' }); res.end(); return; }
    if (req.url === '/echo-headers') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ auth: req.headers.authorization || '', cookie: req.headers.cookie || '', referer: req.headers.referer || '', method: req.method })); return; }
    if (req.url === '/debrid') { proxyHits.debrid++; res.writeHead(302, { Location: '/cdn-' + proxyHits.debrid }); res.end(); return; }
    if (/^\/cdn-\d+$/.test(req.url)) {
      proxyHits.cdn.push(req.url);
      if (req.url === '/cdn-1' && proxyHits.cdn.length > 1) { res.writeHead(403); res.end(); return; }
      res.setHeader('Content-Type', 'video/mp4'); res.end('from ' + req.url);
      return;
    }
    if (req.url === '/ranged') {
      var askedRange = /bytes=(\d+)-(\d+)/.exec(req.headers.range || '');
      if (!askedRange) { res.setHeader('Content-Type', 'video/mp4'); res.setHeader('ETag', '"v1"'); res.setHeader('X-Secret-Server', 'no'); res.end('0123456789'); return; }
      res.writeHead(206, { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes ' + askedRange[1] + '-' + askedRange[2] + '/10', 'Accept-Ranges': 'bytes' });
      res.end('0123456789'.slice(+askedRange[1], +askedRange[2] + 1));
      return;
    }
    if (req.url === '/attrs.m3u8') {
      res.setHeader('Content-Type', 'application/x-mpegURL');
      res.end('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXT-X-MEDIA:TYPE=AUDIO,URI="data:text/plain,x"\n#EXTINF:4,\nseg/one.ts\n\nhttp://other.example/two.ts\n');
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
  /* STREMCOMPAT_SERVER_NODE runs the staged server on another Node, such as the TV's 0.12 */
  var child = childProcess.spawn(process.env.STREMCOMPAT_SERVER_NODE || process.execPath, [path.join(root, 'service', 'local-server.js')], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { TV_ENGINE: path.join(__dirname, 'lib', 'fake-engine.js'), SC_SERVER_LOG: testLog, SC_SERVER_FORCE_EMBEDDED_UI: forceEmbedded ? '1' : '0' })
  });
  var childLog = '';
  child.stdout.on('data', function (d) { childLog += d.toString(); childLogGlobal = childLog; });
  child.stderr.on('data', function (d) { childLog += d.toString(); childLogGlobal = childLog; });

  try {
    var health = await waitForHealth(0);
    var healthJson = JSON.parse(health.text);
    assert.strictEqual(healthJson.version, appVersion);
    assert.ok(healthJson.memory.rssMiB > 0 && healthJson.memory.heapMiB > 0, 'health memory diagnostics missing');
    mediaAndDiskTests();
    await engineRoutesTests();
    await proxyTests();
    var noUpdate = await request({ hostname: '127.0.0.1', port: appPort, path: '/update' });
    assert.strictEqual(noUpdate.status, 200, 'the update check did not answer');
    var updateCheck = require(path.join(root, 'service', 'server', 'update-check.js'));
    assert.strictEqual(updateCheck.isNewer('3.1.0', '3.0.9'), true, 'a newer version was not noticed');
    assert.strictEqual(updateCheck.isNewer('3.0.10', '3.0.9'), true, 'versions were compared as text');
    assert.strictEqual(updateCheck.isNewer('3.0.0', '3.0.0'), false, 'the same version counted as new');
    assert.strictEqual(updateCheck.isNewer('2.9.9', '3.0.0'), false, 'an older version counted as new');
    var spanish = await request({ hostname: '127.0.0.1', port: appPort, path: '/lang/es.json' });
    assert.strictEqual(JSON.parse(spanish.text).navHome, 'Inicio', 'a language file was not served');
    assert.strictEqual((await request({ hostname: '127.0.0.1', port: appPort, path: '/lang/..%2fprofile.json' })).status, 404, 'a file outside the language folder was reachable');

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
    assert.ok(shell.text.indexOf('/interface.js?v=' + appVersion) >= 0);
    assert.ok(shell.text.indexOf('__APP_VERSION__') < 0 && shell.text.indexOf('<!--@profile-->') < 0, 'interface template markers were not rendered');
    assert.ok(shell.text.indexOf('window.__SC_PROFILE__=') >= 0 && shell.text.indexOf('"id":"' + profile.profile + '"') >= 0, 'interface profile was not injected');
    var application = await request({ hostname: '127.0.0.1', port: appPort, path: '/interface.js?v=' + appVersion });
    assert.strictEqual(application.status, 200);
    assert.ok(/^application\/javascript/.test(application.headers['content-type'] || ''));
    assert.ok(sourceHas(application.text, "window.__SC_PHASE__('M0')"));
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
    var tracks = JSON.parse((await request({ hostname: '127.0.0.1', port: appPort, path: '/subtitle-tracks?u=' + encodeURIComponent('http://127.0.0.1:9191/nothing.mkv') })).text);
    assert.ok(Array.isArray(tracks.tracks) && tracks.err, 'a failed track read did not report an error');

    console.log('OK: health, ' + (forceEmbedded ? 'embedded' : 'file') + ' UI, addon bridge, stream references, proxy headers, relative HLS, subtitle addons, subtitle decoding, protected takeover.');
  } finally {
    try { child.kill(); } catch (e) {}
    await new Promise(function (resolve) { upstream.close(resolve); });
    try { fs.unlinkSync(testLog); } catch (e) {}
  }
}

main().catch(function (error) {
  console.error(error && error.stack || error);
  if (childLogGlobal) console.error('local server output:\n' + childLogGlobal);
  process.exitCode = 1;
});
