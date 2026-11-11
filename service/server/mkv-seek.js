// Matroska files whose first index only points at a second one.
//
// A Matroska file starts with a small index (the SeekHead) saying where its Cues, the table the
// player seeks with, are. Some muxers write a first SeekHead with a single entry that points at a
// second SeekHead near the end of the file, and list the Cues only there. Chrome and FFmpeg follow
// that chain; the TV's own player does not, finds no Cues, and the video cannot seek.
//
// This finds that case and returns a patch: the first entry, rewritten in place to point straight
// at the Cues. The entry keeps its length, so every other offset in the file stays true. Nothing
// is read or changed beyond the first bytes, and a file that does not look like this is left alone.

var HEAD_BYTES = 256;
var SECOND_HEAD_BYTES = 4096;

var EBML = '1a45dfa3';
var SEGMENT = '18538067';
var SEEK_HEAD = '114d9b74';
var CUES = '1c53bb6b';

/* EBML variable-length numbers: the first byte says how many bytes it takes */
function vintLength(first) {
  for (var n = 1; n <= 8; n++) if (first & (0x80 >> (n - 1))) return n;
  return 0;
}

function readUInt(buf, at, n) {
  var value = 0;
  for (var i = 0; i < n; i++) value = value * 256 + buf[at + i];
  return value;
}

function readVint(buf, at) {
  var n = vintLength(buf[at]);
  if (!n || at + n > buf.length) return null;
  var value = buf[at] & (0xff >> n);
  for (var i = 1; i < n; i++) value = value * 256 + buf[at + i];
  return { length: n, value: value };
}

/* The Seek entries of the SeekHead that starts at `at`:
   [{ id (hex), pos, idAt, idLen, posAt, posLen }], or null when it is not a readable SeekHead. */
function parseSeekHead(buf, at) {
  if (buf.length < at + 5 || buf.toString('hex', at, at + 4) !== SEEK_HEAD) return null;
  var size = readVint(buf, at + 4);
  if (!size) return null;
  var p = at + 4 + size.length;
  var end = Math.min(buf.length, p + size.value);
  var entries = [];
  while (p + 3 <= end) {
    if (buf.toString('hex', p, p + 2) !== '4dbb') return null;
    var entrySize = readVint(buf, p + 2);
    if (!entrySize) return null;
    var q = p + 2 + entrySize.length;
    var entryEnd = q + entrySize.value;
    if (entryEnd > end) return null;
    var entry = {};
    while (q + 2 <= entryEnd) {
      var tag = buf.toString('hex', q, q + 2);
      var inner = readVint(buf, q + 2);
      if (!inner) return null;
      var dataAt = q + 2 + inner.length;
      if (tag === '53ab') {
        entry.id = buf.toString('hex', dataAt, dataAt + inner.value);
        entry.idAt = dataAt;
        entry.idLen = inner.value;
      } else if (tag === '53ac') {
        entry.pos = readUInt(buf, dataAt, inner.value);
        entry.posAt = dataAt;
        entry.posLen = inner.value;
      }
      q = dataAt + inner.value;
    }
    if (entry.id && entry.pos != null) entries.push(entry);
    p = entryEnd;
  }
  return entries;
}

function entryFor(entries, id) {
  for (var i = 0; i < entries.length; i++) if (entries[i].id === id) return entries[i];
  return null;
}

/* Does this start of a file need the patch? `head` is its first bytes (HEAD_BYTES is enough).
   `readRange(from, length, cb)` reads other bytes of the same file, cb(error, Buffer).
   cb(patches): [{ at, bytes }] to lay over the file, or null when it needs none. */
function plan(head, readRange, cb) {
  if (!head || head.length < 64 || head.toString('hex', 0, 4) !== EBML) return cb(null);
  var seg = -1;
  for (var i = 4; i < head.length - 12; i++) {
    if (head.toString('hex', i, i + 4) === SEGMENT) {
      seg = i;
      break;
    }
  }
  if (seg < 0) return cb(null);
  var segSize = readVint(head, seg + 4);
  if (!segSize) return cb(null);
  var segStart = seg + 4 + segSize.length; /* positions in the indexes count from here */
  var first = parseSeekHead(head, segStart);
  if (!first || entryFor(first, CUES)) return cb(null);
  var chain = entryFor(first, SEEK_HEAD);
  if (!chain || chain.idLen !== 4) return cb(null);
  readRange(segStart + chain.pos, SECOND_HEAD_BYTES, function (err, second) {
    var entries = !err && second ? parseSeekHead(second, 0) : null;
    var cues = entries && entryFor(entries, CUES);
    if (!cues || cues.pos >= Math.pow(256, chain.posLen)) return cb(null);
    /* make sure the table is there before pointing at it */
    readRange(segStart + cues.pos, 4, function (err2, mark) {
      if (err2 || !mark || mark.toString('hex') !== CUES) return cb(null);
      var pos = Buffer.alloc(chain.posLen);
      var rest = cues.pos;
      for (var k = chain.posLen - 1; k >= 0; k--) {
        pos[k] = rest % 256;
        rest = Math.floor(rest / 256);
      }
      cb([
        { at: chain.idAt, bytes: Buffer.from(CUES, 'hex') },
        { at: chain.posAt, bytes: pos }
      ]);
    });
  });
}

/* Lays the patches over `chunk`, whose first byte is byte `start` of the file. */
function overlay(chunk, start, patches) {
  for (var i = 0; i < patches.length; i++) {
    var patch = patches[i];
    var from = Math.max(start, patch.at);
    var to = Math.min(start + chunk.length, patch.at + patch.bytes.length);
    for (var at = from; at < to; at++) chunk[at - start] = patch.bytes[at - patch.at];
  }
}

module.exports = { HEAD_BYTES: HEAD_BYTES, plan: plan, overlay: overlay, parseSeekHead: parseSeekHead };
