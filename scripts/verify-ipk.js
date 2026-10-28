'use strict';

var fs = require('fs');
var zlib = require('zlib');
var sourceHas = require('./lib/source-check').sourceHas;

var file = process.argv[2];
var profileFile = process.argv[3];
if (!file || !profileFile) throw new Error('Usage: node verify-ipk.js <ipk> <profile.json>');
var profile = JSON.parse(fs.readFileSync(profileFile, 'utf8'));

function ascii(buf, start, len) {
  return buf.slice(start, start + len).toString('ascii').replace(/\0.*$/, '').trim();
}
function octal(buf, start, len) { return parseInt(ascii(buf, start, len) || '0', 8); }

function arMember(buf, wanted) {
  if (buf.slice(0, 8).toString('ascii') !== '!<arch>\n') throw new Error('IPK/ar invalido.');
  var offset = 8;
  while (offset + 60 <= buf.length) {
    var name = ascii(buf, offset, 16).replace(/\/$/, '');
    var size = parseInt(ascii(buf, offset + 48, 10), 10);
    var start = offset + 60;
    if (name === wanted) return buf.slice(start, start + size);
    offset = start + size + (size % 2);
  }
  return null;
}

function tarEntries(tar) {
  var out = [], offset = 0;
  while (offset + 512 <= tar.length) {
    var name = ascii(tar, offset, 100);
    if (!name) break;
    var prefix = ascii(tar, offset + 345, 155);
    var full = prefix ? prefix + '/' + name : name;
    var size = octal(tar, offset + 124, 12);
    out.push({ name: full, mode: octal(tar, offset + 100, 8), data: tar.slice(offset + 512, offset + 512 + size) });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

function find(entries, pattern) { return entries.filter(function (e) { return pattern.test(e.name); })[0]; }

var ipk = fs.readFileSync(file);
var packed = arMember(ipk, 'data.tar.gz');
if (!packed) throw new Error('data.tar.gz ausente.');
var entries = tarEntries(zlib.gunzipSync(packed));
if (find(entries, /\.log$/)) throw new Error('Arquivo de log de desenvolvimento foi incluido no IPK.');
var appInfo = find(entries, new RegExp('/applications/' + profile.appId.replace(/\./g, '\\.') + '/appinfo\\.json$'));
var serviceInfo = find(entries, new RegExp('/services/' + profile.serviceId.replace(/\./g, '\\.') + '/package\\.json$'));
if (!appInfo || !serviceInfo) throw new Error('Manifestos empacotados ausentes.');
var packedAppInfo = JSON.parse(appInfo.data.toString('utf8'));
if (packedAppInfo.version !== profile.version) throw new Error('Versao do app empacotado incorreta.');
if (packedAppInfo.resolution !== profile.graphicsResolution) throw new Error('Resolucao grafica do app empacotado incorreta.');
if (JSON.parse(serviceInfo.data.toString('utf8')).version !== profile.version) throw new Error('Versao do servico empacotado incorreta.');

['node18', 'ffmpeg', 'ffprobe'].forEach(function (name) {
  var entry = find(entries, new RegExp('/bin/' + name + '$'));
  if (!entry) throw new Error(name + ' ausente no IPK.');
  if ((entry.mode & 73) !== 73) throw new Error(name + ' nao esta executavel: ' + entry.mode.toString(8));
});
var REQUIRED = [
  'launch.js', 'profile.js', 'profile.json', 'tvserver.js', 'beta.html', 'beta-app.js',
  'server/routes.js', 'server/embedded.js', 'server/proxy.js', 'server/config.js',
  'player/player.css', 'player/player-body.html', 'player/player-client.js'
];
function serviceFile(rel) {
  var entry = find(entries, new RegExp('/services/' + profile.serviceId.replace(/\./g, '\\.') + '/' + rel.replace(/[.\/]/g, '\\$&') + '$'));
  if (!entry) throw new Error(rel + ' ausente no IPK.');
  return entry.data.toString('utf8');
}
REQUIRED.forEach(serviceFile);

var packedProfile = JSON.parse(serviceFile('profile.json'));
if (packedProfile.port !== profile.port || packedProfile.version !== profile.version || packedProfile.serviceId !== profile.serviceId) throw new Error('Perfil empacotado difere do perfil do build.');
var packedServer = entries.filter(function (e) { return /\/server\/[^\/]+\.js$/.test(e.name); })
  .map(function (e) { return e.data.toString('utf8'); }).join('\n');
var packedEmbedded = serviceFile('server/embedded.js');
var packedShell = serviceFile('beta.html');
var packedApplication = serviceFile('beta-app.js');
[
  [packedServer, "p === '/streamref'", 'Proxy seguro ausente no IPK.'],
  [packedServer, 'rewriteHls', 'Reescrita HLS ausente no IPK.'],
  [packedServer, "p === '/stremioapi'", 'Bridge de conta Stremio ausente no IPK.'],
  [packedServer, "'/api/login': true", 'Bridge de conta Stremio ausente no IPK.'],
  [packedApplication, "postJson('/streamref'", 'Shell otimizado ausente no IPK.'],
  [packedApplication, 'compact:function()', 'Shell otimizado ausente no IPK.'],
  [packedApplication, 'function viewportWidth()', 'Layout responsivo ausente no IPK.'],
  [packedApplication, 'Math.floor(contentWidth()/w)', 'Layout responsivo ausente no IPK.'],
  [packedApplication, "'/stremioapi?path='", 'Bridge de conta Stremio ausente no IPK.']
].forEach(function (check) { if (!sourceHas(check[0], check[1])) throw new Error(check[2]); });
if (/__EMBEDDED_[A-Z_]+_B64__/.test(packedEmbedded)) throw new Error('Assets incorporados nao foram gerados.');
function embedded(name) {
  var match = packedEmbedded.match(new RegExp("var " + name + " = '([^']+)'"));
  if (!match) throw new Error('Asset incorporado ausente: ' + name);
  return Buffer.from(match[1], 'base64').toString('utf8');
}
if (embedded('EMBEDDED_BETA_HTML_B64') !== packedShell || embedded('EMBEDDED_BETA_APP_B64') !== packedApplication) throw new Error('Assets incorporados diferem dos arquivos empacotados.');
var packedPlayer = JSON.parse(embedded('EMBEDDED_PLAYER_B64'));
['player.css', 'player-body.html', 'player-client.js'].forEach(function (name) {
  if (packedPlayer[name] !== serviceFile('player/' + name)) throw new Error('Player incorporado difere do empacotado: ' + name);
});

console.log('OK: IPK ' + profile.profile + ' ' + profile.version + ', manifests, shell, servidor e executaveis ARM presentes.');
