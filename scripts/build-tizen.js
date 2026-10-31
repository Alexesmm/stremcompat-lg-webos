'use strict';

// Stages the Samsung package into .build/tizen-armv7, ready for scripts/package-tizen.ps1.
//
// The pages are built from the same generated files as the LG packages, with the Tizen
// platform modules. The local server is service/server/*.js with one rewrite: Node 4.4.3
// does not know `var { A } = require()`. Anything else Node 4 cannot run stops the build.
//
// Usage: node scripts/build-tizen.js

var acorn = require('acorn');
var fs = require('fs');
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
function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  Object.keys(node).forEach(function (key) {
    var value = node[key];
    if (Array.isArray(value)) value.forEach(function (item) { walk(item, visit); });
    else if (value && typeof value === 'object') walk(value, visit);
  });
}

/* var { A, B: C } = x;  ->  var _m1 = x, A = _m1.A, C = _m1.B; */
function rewriteDestructuring(source, file) {
  var ast = acorn.parse(source, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true });
  var edits = [], count = 0;
  walk(ast, function (node) {
    if (node.type !== 'VariableDeclaration') return;
    var pattern = node.declarations.filter(function (d) { return d.id.type === 'ObjectPattern'; });
    if (!pattern.length) return;
    if (node.declarations.length !== 1) throw new Error(file + ': destructuring next to other declarations');
    var decl = node.declarations[0], name = '_m' + (++count);
    var names = decl.id.properties.map(function (prop) {
      if (prop.type !== 'Property' || prop.computed || prop.key.type !== 'Identifier' || prop.value.type !== 'Identifier')
        throw new Error(file + ': destructuring that cannot be rewritten');
      return prop.value.name + ' = ' + name + '.' + prop.key.name;
    });
    edits.push({
      start: node.start,
      end: node.end,
      text: 'var ' + name + ' = ' + source.slice(decl.init.start, decl.init.end) + ', ' + names.join(', ') + ';'
    });
  });
  edits.sort(function (a, b) { return b.start - a.start; }).forEach(function (edit) {
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  });
  return source;
}

var FORBIDDEN_NODES = {
  ObjectPattern: 'destructuring', ArrayPattern: 'destructuring', AssignmentPattern: 'default parameters',
  RestElement: 'rest parameters', SpreadElement: 'spread', ClassDeclaration: 'classes outside strict mode',
  ClassExpression: 'classes outside strict mode'
};
var FORBIDDEN_CALLS = /\.(includes|padStart|padEnd|flat|flatMap|finally)\(|Object\.(values|entries|fromEntries)\(/;
/* Throws when a file uses something Node 4.4.3 does not have. */
function assertNode4(source, file) {
  var ast = acorn.parse(source, { ecmaVersion: 6, sourceType: 'script', allowReturnOutsideFunction: true });
  walk(ast, function (node) {
    if (FORBIDDEN_NODES[node.type]) throw new Error(file + ': ' + FORBIDDEN_NODES[node.type] + ' at ' + node.start);
    if (node.type === 'VariableDeclaration' && node.kind !== 'var') throw new Error(file + ': ' + node.kind + ' outside strict mode');
  });
  var code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  var found = code.match(FORBIDDEN_CALLS);
  if (found) throw new Error(file + ': ' + found[0] + ' is missing from Node 4');
  return source;
}

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
    'x.open("GET","/playinfo"+location.search,true);' +
    'x.onreadystatechange=function(){if(x.readyState===4)answer();};' +
    'x.send();})();';
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
write('index.html', interfacePage());
write('player.html', playerPage());

write('service/main.js', assertNode4(read(path.join(root, 'platforms', 'tizen', 'service', 'main.js')), 'main.js'));
write('service/node4.js', assertNode4(read(path.join(root, 'platforms', 'tizen', 'service', 'node4.js')), 'node4.js'));
write('service/profile.js', assertNode4(read(path.join(root, 'service', 'profile.js')), 'profile.js'));
write('service/profile.json', JSON.stringify(profile));
write('service/roots.json', JSON.stringify(tls.rootCertificates));
copy('service/app-logo.png', 'service/app-logo.png');
fs.readdirSync(path.join(root, 'service', 'fonts')).forEach(function (name) {
  copy('service/fonts/' + name, 'service/fonts/' + name);
});
fs.readdirSync(path.join(root, 'service', 'licenses')).forEach(function (name) {
  copy('service/licenses/' + name, 'service/licenses/' + name);
});
fs.readdirSync(path.join(root, 'service', 'server')).forEach(function (name) {
  if (!/\.js$/.test(name)) return;
  var source = read(path.join(root, 'service', 'server', name));
  write('service/server/' + name, assertNode4(rewriteDestructuring(source, name), name));
});

console.log('Staged ' + path.relative(root, stage) + ' (' + PROFILE_NAME + ' ' + profile.version + ')');
module.exports = { PLAYER_CONSTANTS: PLAYER_CONSTANTS };
