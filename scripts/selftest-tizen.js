'use strict';

// The Samsung build without a TV: the staged package, its service answering like the app needs,
// and the AVPlay wrapper behaving like the <video> the player code expects.

var assert = require('assert');
var childProcess = require('child_process');
var fs = require('fs');
var http = require('http');
var os = require('os');
var path = require('path');
var vm = require('vm');

var root = path.resolve(__dirname, '..');
var stage = path.join(root, '.build', 'tizen-armv7');
var built = childProcess.spawnSync(process.execPath, [path.join(root, 'scripts', 'build-tizen.js')], { encoding: 'utf8' });
assert.strictEqual(built.status, 0, 'the Tizen stage did not build: ' + built.stderr);

// ---- the package ----
function staged(name) { return fs.readFileSync(path.join(stage, name), 'utf8'); }
var profile = JSON.parse(staged('service/profile.json'));
var config = staged('config.xml');
assert.ok(config.indexOf('package="StrmCompat"') > 0, 'the package id is not set');
assert.ok(config.indexOf('StrmCompat.Server') > 0, 'the service id is not set');
assert.ok(config.indexOf('privilege/avplay') > 0, 'AVPlay needs its privilege');
assert.ok(config.indexOf('content-security-policy') > 0, 'without the policy, the pages show a black screen');
assert.ok(config.indexOf('__') < 0, 'a build token stayed in config.xml');
var index = staged('index.html');
var player = staged('player.html');
var baseTag = '<base href="http://127.0.0.1:' + profile.port + '/">';
assert.ok(index.indexOf(baseTag) > 0 && index.indexOf(baseTag) < index.indexOf('<style>'), 'the interface base must come before its styles');
assert.ok(player.indexOf('webapis.js') < player.indexOf(baseTag), 'webapis.js must load before the base address');
assert.ok(player.indexOf('application/avplayer') > 0 && player.indexOf('<video id="v"') < 0, 'the player page must use AVPlay');
assert.ok(index.indexOf('PalmServiceBridge') < 0, 'LG code reached the Samsung interface');
assert.ok(player.indexOf('PalmServiceBridge') < 0, 'LG code reached the Samsung player');
assert.ok(index.indexOf('__STREMCOMPAT_APP__') > 0 && index.indexOf('/beta-app.js') < 0, 'the interface script was not inlined');
[index, player].forEach(function (page) {
  assert.ok(page.indexOf('/fonts/inter') < 0 && page.indexOf('/logo.png') < 0, 'the first paint must not need the service');
});
['server.js', 'bin', 'tvserver.js'].forEach(function (name) {
  assert.ok(!fs.existsSync(path.join(stage, 'service', name)), name + ' must not be in the Samsung package');
});
assert.ok(JSON.parse(staged('service/roots.json')).length > 50, 'the current certificates are missing');
var sizeOf = function (dir) {
  return fs.readdirSync(dir).reduce(function (total, name) {
    var file = path.join(dir, name), st = fs.statSync(file);
    return total + (st.isDirectory() ? sizeOf(file) : st.size);
  }, 0);
};
var stageMb = sizeOf(stage) / 1048576;
assert.ok(stageMb < 4, 'the Samsung package grew to ' + stageMb.toFixed(1) + ' MB');

