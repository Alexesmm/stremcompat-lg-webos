'use strict';

var fs = require('fs');
var zlib = require('zlib');

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
['launch.js', 'tvserver.js', 'beta.html', 'beta-app.js'].forEach(function (name) {
  if (!find(entries, new RegExp('/' + name.replace('.', '\\.') + '$'))) throw new Error(name + ' ausente no IPK.');
});
var packedLaunch = find(entries, /\/launch\.js$/).data.toString('utf8');
var packedServer = find(entries, /\/tvserver\.js$/).data.toString('utf8');
var packedShell = find(entries, /\/beta\.html$/).data.toString('utf8');
var packedApplication = find(entries, /\/beta-app\.js$/).data.toString('utf8');
if (packedLaunch.indexOf('APP_PORT = ' + profile.port) < 0 || packedServer.indexOf('PORT = ' + profile.port) < 0) throw new Error('Porta do perfil ausente no IPK.');
if (packedServer.indexOf("p === '/streamref'") < 0 || packedServer.indexOf('rewriteHls') < 0) throw new Error('Proxy seguro/HLS ausente no IPK.');
if (packedApplication.indexOf("postJson('/streamref'") < 0 || packedApplication.indexOf('compact:function()') < 0) throw new Error('Shell otimizado ausente no IPK.');
if (packedApplication.indexOf('function viewportWidth()') < 0 || packedApplication.indexOf('function contentWidth()') < 0 || packedApplication.indexOf('Math.floor(contentWidth()/w)') < 0) throw new Error('Layout responsivo ausente no IPK.');
if (packedApplication.indexOf("'/stremioapi?path='") < 0 || packedServer.indexOf("p === '/stremioapi'") < 0 || packedServer.indexOf("'/api/login': true") < 0) throw new Error('Bridge de conta Stremio ausente no IPK.');
if (packedServer.indexOf('__EMBEDDED_BETA_HTML_B64__') >= 0 || packedServer.indexOf('__EMBEDDED_BETA_APP_B64__') >= 0) throw new Error('Assets incorporados nao foram gerados.');
function embedded(name) {
  var match = packedServer.match(new RegExp("var " + name + " = '([^']+)'"));
  if (!match) throw new Error('Asset incorporado ausente: ' + name);
  return Buffer.from(match[1], 'base64').toString('utf8');
}
if (embedded('EMBEDDED_BETA_HTML_B64') !== packedShell || embedded('EMBEDDED_BETA_APP_B64') !== packedApplication) throw new Error('Assets incorporados diferem dos arquivos empacotados.');

console.log('OK: IPK ' + profile.profile + ' ' + profile.version + ', manifests, shell, servidor e executaveis ARM presentes.');
