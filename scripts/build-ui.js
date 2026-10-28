'use strict';

// Builds service/beta-app.js from the ES5 modules in src/ui.
//
// The modules are plain script fragments concatenated in the order listed by
// src/ui/modules.json. _prelude.js opens the single strict-mode IIFE and
// _epilogue.js closes it, so every module shares one scope exactly like a single
// file: no loader, no runtime cost and nothing Chromium 38 could reject.
//
// Usage: node scripts/build-ui.js          write service/beta-app.js
//        node scripts/build-ui.js --check  fail if service/beta-app.js is stale

var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var srcDir = path.join(root, 'src', 'ui');
var outFile = path.join(root, 'service', 'beta-app.js');

function lf(text) { return text.replace(/\r\n/g, '\n'); }

function bundle() {
  var modules = JSON.parse(fs.readFileSync(path.join(srcDir, 'modules.json'), 'utf8'));
  return modules.map(function (name) {
    var text = lf(fs.readFileSync(path.join(srcDir, name), 'utf8'));
    if (!text.endsWith('\n')) text += '\n';
    return text;
  }).join('');
}

var output = bundle();
if (process.argv.indexOf('--check') >= 0) {
  var current = fs.existsSync(outFile) ? lf(fs.readFileSync(outFile, 'utf8')) : '';
  if (current !== output) {
    console.error('service/beta-app.js is out of date with src/ui. Run: npm run build:ui');
    process.exit(1);
  }
  console.log('OK: service/beta-app.js matches src/ui.');
} else {
  fs.writeFileSync(outFile, output);
  console.log('Built service/beta-app.js from ' + path.relative(root, srcDir) + '.');
}
