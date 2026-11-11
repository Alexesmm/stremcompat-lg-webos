'use strict';

// Builds the Android TV app: dist/StremCompat-v<version>-AndroidTV.apk.
//
//   1. the pages and the local server, staged as for LG with the android-tv profile (build-stage.js)
//   2. nodejs-mobile's Node for Android, downloaded once into .cache
//   3. what android/app/build.gradle reads from .build/android-tv-app, then Gradle
//
// Needs the Android SDK and NDK (ANDROID_HOME, by default ~/Android/sdk), a JDK 17 or newer
// (JAVA_HOME), the ARM programs in service/bin (npm run runtime) and, for a signed package,
// ~/Android/stremcompat-signing.properties (see android/README.md).
//
// Usage: node scripts/package-android.js

var cp = require('child_process');
var fs = require('fs');
var https = require('https');
var os = require('os');
var path = require('path');

var root = path.resolve(__dirname, '..');
var PROFILE = 'android-tv';
var NODE_VERSION = 'v18.20.4';
var NODE_ZIP = 'nodejs-mobile-' + NODE_VERSION + '-android.zip';
var NODE_URL =
  'https://github.com/nodejs-mobile/nodejs-mobile/releases/download/' + NODE_VERSION + '/' + NODE_ZIP;
var ABIS = ['armeabi-v7a', 'arm64-v8a'];
/* FFmpeg and FFprobe are static 32-bit ARM programs, which arm64 TVs that still run 32-bit code
   run too. The torrent engine is built for webOS's C library and does not run on Android: torrents
   use a streaming server on another computer (profile android-tv, localTorrents false). */
var PROGRAMS = { ffmpeg: 'libffmpeg.so', ffprobe: 'libffprobe.so' };

var profile = JSON.parse(fs.readFileSync(path.join(root, 'profiles', PROFILE + '.json'), 'utf8'));
var stage = path.join(root, '.build', 'android-tv-app');
var cache = path.join(root, '.cache', 'nodejs-mobile-' + NODE_VERSION);

function run(command, args, options) {
  /* Windows runs .bat files only through its shell */
  var r = cp.spawnSync(
    command,
    args,
    Object.assign({ stdio: 'inherit', shell: /\.bat$/.test(command) }, options || {})
  );
  if (r.status !== 0) throw new Error(command + ' ' + args.join(' ') + ' failed');
}
function download(url, file) {
  return new Promise(function (ok, bad) {
    https
      .get(url, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
          return download(res.headers.location, file).then(ok, bad);
        if (res.statusCode !== 200) return bad(new Error(url + ': ' + res.statusCode));
        var out = fs.createWriteStream(file);
        res.pipe(out);
        out.on('finish', function () {
          out.close(ok);
        });
      })
      .on('error', bad);
  });
}

async function nodeMobile() {
  if (fs.existsSync(path.join(cache, 'bin', 'arm64-v8a', 'libnode.so'))) return;
  fs.mkdirSync(cache, { recursive: true });
  var zip = path.join(cache, NODE_ZIP);
  console.log('Downloading ' + NODE_URL);
  await download(NODE_URL, zip);
  /* bsdtar opens zip files; on Windows it is the system's own, not the tar of Git's tools */
  run(process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar', [
    '-xf',
    zip,
    '-C',
    cache
  ]);
  var inner = path.join(cache, 'nodejs-mobile');
  if (fs.existsSync(inner)) {
    fs.readdirSync(inner).forEach(function (name) {
      fs.renameSync(path.join(inner, name), path.join(cache, name));
    });
    fs.rmdirSync(inner);
  }
  fs.unlinkSync(zip);
}

(async function () {
  run(process.execPath, [path.join(root, 'scripts', 'build-ui.js')]);
  run(process.execPath, [path.join(root, 'scripts', 'build-stage.js'), PROFILE]);
  await nodeMobile();

  fs.rmSync(stage, { recursive: true, force: true });
  var service = path.join(root, '.build', PROFILE, 'service');
  fs.cpSync(service, path.join(stage, 'assets', 'service'), {
    recursive: true,
    filter: function (source) {
      var name = path.relative(service, source).split(path.sep)[0];
      return name !== 'bin' && name !== 'subcache' && !/\.log$/i.test(source);
    }
  });
  ABIS.forEach(function (abi) {
    var libs = path.join(stage, 'jniLibs', abi);
    fs.mkdirSync(libs, { recursive: true });
    fs.copyFileSync(path.join(cache, 'bin', abi, 'libnode.so'), path.join(libs, 'libnode.so'));
    Object.keys(PROGRAMS).forEach(function (name) {
      var from = path.join(root, 'service', 'bin', name);
      if (!fs.existsSync(from)) throw new Error(from + ' is missing: run npm run runtime');
      fs.copyFileSync(from, path.join(libs, PROGRAMS[name]));
    });
  });
  fs.cpSync(path.join(cache, 'include'), path.join(stage, 'node', 'include'), { recursive: true });
  fs.cpSync(path.join(cache, 'bin'), path.join(stage, 'node', 'bin'), { recursive: true });

  var env = Object.assign({}, process.env);
  if (!env.ANDROID_HOME) env.ANDROID_HOME = path.join(os.homedir(), 'Android', 'sdk');
  var android = path.join(root, 'android');
  run(
    path.join(android, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'),
    ['--no-daemon', '-q', 'assembleRelease'],
    { cwd: android, env: env }
  );

  var apk = path.join(android, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  if (!fs.existsSync(apk))
    throw new Error(
      'Gradle finished without a signed package: is the signing file in place? See android/README.md'
    );
  var out = path.join(root, 'dist', 'StremCompat-v' + profile.version + '-AndroidTV.apk');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(apk, out);
  console.log('APK ready: ' + out + ' (' + (fs.statSync(out).size / 1048576).toFixed(1) + ' MB)');
})().catch(function (e) {
  console.error(e.message);
  process.exit(1);
});
