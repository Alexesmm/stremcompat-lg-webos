'use strict';

// Stages the Samsung package into .build/tizen-armv7, ready for scripts/package-tizen.ps1.
//
// The pages are built from the same generated files as the LG packages, with the Tizen
// platform modules. The local server is service/server/*.js, prepared for old Node as on LG.
//
// Usage: node scripts/build-tizen.js

var fs = require('fs');
var legacyNode = require('./lib/legacy-node');
var path = require('path');
var tls = require('tls');

var root = path.resolve(__dirname, '..');
var PROFILE_NAME = 'tizen-armv7';
var profile = JSON.parse(fs.readFileSync(path.join(root, 'profiles', PROFILE_NAME + '.json'), 'utf8'));
var stage = path.join(root, '.build', PROFILE_NAME);
var profileModule = require(path.join(root, 'service', 'profile.js'));

/* the names player-page.js playerConstants() answers with; selftest-tizen.js keeps them equal */
var PLAYER_CONSTANTS = [
  'URL', 'ADDON', 'QUALITY', 'TITLE', 'TYPE', 'ID', 'VID', 'LOGO', 'BG', 'POSTER', 'SEASON', 'EPISODE',
  'EPTITLE', 'NEXTVID', 'NEXTHREF', 'BACK', 'NEXTTITLE', 'NEXTTHUMB', 'SNAME', 'CERT', 'COMPAT', 'BINGE',
  'SERVICE_ID', 'APP_PORT'
];