// ---- a launch without the TV's system objects recovers by itself (boot.js) ----
function bootRun(hasTizen, reloads) {
  var stored = {}, timers = [], reloaded = 0, launched = 0, errors = [];
  if (reloads) stored.tizenBootReloads = String(reloads);
  var ctx = {
    window: { __STREMCOMPAT_APP__: function () {}, __STREMIO_SCRIPT_LOADED__: function () {}, __STREMIO_BOOT_ERROR__: function (m) { errors.push(m); } },
    location: { reload: function () { reloaded++; } },
    sessionStorage: { getItem: function (k) { return k in stored ? stored[k] : null; }, setItem: function (k, v) { stored[k] = v; }, removeItem: function (k) { delete stored[k]; } },
    setTimeout: function (f) { timers.push(f); },
    XMLHttpRequest: function () { this.open = function () {}; this.send = function () {}; },
    Date: Date, JSON: JSON, parseInt: parseInt, String: String
  };
  if (hasTizen) ctx.tizen = { ApplicationControl: function () {}, application: { launchAppControl: function () { launched++; } } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'platforms', 'tizen', 'boot.js'), 'utf8'), ctx);
  timers.shift()();
  return { reloaded: reloaded, launched: launched, errors: errors, stored: stored };
}
var firstLoad = bootRun(false);
assert.strictEqual(firstLoad.reloaded, 1, 'a page without the system objects stayed loading forever');
assert.strictEqual(firstLoad.stored.tizenBootReloads, '1', 'the reload was not counted');
var gaveUp = bootRun(false, 3);
assert.strictEqual(gaveUp.reloaded, 0, 'the page kept reloading past the limit');
assert.strictEqual(gaveUp.errors.length, 1, 'giving up must say why');
var recovered = bootRun(true, 2);
assert.strictEqual(recovered.launched, 1, 'the service was not started');
assert.ok(!('tizenBootReloads' in recovered.stored), 'the reload count stayed after a good start');
assert.ok(player.indexOf('tizenPlayerReloads') > 0, 'the player page must recover the same way');

// ---- every constant of the player page has a variable ----
var script = fs.readFileSync(path.join(root, 'scripts', 'build-tizen.js'), 'utf8');
var names = script.match(/var PLAYER_CONSTANTS = \[([\s\S]*?)\];/)[1].match(/'[A-Z_]+'/g).map(function (s) { return s.slice(1, -1); });
var playerPage = require(path.join(root, 'service', 'server', 'player-page.js'));
assert.deepStrictEqual(names, Object.keys(playerPage.playerConstants({ url: 'http://x/a.mp4' }, {})), 'build-tizen.js and player-page.js name different constants');

