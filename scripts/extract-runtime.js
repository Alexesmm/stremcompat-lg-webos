'use strict';

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var ipkFile = process.argv[2];
var outputRoot = path.resolve(process.argv[3] || 'service');
if (!ipkFile) throw new Error('Usage: node extract-runtime.js <source.ipk> [service-directory]');

function ascii(buf, start, len) {
  return buf.slice(start, start + len).toString('ascii').replace(/\0.*$/, '').trim();
}

function octal(buf, start, len) {
  return parseInt(ascii(buf, start, len) || '0', 8);
}

function arMember(buf, wanted) {
  if (buf.slice(0, 8).toString('ascii') !== '!<arch>\n') throw new Error('Invalid IPK archive.');
  var offset = 8;
  while (offset + 60 <= buf.length) {
    var name = ascii(buf, offset, 16).replace(/\/$/, '');
    var size = parseInt(ascii(buf, offset + 48, 10), 10);
    var start = offset + 60;
    if (name === wanted) return buf.slice(start, start + size);
    offset = start + size + (size % 2);
  }
  return null;
}

function entries(tar) {
  var result = [];
  var offset = 0;
  while (offset + 512 <= tar.length) {
    var name = ascii(tar, offset, 100);
    if (!name) break;
    var prefix = ascii(tar, offset + 345, 155);
    var full = (prefix ? prefix + '/' : '') + name;
    var size = octal(tar, offset + 124, 12);
    var type = ascii(tar, offset + 156, 1);
    result.push({ name: full.replace(/^\.\//, ''), type: type, data: tar.slice(offset + 512, offset + 512 + size) });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return result;
}

var wanted = [
  'server.js',
  'bin/node18', 'bin/ffmpeg', 'bin/ffprobe',
  'bin/lib/libatomic.so.1', 'bin/lib/libatomic.so.1.2.0',
  'bin/lib/libcares.so.2', 'bin/lib/libcares.so.2.6.1',
  'bin/lib/libcrypto.so.3',
  'bin/lib/libnghttp2.so.14', 'bin/lib/libnghttp2.so.14.24.1',
  'bin/lib/libssl.so.3',
  'bin/lib/libstdc++.so.6', 'bin/lib/libstdc++.so.6.0.25',
  'bin/lib/libuv.so', 'bin/lib/libuv.so.1', 'bin/lib/libuv.so.1.0.0'
];

var packed = arMember(fs.readFileSync(ipkFile), 'data.tar.gz');
if (!packed) throw new Error('data.tar.gz is missing from source IPK.');
var all = entries(zlib.gunzipSync(packed));

wanted.forEach(function (relative) {
  var normalized = relative.replace(/\\/g, '/');
  var match = all.filter(function (entry) {
    return entry.type !== '5' && (entry.name === normalized || entry.name.slice(-(normalized.length + 1)) === '/' + normalized);
  })[0];
  if (!match) throw new Error('Runtime component is missing: ' + relative);
  var destination = path.join(outputRoot, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, match.data);
});

console.log('Runtime extracted into ' + outputRoot + '.');
