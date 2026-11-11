'use strict';

// Builds the browser files the service serves from their sources:
//
//   src/ui/*.js      -> service/interface.js            (order: src/ui/modules.json)
//   src/player/*.js  -> service/player/player-client.js (order: src/player/modules.json)
//   src/ui/index.html + src/ui/styles/*.css -> service/interface.html (order: src/ui/styles/styles.json)
//   the same scripts with src/platform/tizen -> platforms/tizen/generated/ (see build-tizen.js)
//   and with src/platform/android -> platforms/android/generated/ (see build-stage.js)
//
// Scripts are plain fragments concatenated in order. In the interface, _prelude.js
// opens the single strict-mode IIFE and _epilogue.js closes it; the player is
// wrapped by server/player-page.js after its per-stream constants. Every module of
// one bundle shares one scope exactly like a single file: no loader, no runtime cost
// and nothing Chromium 38 could reject. The generated files are committed.
//
// Usage: node scripts/build-ui.js          write the generated files
//        node scripts/build-ui.js --check  fail if a generated file is stale

var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');

function lf(text) {
  return text.replace(/\r\n/g, '\n');
}
function read(file) {
  return lf(fs.readFileSync(file, 'utf8'));
}
function list(dir, manifest) {
  return JSON.parse(read(path.join(dir, manifest)));
}

function scripts(dir, platform) {
  return list(dir, 'modules.json')
    .map(function (name) {
      var text = read(
        path.join(dir, platform ? name.replace('platform/lg/', 'platform/' + platform + '/') : name)
      );
      return text.endsWith('\n') ? text : text + '\n';
    })
    .join('');
}

// Style modules are separated by one blank line, as they were inside <style>.
function page(dir) {
  var styleDir = path.join(dir, 'styles');
  var css = list(styleDir, 'styles.json')
    .map(function (name) {
      return read(path.join(styleDir, name)).replace(/\s+$/, '');
    })
    .join('\n\n');
  var template = read(path.join(dir, 'index.html'));
  if (template.split('/*@styles*/').length !== 2)
    throw new Error('src/ui/index.html must contain /*@styles*/ once');
  return template.replace('/*@styles*/', function () {
    return css;
  });
}

var targets = [
  {
    out: 'service/interface.js',
    build: function () {
      return scripts(path.join(root, 'src', 'ui'));
    }
  },
  {
    out: 'service/player/player-client.js',
    build: function () {
      return scripts(path.join(root, 'src', 'player'));
    }
  },
  {
    out: 'service/interface.html',
    build: function () {
      return page(path.join(root, 'src', 'ui'));
    }
  },
  {
    out: 'platforms/tizen/generated/interface.js',
    build: function () {
      return scripts(path.join(root, 'src', 'ui'), 'tizen');
    }
  },
  {
    out: 'platforms/tizen/generated/player-client.js',
    build: function () {
      return scripts(path.join(root, 'src', 'player'), 'tizen');
    }
  },
  {
    out: 'platforms/android/generated/interface.js',
    build: function () {
      return scripts(path.join(root, 'src', 'ui'), 'android');
    }
  },
  {
    out: 'platforms/android/generated/player-client.js',
    build: function () {
      return scripts(path.join(root, 'src', 'player'), 'android');
    }
  }
];

var check = process.argv.indexOf('--check') >= 0,
  stale = [];
targets.forEach(function (target) {
  var file = path.join(root, target.out),
    output = target.build();
  if (check) {
    var current = fs.existsSync(file) ? read(file) : '';
    if (current !== output) stale.push(target.out);
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, output);
    console.log('Built ' + target.out);
  }
});
if (stale.length) {
  console.error(stale.join(', ') + ' out of date with src. Run: npm run build:ui');
  process.exit(1);
}
if (check) console.log('OK: generated interface and player files match src.');
