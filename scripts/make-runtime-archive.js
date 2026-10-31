'use strict';

// Builds the runtime archive the packages are made from: Node.js, its libraries, FFmpeg
// and FFprobe taken from the pinned StremioBrew 1.0.0 IPK, WITHOUT Stremio's closed-source
// streaming server (the TV downloads that from Stremio, see service/server/streaming-file.js).
// A maintainer tool: the result is published as the runtime-v2.0.0 prerelease.
//
// Usage: node scripts/make-runtime-archive.js <stremiobrew-1.0.0.ipk> <output.tar.gz>

var fs = require('fs');
var zlib = require('zlib');
var runtime = require('./extract-runtime');

var input = process.argv[2],
  output = process.argv[3];
if (!input || !output) throw new Error('Usage: node make-runtime-archive.js <source.ipk> <output.tar.gz>');

function octal(value, size) {
  return (value.toString(8).padStart(size - 1, '0') + '\0');
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

var all = runtime.readEntries(input);
var parts = runtime.WANTED.map(function (relative) {
  return tarEntry(relative, runtime.findEntry(all, relative).data);
});
parts.push(Buffer.alloc(1024));
fs.writeFileSync(output, zlib.gzipSync(Buffer.concat(parts), { level: 9 }));
console.log('Runtime archive written: ' + output + ' (' + runtime.WANTED.length + ' files).');
