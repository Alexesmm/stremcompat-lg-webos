'use strict';

// Stages one television profile into .build/<profile>/{app,service}.
//
// Profile values never patch source code. The service reads profile.json through
// service/profile.js, local-server.js injects the browser profile into interface.html, and
// only the packaged launcher (app/index.html, which runs before the service exists)
// receives explicit __TOKEN__ substitutions.
//
// Usage: node scripts/build-stage.js <profile-name>

var fs = require('fs');
var path = require('path');
var tls = require('tls');
var legacyNode = require('./lib/legacy-node');

var root = path.resolve(__dirname, '..');
var profileName = process.argv[2];
if (!profileName) throw new Error('Usage: node build-stage.js <profile-name>');
var profileFile = path.join(root, 'profiles', profileName + '.json');
if (!fs.existsSync(profileFile)) throw new Error('Unknown profile: ' + profileName);
var profile = JSON.parse(fs.readFileSync(profileFile, 'utf8'));

var buildRoot = path.join(root, '.build', profileName);
var stageApp = path.join(buildRoot, 'app');
var stageService = path.join(buildRoot, 'service');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value));
}
function replaceTokens(file, tokens) {
  var text = fs.readFileSync(file, 'utf8');
  Object.keys(tokens).forEach(function (token) {
    if (text.indexOf(token) < 0) throw new Error(token + ' is missing from ' + file);
    text = text.split(token).join(String(tokens[token]));
  });
  fs.writeFileSync(file, text);
}

fs.rmSync(buildRoot, { recursive: true, force: true });
fs.mkdirSync(buildRoot, { recursive: true });
fs.cpSync(path.join(root, 'app'), stageApp, { recursive: true });
// the launcher shows the same logo and typeface as the interface; both live in service/
fs.copyFileSync(path.join(root, 'service', 'app-logo.png'), path.join(stageApp, 'logo.png'));
fs.cpSync(path.join(root, 'service', 'fonts'), path.join(stageApp, 'fonts'), { recursive: true });
fs.cpSync(path.join(root, 'service'), stageService, {
  recursive: true,
  filter: function (source) {
    return (
      !/\.log$/i.test(source) &&
      path.basename(source) !== 'profile.json' &&
      source !== path.join(root, 'service', 'server.js')
    );
  }
});

var appInfoPath = path.join(stageApp, 'appinfo.json');
var appInfo = readJson(appInfoPath);
appInfo.id = profile.appId;
appInfo.version = profile.version;
appInfo.resolution = String(profile.graphicsResolution);
if (profile.title) appInfo.title = String(profile.title);
writeJson(appInfoPath, appInfo);

var appServicesPath = path.join(stageApp, 'services.json');
// The source holds a one-element array, but every package validated on televisions
// so far shipped the bare object (PowerShell's ConvertTo-Json unwrapped it). Keep
// the shipped form until a physical test shows the array form is equivalent.
var appService = [].concat(readJson(appServicesPath))[0];
appService.name = profile.serviceId;
writeJson(appServicesPath, appService);

var servicePackagePath = path.join(stageService, 'package.json');
var servicePackage = readJson(servicePackagePath);
servicePackage.name = profile.serviceId;
servicePackage.version = profile.version;
writeJson(servicePackagePath, servicePackage);

var serviceManifestPath = path.join(stageService, 'services.json');
var serviceManifest = readJson(serviceManifestPath);
serviceManifest.id = profile.serviceId;
serviceManifest.services[0].name = profile.serviceId;
writeJson(serviceManifestPath, serviceManifest);

// a package installed over the same version must still replace the running server (takeover.js)
profile.build = Date.now().toString(36);
fs.writeFileSync(path.join(stageService, 'profile.json'), JSON.stringify(profile, null, 2) + '\n');

replaceTokens(path.join(stageApp, 'index.html'), {
  __APP_PORT__: profile.port,
  __APP_VERSION__: profile.version,
  __SERVICE_ID__: profile.serviceId
});

// The server runs on the television's own Node: see scripts/lib/legacy-node.js.
function prepareForOldNode(file) {
  fs.writeFileSync(
    file,
    legacyNode.prepare(fs.readFileSync(file, 'utf8'), path.relative(stageService, file))
  );
}
prepareForOldNode(path.join(stageService, 'local-server.js'));
prepareForOldNode(path.join(stageService, 'compat.js'));
fs.readdirSync(path.join(stageService, 'server')).forEach(function (name) {
  if (/\.js$/.test(name)) prepareForOldNode(path.join(stageService, 'server', name));
});
fs.writeFileSync(path.join(stageService, 'roots.json'), JSON.stringify(tls.rootCertificates));

// Another platform than webOS (Android TV) serves the same pages built with its own modules.
if (profile.platform && profile.platform !== 'lg') {
  var generated = path.join(root, 'platforms', profile.platform, 'generated');
  fs.copyFileSync(path.join(generated, 'interface.js'), path.join(stageService, 'interface.js'));
  fs.copyFileSync(
    path.join(generated, 'player-client.js'),
    path.join(stageService, 'player', 'player-client.js')
  );
}

// An embedded copy of the interface makes the low-storage webOS 3 build independent
// of service working-directory and package-file lookup quirks.
var serverPath = path.join(stageService, 'server', 'embedded.js');
var server = fs.readFileSync(serverPath, 'utf8');
var embeddedHtml = fs.readFileSync(path.join(stageService, 'interface.html')).toString('base64');
var embeddedApp = fs.readFileSync(path.join(stageService, 'interface.js')).toString('base64');
var playerAssets = {};
['player.css', 'player-body.html', 'player-client.js'].forEach(function (name) {
  playerAssets[name] = fs.readFileSync(path.join(stageService, 'player', name), 'utf8');
});
var embeddedPlayer = Buffer.from(JSON.stringify(playerAssets), 'utf8').toString('base64');
['__EMBEDDED_INTERFACE_HTML_B64__', '__EMBEDDED_INTERFACE_SCRIPT_B64__', '__EMBEDDED_PLAYER_B64__'].forEach(
  function (token) {
    if (server.split(token).length !== 2)
      throw new Error(token + ' must appear exactly once in server/embedded.js');
  }
);
server = server.replace('__EMBEDDED_INTERFACE_HTML_B64__', function () {
  return embeddedHtml;
});
server = server.replace('__EMBEDDED_INTERFACE_SCRIPT_B64__', function () {
  return embeddedApp;
});
server = server.replace('__EMBEDDED_PLAYER_B64__', function () {
  return embeddedPlayer;
});
fs.writeFileSync(serverPath, server);

console.log('Staged ' + profileName + ' at ' + buildRoot);
