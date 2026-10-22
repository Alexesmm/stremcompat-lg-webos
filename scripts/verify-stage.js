'use strict';

var fs = require('fs');
var path = require('path');
var child = require('child_process');

var stage = path.resolve(process.argv[2] || '');
var profileFile = path.resolve(process.argv[3] || '');
if (!stage || !profileFile) throw new Error('Usage: node verify-stage.js <stage> <profile.json>');
var profile = JSON.parse(fs.readFileSync(profileFile, 'utf8'));

function read(rel) { return fs.readFileSync(path.join(stage, rel), 'utf8'); }
function must(rel) {
  var file = path.join(stage, rel);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile() || !fs.statSync(file).size) throw new Error('Missing or empty: ' + rel);
}

[
  'app/appinfo.json', 'app/index.html', 'app/services.json',
  'service/package.json', 'service/services.json', 'service/launch.js',
  'service/tvserver.js', 'service/beta.html', 'service/beta-app.js', 'service/bin/node18',
  'service/bin/ffmpeg', 'service/bin/ffprobe'
].forEach(must);

var app = JSON.parse(read('app/appinfo.json'));
var service = JSON.parse(read('service/package.json'));
if (app.id !== profile.appId || app.version !== profile.version) throw new Error('App manifest does not match profile.');
if (service.name !== profile.serviceId || service.version !== profile.version) throw new Error('Service manifest does not match profile.');

var launch = read('service/launch.js');
var server = read('service/tvserver.js');
var shell = read('service/beta.html');
var application = read('service/beta-app.js');
var launcher = read('app/index.html');
if (launch.indexOf('APP_PORT = ' + profile.port) < 0 || server.indexOf('PORT = ' + profile.port) < 0 || launcher.indexOf('127.0.0.1:' + profile.port) < 0) throw new Error('Local port mismatch.');
if (launcher.indexOf('/beta?v=' + profile.version) < 0 || shell.indexOf('/beta-app.js?v=' + profile.version) < 0 || server.indexOf("'Cache-Control': 'no-store, max-age=0'") < 0) throw new Error('Versioned shell cache protection missing.');
if (launch.indexOf("APP_VERSION = '" + profile.version + "'") < 0 || server.indexOf("APP_VERSION = '" + profile.version + "'") < 0) throw new Error('Runtime version mismatch.');
if (launch.indexOf("new Service('" + profile.serviceId + "')") < 0 || launcher.indexOf('luna://' + profile.serviceId + '/start') < 0) throw new Error('Service ID mismatch.');
if (application.indexOf("id:'" + profile.profile + "'") < 0 || shell.indexOf('UJ3_BOOT') < 0) throw new Error('Frontend profile or boot diagnostics missing.');
if (application.indexOf("postJson('/streamref'") < 0 || server.indexOf("p === '/addon'") < 0) throw new Error('Addon/player bridge missing.');

var verifier = path.join(__dirname, 'verify-frontend.js');
child.execFileSync(process.execPath, [verifier, path.join(stage, 'service'), profile.ecmaTarget], { stdio: 'inherit' });
child.execFileSync(process.execPath, [path.join(__dirname, 'verify-es5.js'), path.join(stage, 'service', 'launch.js')], { stdio: 'inherit' });
console.log('OK: staged profile ' + profile.profile + ' (' + profile.appId + ' ' + profile.version + ').');
