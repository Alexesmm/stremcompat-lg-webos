'use strict';

// Validates a staged profile (.build/<profile>) as it will be packaged: manifests,
// generated profile, launcher tokens, embedded interface copies, syntax targets and
// a live run of the staged server in both file and embedded-interface modes.
//
// Usage: node scripts/verify-stage.js <stage> <profile.json>

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var child = require('child_process');

var stage = path.resolve(process.argv[2] || '');
var profileFile = path.resolve(process.argv[3] || '');
if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: node verify-stage.js <stage> <profile.json>');
var profile = JSON.parse(fs.readFileSync(profileFile, 'utf8'));

function read(rel) { return fs.readFileSync(path.join(stage, rel), 'utf8'); }
function must(rel) {
  var file = path.join(stage, rel);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile() || !fs.statSync(file).size) throw new Error('Missing or empty: ' + rel);
}

[
  'app/appinfo.json', 'app/index.html', 'app/services.json', 'app/logo.png', 'app/fonts/inter-latin-400.woff',
  'service/package.json', 'service/services.json', 'service/launch.js', 'service/profile.js', 'service/profile.json',
  'service/tvserver.js', 'service/server/embedded.js', 'service/server/routes.js', 'service/beta.html', 'service/beta-app.js', 'service/bin/node18',
  'service/player/player.css', 'service/player/player-body.html', 'service/player/player-client.js',
  'service/bin/ffmpeg', 'service/bin/ffprobe'
].forEach(must);

var app = JSON.parse(read('app/appinfo.json'));
var service = JSON.parse(read('service/package.json'));
var serviceManifest = JSON.parse(read('service/services.json'));
var appServices = [].concat(JSON.parse(read('app/services.json')));
if (app.id !== profile.appId || app.version !== profile.version) throw new Error('App manifest does not match profile.');
if (app.resolution !== profile.graphicsResolution) throw new Error('App graphics resolution does not match profile.');
if (['1920x1080', '1280x720'].indexOf(app.resolution) < 0) throw new Error('Unsupported webOS graphics resolution.');
if (service.name !== profile.serviceId || service.version !== profile.version) throw new Error('Service manifest does not match profile.');
if (serviceManifest.id !== profile.serviceId || serviceManifest.services[0].name !== profile.serviceId || appServices[0].name !== profile.serviceId) throw new Error('Service ID mismatch.');

assert.deepStrictEqual(JSON.parse(read('service/profile.json')), profile, 'Generated profile.json does not match the profile.');
var loaded = require(path.join(stage, 'service', 'profile.js')).current;
['port', 'version', 'serviceId', 'appId', 'backdropWidth', 'backdropCache', 'backdropWorkers', 'catalogRowsCap', 'discoverCap'].forEach(function (key) {
  if (loaded[key] !== profile[key]) throw new Error('Staged service does not load profile.' + key);
});

var launcher = read('app/index.html');
if (/__(APP_PORT|APP_VERSION|SERVICE_ID)__/.test(launcher)) throw new Error('Launcher tokens were not replaced.');
if (launcher.indexOf('127.0.0.1:' + profile.port + '/') < 0) throw new Error('Launcher port mismatch.');
if (launcher.indexOf('/beta?v=' + profile.version) < 0) throw new Error('Launcher interface version mismatch.');
if (launcher.indexOf('luna://' + profile.serviceId + '/start') < 0) throw new Error('Launcher service ID mismatch.');

var server = read('service/server/embedded.js');
var shell = read('service/beta.html');
var application = read('service/beta-app.js');
if (server.indexOf('__EMBEDDED_BETA_HTML_B64__') >= 0 || server.indexOf('__EMBEDDED_BETA_APP_B64__') >= 0) throw new Error('Embedded UI placeholders were not replaced.');
function embedded(name) {
  var match = server.match(new RegExp("var " + name + " = '([^']+)'"));
  if (!match) throw new Error('Missing embedded asset: ' + name);
  return Buffer.from(match[1], 'base64').toString('utf8');
}
if (embedded('EMBEDDED_BETA_HTML_B64') !== shell || embedded('EMBEDDED_BETA_APP_B64') !== application) throw new Error('Embedded UI does not match staged files.');
if (server.indexOf('__EMBEDDED_PLAYER_B64__') >= 0) throw new Error('Embedded player placeholder was not replaced.');
var embeddedPlayer = JSON.parse(embedded('EMBEDDED_PLAYER_B64'));
['player.css', 'player-body.html', 'player-client.js'].forEach(function (name) {
  if (embeddedPlayer[name] !== read('service/player/' + name)) throw new Error('Embedded player asset does not match: ' + name);
});

function run(script, args) {
  child.execFileSync(process.execPath, [path.join(__dirname, script)].concat(args), { stdio: 'inherit' });
}
run('verify-frontend.js', [path.join(stage, 'service'), profile.ecmaTarget]);
run('verify-es5.js', [path.join(stage, 'service', 'launch.js')]);
run('verify-es5.js', [path.join(stage, 'service', 'profile.js')]);
run('selftest-runtime.js', [stage, String(profile.port), profile.version, 'file']);
run('selftest-runtime.js', [stage, String(profile.port), profile.version, 'embedded']);
console.log('OK: staged profile ' + profile.profile + ' (' + profile.appId + ' ' + profile.version + ').');