function read(file) { return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'); }
function write(relative, text) {
  var file = path.join(stage, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
function copy(from, relative) {
  var file = path.join(stage, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.copyFileSync(path.join(root, from), file);
}
function inlineScript(code) { return code.replace(/<\/script/gi, '<\\/script'); }
function tokens(text) {
  return text
    .split('__APP_VERSION__').join(profile.version)
    .split('__APP_ID__').join(profile.appId)
    .split('__PACKAGE__').join(profile.appId.split('.')[0])
    .split('__SERVICE_ID__').join(profile.serviceId)
    .split('__TITLE__').join(profile.title);
}
/* The page starts before the service does, so what it paints first cannot come from the service. */
function inlineAssets(text) {
  ['inter-latin-400.woff', 'inter-latin-700.woff'].forEach(function (name) {
    var data = fs.readFileSync(path.join(root, 'service', 'fonts', name)).toString('base64');
    text = text.split('/fonts/' + name).join('data:font/woff;base64,' + data);
  });
  var logo = fs.readFileSync(path.join(root, 'service', 'app-logo.png')).toString('base64');
  return text.split('/logo.png').join('data:image/png;base64,' + logo);
}
var baseTag = '<base href="http://127.0.0.1:' + profile.port + '/">';
var viewportTag = '<meta name="viewport" content="width=1920">';

function interfacePage() {
  var html = read(path.join(root, 'service', 'beta.html'));
  var app = read(path.join(root, 'platforms', 'tizen', 'generated', 'beta-app.js'));
  var boot = tokens(read(path.join(root, 'platforms', 'tizen', 'boot.js')));
  var profileScript = '<script>window.__STREMIO_PROFILE__=' + JSON.stringify(profileModule.interfaceProfile(profile)) + ';</script>';
  var scriptTag = /<script src="\/beta-app\.js[^>]*><\/script>/;
  if (!scriptTag.test(html)) throw new Error('service/beta.html no longer loads /beta-app.js');
  if (html.indexOf('<!--@profile-->') < 0) throw new Error('service/beta.html has no profile marker');
  if (html.indexOf('},25000);') < 0) throw new Error('service/beta.html has no startup timer');
  return tokens(html)
    .replace('<head>', function () { return '<head>\n' + baseTag + '\n' + viewportTag; })
    /* the first start also waits for the service: boot.js reports its own failure */
    .replace('},25000);', function () { return '},70000);'; })
    .replace('<!--@profile-->', function () { return profileScript; })
    .replace(scriptTag, function () {
      return '<script>window.__STREMCOMPAT_APP__=function(){\n' + inlineScript(app) + '\n};</script>\n<script>' + inlineScript(boot) + '</script>';
    });
}

function playerPage() {
  var css = read(path.join(root, 'service', 'player', 'player.css'));
  var body = read(path.join(root, 'service', 'player', 'player-body.html'));
  var client = read(path.join(root, 'platforms', 'tizen', 'generated', 'player-client.js'));
  var videoTag = '<video id="v" autoplay></video>';
  if (body.indexOf(videoTag) < 0) throw new Error('service/player/player-body.html has no video element');
  var vars = PLAYER_CONSTANTS.map(function (name) { return name + '=c.' + name; }).join(',');
  var loader =
    '(function(){var root=String(location.href).replace(/[?#].*$/,"").replace(/[^\\/]*$/,"");' +
    'function home(back){location.replace(root+"index.html"+String(back||"beta").replace(/^\\/*beta/,""));}' +
    'function run(c){var ' + vars + ';\n' + inlineScript(client) + '\n}' +
    'var m=location.search.match(/[?&]back=([^&]*)/),back=m?decodeURIComponent(m[1]):"",x=new XMLHttpRequest(),done=false;' +
    'function answer(){if(done)return;done=true;var j=null;try{j=JSON.parse(x.responseText)}catch(e){}' +
    'if(!j||j.gone||!j.URL)return home(back);run(j);}' +
    'function fetchInfo(){x.open("GET","/playinfo"+location.search,true);' +
    'x.onreadystatechange=function(){if(x.readyState===4)answer();};x.send();}' +
    /* as in boot.js: a page opened without the TV's system objects needs a reload */
    'setTimeout(function(){if(typeof webapis!=="undefined"&&typeof tizen!=="undefined"){try{sessionStorage.removeItem("tizenPlayerReloads")}catch(e){}return fetchInfo();}' +
    'var n=3;try{n=parseInt(sessionStorage.getItem("tizenPlayerReloads"),10)||0;if(n<3)sessionStorage.setItem("tizenPlayerReloads",String(n+1));}catch(e){}' +
    'if(n<3)location.reload();else home(back);},300);})();';
  return (
    '<!doctype html><html><head><meta charset="utf-8">' + viewportTag +
    '<script src="$WEBAPIS/webapis/webapis.js"></script>' + baseTag +
    '<style>' + css + '\nhtml,body{background:transparent}#v{background:transparent}</style></head><body>' +
    body.replace(videoTag, '<object id="v" type="application/avplayer"></object>') +
    '<script>' + loader + '</script></body></html>'
  );
}

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

write('config.xml', tokens(read(path.join(root, 'platforms', 'tizen', 'config.xml'))));
copy('app/icon.png', 'icon.png');
write('index.html', inlineAssets(interfacePage()));
write('player.html', inlineAssets(playerPage()));

write('service/main.js', legacyNode.assertRunsOnOldNode(read(path.join(root, 'platforms', 'tizen', 'service', 'main.js')), 'main.js'));
write('service/compat.js', legacyNode.assertRunsOnOldNode(read(path.join(root, 'service', 'compat.js')), 'compat.js'));
write('service/profile.js', legacyNode.assertRunsOnOldNode(read(path.join(root, 'service', 'profile.js')), 'profile.js'));
write('service/profile.json', JSON.stringify(profile));
write('service/roots.json', JSON.stringify(tls.rootCertificates));
copy('service/app-logo.png', 'service/app-logo.png');
fs.readdirSync(path.join(root, 'service', 'fonts')).forEach(function (name) {
  copy('service/fonts/' + name, 'service/fonts/' + name);
});
fs.readdirSync(path.join(root, 'service', 'lang')).forEach(function (name) {
  copy('service/lang/' + name, 'service/lang/' + name);
});
fs.readdirSync(path.join(root, 'service', 'licenses')).forEach(function (name) {
  copy('service/licenses/' + name, 'service/licenses/' + name);
});
fs.readdirSync(path.join(root, 'service', 'server')).forEach(function (name) {
  if (!/\.js$/.test(name)) return;
  var source = read(path.join(root, 'service', 'server', name));
  write('service/server/' + name, legacyNode.prepare(source, name));
});

console.log('Staged ' + path.relative(root, stage) + ' (' + PROFILE_NAME + ' ' + profile.version + ')');
module.exports = { PLAYER_CONSTANTS: PLAYER_CONSTANTS };
