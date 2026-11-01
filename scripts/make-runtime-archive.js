'use strict';

// Builds the runtime archive the packages are made from: the programs native/build-ffmpeg.sh and
// native/build-engine.sh produce, as gathered by native/collect.sh. A maintainer tool: the result
// is published as the runtime-v3.0.0 prerelease, so a build does not need the cross compiler.
//
// Usage: node scripts/make-runtime-archive.js <folder with the programs> <output.tar.gz>

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var runtime = require('./extract-runtime');

var folder = process.argv[2],
  output = process.argv[3];
if (!folder || !output) throw new Error('Usage: node make-runtime-archive.js <folder> <output.tar.gz>');

function octal(value, size) {
  return value.toString(8).padStart(size - 1, '0') + '\0';
}

function tarEntry(name, data) {
  var header = Buffer.alloc(512);
  header.write(name, 0, 100, 'ascii');
  header.write(octal(0o755, 8), 100, 8, 'ascii');
  header.write(octal(0, 8), 108, 8, 'ascii');
  header.write(octal(0, 8), 116, 8, 'ascii');
  header.write(octal(data.length, 12), 124, 12, 'ascii');
  header.write(octal(0, 12), 136, 12, 'ascii');
  header.write('        ', 148, 8, 'ascii');
  header.write('0', 156, 1, 'ascii');
  header.write('ustar\u000000', 257, 8, 'ascii');
  var sum = 0;
  for (var i = 0; i < 512; i++) sum += header[i];
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  var padding = Buffer.alloc((512 - (data.length % 512)) % 512);
  return Buffer.concat([header, data, padding]);
}

var parts = runtime.WANTED.map(function (relative) {
  return tarEntry(relative, fs.readFileSync(path.join(folder, path.basename(relative))));
});
parts.push(Buffer.alloc(1024));
fs.writeFileSync(output, zlib.gzipSync(Buffer.concat(parts), { level: 9 }));
console.log('Runtime archive written: ' + output + ' (' + runtime.WANTED.length + ' files).');
