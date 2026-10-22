'use strict';

var fs = require('fs');
var zlib = require('zlib');

var ipkPath = process.argv[2];
if (!ipkPath) throw new Error('Uso: node fix-ipk-modes.js caminho-do.ipk');

function readAscii(buffer, start, length) {
    return buffer.slice(start, start + length).toString('ascii').replace(/\0.*$/, '').trim();
}

function writeAscii(buffer, start, length, value) {
    buffer.fill(0x20, start, start + length);
    buffer.write(value.slice(0, length), start, 'ascii');
}

function parseAr(buffer) {
    if (buffer.slice(0, 8).toString('ascii') !== '!<arch>\n') throw new Error('IPK nao e um archive ar valido.');
    var members = [];
    var offset = 8;
    while (offset + 60 <= buffer.length) {
        var header = Buffer.from(buffer.slice(offset, offset + 60));
        var size = parseInt(readAscii(header, 48, 10), 10);
        if (!isFinite(size) || size < 0) throw new Error('Membro ar com tamanho invalido.');
        var name = readAscii(header, 0, 16).replace(/\/$/, '');
        var start = offset + 60;
        members.push({ name: name, header: header, data: Buffer.from(buffer.slice(start, start + size)) });
        offset = start + size + (size % 2);
    }
    return members;
}

function buildAr(members) {
    var parts = [Buffer.from('!<arch>\n', 'ascii')];
    members.forEach(function (member) {
        writeAscii(member.header, 48, 10, String(member.data.length));
        parts.push(member.header, member.data);
        if (member.data.length % 2) parts.push(Buffer.from('\n', 'ascii'));
    });
    return Buffer.concat(parts);
}

function parseOctal(buffer, start, length) {
    var value = readAscii(buffer, start, length);
    return parseInt(value || '0', 8);
}

function writeTarChecksum(tar, offset) {
    tar.fill(0x20, offset + 148, offset + 156);
    var sum = 0;
    for (var i = 0; i < 512; i += 1) sum += tar[offset + i];
    var octal = sum.toString(8);
    while (octal.length < 6) octal = '0' + octal;
    tar.write(octal.slice(-6) + '\0 ', offset + 148, 8, 'ascii');
}

function fixTarModes(gzipData) {
    var tar = zlib.gunzipSync(gzipData);
    var offset = 0;
    var changed = 0;
    while (offset + 512 <= tar.length) {
        var name = readAscii(tar, offset, 100);
        if (!name) break;
        var prefix = readAscii(tar, offset + 345, 155);
        var fullName = prefix ? prefix + '/' + name : name;
        var size = parseOctal(tar, offset + 124, 12);
        if (/\/bin\/(node18|ffmpeg|ffprobe)$/.test(fullName)) {
            tar.write('0000755\0', offset + 100, 8, 'ascii');
            writeTarChecksum(tar, offset);
            changed += 1;
        }
        offset += 512 + (Math.ceil(size / 512) * 512);
    }
    if (changed !== 3) throw new Error('Esperava corrigir node18, ffmpeg e ffprobe; encontrados: ' + changed);
    return zlib.gzipSync(tar, { level: 9 });
}

var original = fs.readFileSync(ipkPath);
var members = parseAr(original);
var dataMember = members.filter(function (member) { return member.name === 'data.tar.gz'; })[0];
if (!dataMember) throw new Error('data.tar.gz nao encontrado no IPK.');
dataMember.data = fixTarModes(dataMember.data);
fs.writeFileSync(ipkPath, buildAr(members));
console.log('Permissoes 0755 aplicadas a node18, ffmpeg e ffprobe dentro do IPK.');
