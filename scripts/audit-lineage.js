'use strict';

// How much of this project's code is still the same as the StremioBrew 1.0.0 package it started
// from, recorded in NOTICE.md. Counts lines of at least 12 characters, ignoring indentation and
// comments, that also appear in that package; generated files are left out.
//
// Usage: node scripts/audit-lineage.js <stremiobrew-1.0.0.ipk> [file, to print its shared lines]

var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var root = path.resolve(__dirname, '..');
var CODE = /\.(js|css|html|sh|cpp)$/;
var LEFT_OUT = /(^|\/)(generated|licenses)\/|^service\/(interface\.js|interface\.html)$|^service\/player\/player-client\.js$/;

function lines(text) {
  var out = [];
  text.split(/\r?\n/).forEach(function (line) {
    var s = line.replace(/\s+/g, ' ').trim();
    if (s.length >= 12 && /[A-Za-z]{3}/.test(s) && !/^(\/\/|\*|\/\*|#)/.test(s)) out.push(s);
  });
  return out;
}

function packageLines(ipk) {
  var data = fs.readFileSync(ipk), offset = 8, tar = null;
  while (offset + 60 <= data.length) {
    var name = data.slice(offset, offset + 16).toString().trim().replace(/\/$/, '');
    var size = parseInt(data.slice(offset + 48, offset + 58).toString(), 10);
    if (name.indexOf('data.tar') === 0) tar = zlib.gunzipSync(data.slice(offset + 60, offset + 60 + size));
    offset += 60 + size + size % 2;
  }
  if (!tar) throw new Error('Not an IPK: ' + ipk);
  var seen = new Set();
  for (offset = 0; offset + 512 <= tar.length; ) {
    var file = tar.slice(offset, offset + 100).toString().replace(/\0.*$/, '');
    if (!file) break;
    var length = parseInt(tar.slice(offset + 124, offset + 136).toString().trim() || '0', 8);
    if (CODE.test(file) && length < 600000) lines(tar.slice(offset + 512, offset + 512 + length).toString()).forEach(function (l) { seen.add(l); });
    offset += 512 + Math.ceil(length / 512) * 512;
  }
  return seen;
}

var known = packageLines(process.argv[2] || path.join(root, '.cache', 'stremiobrew-1.0.0.ipk'));
var files = childProcess.execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n');
var total = 0, shared = 0, rows = [];
files.forEach(function (file) {
  if (!CODE.test(file) || LEFT_OUT.test(file) || !fs.existsSync(path.join(root, file))) return;
  var mine = lines(fs.readFileSync(path.join(root, file), 'utf8'));
  var same = mine.filter(function (l) { return known.has(l); }).length;
  total += mine.length;
  shared += same;
  if (same >= 5) rows.push({ file: file, same: same, lines: mine.length });
  if (file === process.argv[3]) mine.filter(function (l) { return known.has(l); }).forEach(function (l) { console.log('  ' + l); });
});
rows.sort(function (a, b) { return b.same - a.same; });
rows.forEach(function (r) {
  console.log(String(r.same).padStart(5) + ' /' + String(r.lines).padStart(5) + ' ' + String(Math.round((100 * r.same) / r.lines)).padStart(3) + '%  ' + r.file);
});
console.log('Total: ' + shared + ' of ' + total + ' lines, ' + ((100 * shared) / total).toFixed(1) + '%.');
