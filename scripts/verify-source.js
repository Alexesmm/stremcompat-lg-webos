'use strict';

// Feature presence checks on the sources. They compare code without whitespace or
// quote style, so reformatting never breaks them; a removed feature still does.
//
// Usage: node scripts/verify-source.js [project-or-stage-root]

var fs = require('fs');
var path = require('path');
var sourceHas = require('./lib/source-check').sourceHas;

var root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

var files = {
  launcher: read('app/index.html'),
  shell: read('service/beta.html'),
  application: read('service/beta-app.js'),
  // The server is the bootstrap plus its modules under service/server.
  server: [read('service/tvserver.js')].concat(fs.readdirSync(path.join(root, 'service', 'server')).sort().map(function (name) {
    return read('service/server/' + name);
  })).join('\n'),
  player: read('service/player/player-client.js')
};

var required = [
  ['launcher', '<html lang="en">', 'English first-run bootstrap'],
  ['launcher', '127.0.0.1:__APP_PORT__', 'launcher port token'],
  ['launcher', '/beta?v=__APP_VERSION__', 'versioned interface URL token'],
  ['launcher', 'luna://__SERVICE_ID__/start', 'launcher service token'],
  ['shell', '<!--@profile-->', 'interface profile marker'],
  ['shell', '/beta-app.js?v=__APP_VERSION__', 'versioned application script'],
  ['shell', 'UJ3_BOOT', 'boot diagnostics'],
  ['shell', '@media (max-height:800px)', 'compact 720p layout'],
  ['server', "p === '/streamref'", 'stream reference bridge'],
  ['server', "p === '/addon'", 'addon bridge'],
  ['server', "p === '/stremioapi'", 'account bridge'],
  ['server', "'/api/login': true", 'account bridge allow-list'],
  ['server', "'Cache-Control': 'no-store, max-age=0'", 'versioned shell cache protection'],
  ['player', 'player_resume_recovered', 'player runtime recovery'],
  ['server', 'process.memoryUsage', 'memory diagnostics'],
  ['server', "dbg('[clientlog]", 'client diagnostics'],
  ['player', 'MediaPlayPause', 'player media keys'],
  ['player', 'mode==="seek"', 'player focus zones'],
  ['player', 'function audioName', 'active track labels'],
  ['application', "postJson('/streamref'", 'player bridge client'],
  ['application', "'/stremioapi?path='", 'account bridge client'],
  ['application', 'rowReady:function', 'fault-tolerant catalog navigation'],
  ['application', 'findRow:function', 'fault-tolerant catalog navigation'],
  ['application', 'catalogRowsCap', 'catalog row limit'],
  ['application', 'streamCompatibility', 'codec warnings'],
  ['application', 'webkitvisibilitychange', 'runtime resume recovery'],
  ['application', 'PalmServiceBridge', 'runtime restart bridge'],
  ['application', 'function pointerUI', 'Magic Remote support'],
  ['application', "on(document,'click'", 'Magic Remote clicks'],
  ['application', 'function viewportWidth()', 'resolution-aware layout'],
  ['application', 'Math.floor(contentWidth()/w)', 'resolution-aware row layout'],
  ['application', "window.__STREMIO_PHASE__('B_CALL');boot();", 'synchronous legacy boot']
];
var forbidden = [
  ['server', 'io.strem.tv.beta', 'old beta service identity'],
  ['application', "addEventListener('DOMContentLoaded',boot)", 'deferred boot breaks Chromium 38 startup']
];

var failed = [];
required.forEach(function (check) {
  if (!sourceHas(files[check[0]], check[1])) failed.push('missing ' + check[2] + ' (' + check[0] + ': ' + check[1] + ')');
});
forbidden.forEach(function (check) {
  if (sourceHas(files[check[0]], check[1])) failed.push('found ' + check[2] + ' (' + check[0] + ': ' + check[1] + ')');
});
if (failed.length) {
  failed.forEach(function (line) { console.error(line); });
  process.exit(1);
}
console.log('OK: ' + required.length + ' required features present in ' + root + '.');