// ---- the AVPlay wrapper ----
function fakePlayer(tracks) {
  var calls = [], avplay = {
    calls: calls,
    open: function (u) { calls.push('open ' + u); },
    setListener: function (l) { avplay.l = l; },
    setDisplayRect: function () {},
    setDisplayMethod: function () {},
    prepareAsync: function (ok, bad) { avplay.ok = ok; avplay.bad = bad; },
    getDuration: function () { return 1000000; },
    getTotalTrackInfo: function () { return tracks; },
    getCurrentStreamInfo: function () { return tracks.filter(function (t) { return t.type === 'AUDIO'; }).slice(0, 1); },
    play: function () { calls.push('play'); },
    pause: function () { calls.push('pause'); },
    stop: function () { calls.push('stop'); },
    close: function () { calls.push('close'); },
    seekTo: function (ms, ok) { calls.push('seek ' + ms); avplay.seekDone = ok; },
    setSelectTrack: function (type, n) { calls.push('track ' + type + ' ' + n); },
    setSilentSubtitle: function (off) { calls.push('silent ' + off); }
  };
  return avplay;
}
function wrapper(tracks) {
  var A = fakePlayer(tracks), pageEvents = {}, timers = [];
  var ctx = {
    window: { webapis: { avplay: A }, addEventListener: function (n, f) { pageEvents[n] = f; } },
    document: { hidden: false, addEventListener: function (n, f) { pageEvents[n] = f; } },
    setTimeout: function (f) { timers.push(f); },
    JSON: JSON, Object: Object, Math: Math, parseInt: parseInt, String: String, NaN: NaN
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src', 'platform', 'tizen', 'player.js'), 'utf8') + ';this.video=createVideo();', ctx);
  var seen = [];
  ['loadedmetadata', 'loadeddata', 'canplay', 'play', 'playing', 'pause', 'waiting', 'seeking', 'seeked', 'timeupdate', 'ended', 'error'].forEach(function (name) {
    ctx.video.addEventListener(name, function () { seen.push(name); });
  });
  return { A: A, v: ctx.video, seen: seen, page: pageEvents, ctx: ctx, flush: function () { while (timers.length) timers.shift()(); } };
}
var tracks = [
  { index: 0, type: 'VIDEO', extra_info: '{}' },
  { index: 1, type: 'AUDIO', extra_info: JSON.stringify({ language: 'eng' }) },
  { index: 2, type: 'AUDIO', extra_info: JSON.stringify({ language: 'por' }) },
  { index: 3, type: 'TEXT', extra_info: JSON.stringify({ track_lang: 'por' }) }
];
var w = wrapper(tracks), v = w.v, A = w.A;
assert.ok(isNaN(v.duration) && v.paused && v.readyState === 0, 'a video that has not loaded must look like one');
v.src = 'http://x/a.mkv';
assert.strictEqual(A.calls[0], 'open http://x/a.mkv', 'the source was not opened');
assert.strictEqual(v.textTrackList(), null, 'text tracks were offered before the file was read');
A.ok();
assert.strictEqual(v.duration, 1000, 'the duration must be in seconds');
assert.deepStrictEqual(w.seen, ['loadedmetadata', 'loadeddata', 'canplay'], 'the loading events changed');
assert.ok(A.calls.indexOf('play') < 0, 'playback started before a resume position could be set');
v.currentTime = 120;
assert.ok(A.calls.indexOf('seek 120000') > 0, 'a resume position did not reach the player');
A.seekDone();
w.flush();
assert.ok(A.calls.indexOf('play') > 0 && !v.paused, 'autoplay did not start');
assert.ok(w.seen.indexOf('playing') > 0, 'the loading cover would stay up without playing');
A.l.oncurrentplaytime(130000);
assert.strictEqual(v.currentTime, 130, 'the position must be in seconds');
assert.strictEqual(w.seen[w.seen.length - 1], 'timeupdate', 'the bar and subtitles need timeupdate');
A.l.onbufferingstart();
assert.strictEqual(v.readyState, 2, 'buffering must show as buffering');
A.l.onbufferingcomplete();
assert.strictEqual(v.readyState, 4, 'buffering did not end');

v.currentTime = 200;
v.currentTime = 300;
assert.ok(A.calls.indexOf('seek 300000') < 0, 'a seek started while another was running');
A.seekDone();
assert.ok(A.calls.indexOf('seek 300000') > 0, 'the last seek was lost');
var before = w.seen.filter(function (n) { return n === 'seeked'; }).length;
A.seekDone();
assert.strictEqual(w.seen.filter(function (n) { return n === 'seeked'; }).length, before + 1, 'seeked did not fire once');

// audio: the list, changing it, and waiting for play while paused (Tizen 3)
assert.strictEqual(v.audioTracks.length, 2, 'the audio tracks were not listed');
assert.strictEqual(v.audioTracks[0].enabled, true, 'the current audio track was not marked');
assert.strictEqual(v.audioTracks[1].language, 'por', 'the audio language was not read');
v.audioTracks[0].enabled = false;
v.audioTracks[1].enabled = true;
assert.ok(A.calls.indexOf('track AUDIO 2') > 0, 'the audio track did not change');
v.pause();
assert.strictEqual(w.seen[w.seen.length - 1], 'pause', 'pause did not fire');
v.audioTracks[1].enabled = false;
v.audioTracks[0].enabled = true;
assert.ok(A.calls.indexOf('track AUDIO 1') < 0, 'the audio changed while paused');
v.play();
assert.ok(A.calls.indexOf('track AUDIO 1') > 0, 'the audio chosen while paused was lost');

// embedded subtitles
assert.deepStrictEqual(JSON.parse(JSON.stringify(v.textTrackList())), [{ n: 3, ti: 3, name: 'por' }], 'the text tracks were not listed');
var lines = [];
v.selectTextTrack(3, function (ms, text) { lines.push([ms, text]); });
assert.ok(A.calls.indexOf('track TEXT 3') > 0 && A.calls.indexOf('silent false') > 0, 'the text track was not selected');
A.l.onsubtitlechange('1500', 'Olá');
assert.deepStrictEqual(lines, [[1500, 'Olá']], 'a subtitle line did not arrive');
v.selectTextTrack(-1);
A.l.onsubtitlechange('1500', 'Depois');
assert.strictEqual(lines.length, 1, 'subtitles kept showing after being turned off');

// the end, playing again, errors and leaving
A.l.onstreamcompleted();
assert.ok(v.ended && v.paused && w.seen[w.seen.length - 1] === 'ended', 'the end was not reported');
A.calls.length = 0;
v.play();
assert.strictEqual(A.calls[0], 'open http://x/a.mkv', 'playing after the end did not open the file again');
A.ok();
w.flush();
assert.ok(!v.paused, 'playing after the end did not resume');
A.l.onerror('PLAYER_ERROR_CONNECTION_FAILED');
assert.ok(v.error && v.error.code === 4 && w.seen[w.seen.length - 1] === 'error', 'an error must reach the fail screen');
var w2 = wrapper(tracks);
w2.v.src = 'http://x/b.mkv';
w2.A.bad({ message: 'unsupported' });
assert.ok(w2.v.error, 'a file that cannot open must reach the fail screen');
var w3 = wrapper(tracks);
w3.v.src = 'http://x/c.mkv';
w3.A.ok();
w3.flush();
w3.A.l.oncurrentplaytime(50000);
w3.ctx.document.hidden = true;
w3.page.visibilitychange();
assert.ok(w3.A.calls.indexOf('close') > 0, 'the decoder stayed taken while hidden');
w3.ctx.document.hidden = false;
w3.A.calls.length = 0;
w3.page.visibilitychange();
assert.strictEqual(w3.A.calls[0], 'open http://x/c.mkv', 'coming back did not reopen the video');
w3.A.ok();
w3.flush();
assert.ok(w3.A.calls.indexOf('seek 50000') > 0 && w3.v.paused, 'coming back must keep the place, paused');
var w4 = wrapper(tracks);
w4.v.src = 'http://x/d.mkv';
w4.A.ok();
w4.page.pagehide();
assert.ok(w4.A.calls.indexOf('close') > 0, 'the sound would carry on over the next page');

// ---- on the TV's Node, when one is at hand: NODE4=path/to/node npm test ----
/* A site with a current certificate chain must open with the package's list, and only with it;
   needs the network. Without NODE4 the rest of this test still runs on the current Node. */
function node4Certificates() {
  if (!process.env.NODE4) return;
  var probe =
    "var https=require('https');https.get('https://letsencrypt.org/robots.txt',function(r){console.log('ok');process.exit(0)})" +
    ".on('error',function(e){console.log(e.code);process.exit(0)})";
  function run(script) {
    var out = childProcess.spawnSync(process.env.NODE4, ['-e', script], { encoding: 'utf8', timeout: 30000 });
    return String(out.stdout).trim();
  }
  assert.ok(/^v4\./.test(run('console.log(process.version)')), 'NODE4 is not a Node 4');
  assert.strictEqual(run(probe), 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'this Node already knows the chain, so the check proves nothing');
  var shim = "require(" + JSON.stringify(path.join(stage, 'service', 'compat.js')) + ");";
  assert.strictEqual(run(shim + probe), 'ok', 'the current certificates did not reach Node 4');
  var folder = fs.mkdtempSync(path.join(os.tmpdir(), 'stremcompat-node4-'));
  var made = path.join(folder, 'a', 'b');
  run(shim + "require('fs').mkdirSync(" + JSON.stringify(made) + ",{recursive:true})");
  assert.ok(fs.existsSync(made), 'recursive folders did not work on Node 4');
  fs.rmSync(folder, { recursive: true, force: true });
  console.log('OK: current certificates and shims on ' + run('console.log(process.version)') + '.');
}
node4Certificates();

// ---- the service ----
function request(method, url, headers, body) {
  return new Promise(function (resolve, reject) {
    var req = http.request({ host: '127.0.0.1', port: profile.port, path: url, method: method, headers: headers || {} }, function (res) {
      var chunks = [];
      res.on('data', function (d) { chunks.push(d); });
      res.on('end', function () { resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }); });
    });
    req.on('error', reject);
    req.end(body);
  });
}
function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function () {
  var data = fs.mkdtempSync(path.join(os.tmpdir(), 'stremcompat-tizen-'));
  var child = childProcess.spawn(process.execPath, ['-e', "require(process.argv[1]).onStart()", path.join(stage, 'service', 'main.js')], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: Object.assign({}, process.env, { STREMCOMPAT_DATA: data, STREMCOMPAT_FORCE_ROOTS: '1' })
  });
  var errors = '';
  child.stderr.on('data', function (d) { errors += d; });
  try {
    var health = null;
    for (var i = 0; i < 60 && !health; i++) {
      try { health = JSON.parse((await request('GET', '/health')).text); } catch (e) { await delay(100); }
    }
    assert.ok(health && health.version === profile.version, 'the service did not start: ' + errors);

    var ok = await request('OPTIONS', '/streamref', { Origin: 'file://' });
    assert.strictEqual(ok.status, 200, 'the app pages could not post');
    assert.strictEqual(ok.headers['access-control-allow-origin'], 'file://', 'the preflight must name the app origin');
    assert.strictEqual((await request('OPTIONS', '/serverconfig', { Origin: 'http://evil.example' })).status, 403, 'a site could post to the local server');
    assert.strictEqual((await request('OPTIONS', '/serverconfig', {})).status, 403, 'a request with no origin passed the preflight');

    var made = JSON.parse((await request('POST', '/streamref', { 'Content-Type': 'application/json' }, JSON.stringify({ url: 'https://cdn.example/a.mkv', addon: 'X', name: 'n', title: 't', quality: '1080p', bingeGroup: 'b' }))).text);
    assert.ok(made.ref, 'a stream reference was not created');
    var info = JSON.parse((await request('GET', '/playinfo?ref=' + made.ref + '&back=beta')).text);
    assert.strictEqual(info.URL, 'https://cdn.example/a.mkv', '/playinfo lost the stream');
    assert.strictEqual(info.BINGE, 'b', '/playinfo lost a constant');
    assert.strictEqual(info.SERVICE_ID, 'StrmCompat.Server', '/playinfo named the wrong service');
    assert.ok(JSON.parse((await request('GET', '/playinfo?ref=nothing')).text).gone, 'a lost reference must send the viewer back');

    assert.strictEqual(JSON.parse((await request('GET', '/streamfile')).text).state, 'needs-server', 'torrents must say they need a server');
    assert.strictEqual((await request('GET', '/fonts/inter-latin-400.woff')).headers['access-control-allow-origin'], '*', 'the font must reach a file page');
    assert.strictEqual((await request('GET', '/logo.png')).status, 200, 'the logo is missing');

    var saved = JSON.parse((await request('POST', '/serverconfig', { 'Content-Type': 'application/json' }, JSON.stringify({ address: '' }))).text);
    assert.ok(saved.ok, 'settings could not be saved in the data folder: ' + JSON.stringify(saved));
    assert.ok(fs.existsSync(path.join(data, '.stremcompat', 'server-address.json')), 'the address was not kept in the data folder');
    assert.strictEqual((await request('POST', '/serverconfig', { 'Content-Type': 'text/plain' }, '{}')).status, 403, 'a plain form could change the server');

    var diag = JSON.parse((await request('GET', '/diag')).text);
    assert.ok(diag.system && 'disk' in diag, 'Diagnostics lost storage or memory');

    await request('GET', '/quit');
    var left = false;
    for (var q = 0; q < 40 && !left; q++) {
      await delay(100);
      left = child.exitCode !== null;
    }
    assert.ok(left, 'the service stayed running after the app closed');
  } finally {
    if (child.exitCode === null) child.kill();
    fs.rmSync(data, { recursive: true, force: true });
  }
  console.log('OK: Samsung package (' + stageMb.toFixed(1) + ' MB), AVPlay as a video element, service routes, preflight limited to the app, data folder, leaving on quit.');
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
