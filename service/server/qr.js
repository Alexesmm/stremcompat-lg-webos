// QR codes for the sign-in by phone, drawn here because the TV's browser has no way to make one.
// Byte mode, error correction level M, versions 1 to 10 (up to 213 bytes): enough for a link.

/* per version 1 to 10, level M: error correction codewords per block, and the number of blocks */
var ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
var BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

/* ---------- arithmetic in GF(256), modulo x^8 + x^4 + x^3 + x^2 + 1 ---------- */
function multiply(x, y) {
  var z = 0;
  for (var i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}
function divisor(degree) {
  var result = [],
    root = 1;
  for (var i = 0; i < degree - 1; i++) result.push(0);
  result.push(1);
  for (i = 0; i < degree; i++) {
    for (var j = 0; j < result.length; j++) {
      result[j] = multiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = multiply(root, 0x02);
  }
  return result;
}
function remainder(data, div) {
  var result = div.map(function () {
    return 0;
  });
  data.forEach(function (b) {
    var factor = b ^ result.shift();
    result.push(0);
    div.forEach(function (coef, i) {
      result[i] ^= multiply(coef, factor);
    });
  });
  return result;
}

/* ---------- sizes ---------- */
function rawModules(version) {
  var result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    var align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}
function dataCodewords(version) {
  return Math.floor(rawModules(version) / 8) - ECC_PER_BLOCK[version] * BLOCKS[version];
}
function alignmentPositions(version, size) {
  if (version === 1) return [];
  var count = Math.floor(version / 7) + 2,
    step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2,
    result = [6];
  for (var pos = size - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

/* ---------- the data: mode, length, bytes, padding, then error correction, interleaved ---------- */
function codewords(bytes, version) {
  var bits = [];
  function put(value, length) {
    for (var i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  }
  put(4, 4);
  put(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach(function (b) {
    put(b, 8);
  });
  var capacity = dataCodewords(version) * 8;
  put(0, Math.min(4, capacity - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (var pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
  var data = [];
  for (var i = 0; i < bits.length; i += 8) {
    var byte = 0;
    for (var k = 0; k < 8; k++) byte = (byte << 1) | bits[i + k];
    data.push(byte);
  }
  var blockCount = BLOCKS[version],
    eccLength = ECC_PER_BLOCK[version],
    raw = Math.floor(rawModules(version) / 8),
    shortBlocks = blockCount - (raw % blockCount),
    shortLength = Math.floor(raw / blockCount),
    div = divisor(eccLength),
    blocks = [],
    at = 0;
  for (i = 0; i < blockCount; i++) {
    var block = data.slice(at, at + shortLength - eccLength + (i < shortBlocks ? 0 : 1));
    at += block.length;
    var ecc = remainder(block, div);
    if (i < shortBlocks) block.push(0);
    blocks.push(block.concat(ecc));
  }
  var result = [];
  for (i = 0; i < blocks[0].length; i++)
    for (var j = 0; j < blocks.length; j++)
      if (i !== shortLength - eccLength || j >= shortBlocks) result.push(blocks[j][i]);
  return result;
}

/* ---------- the symbol ---------- */
var MASKS = [
  function (x, y) {
    return (x + y) % 2 === 0;
  },
  function (x, y) {
    return y % 2 === 0;
  },
  function (x) {
    return x % 3 === 0;
  },
  function (x, y) {
    return (x + y) % 3 === 0;
  },
  function (x, y) {
    return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
  },
  function (x, y) {
    return ((x * y) % 2) + ((x * y) % 3) === 0;
  },
  function (x, y) {
    return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
  },
  function (x, y) {
    return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
];

function symbol(version, data, mask) {
  var size = version * 4 + 17,
    dark = [],
    fixed = [],
    i,
    j;
  for (i = 0; i < size; i++) {
    dark.push([]);
    fixed.push([]);
    for (j = 0; j < size; j++) {
      dark[i].push(false);
      fixed[i].push(false);
    }
  }
  function set(x, y, on) {
    dark[y][x] = on;
    fixed[y][x] = true;
  }
  for (i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  [
    [3, 3],
    [size - 4, 3],
    [3, size - 4]
  ].forEach(function (c) {
    for (var dy = -4; dy <= 4; dy++)
      for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)),
          x = c[0] + dx,
          y = c[1] + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
  });
  var align = alignmentPositions(version, size);
  align.forEach(function (ax, a) {
    align.forEach(function (ay, b) {
      if ((a === 0 && b === 0) || (a === 0 && b === align.length - 1) || (a === align.length - 1 && b === 0))
        return;
      for (var dy = -2; dy <= 2; dy++)
        for (var dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    });
  });
  function format(m) {
    /* level M is 00 */
    var value = m,
      rem = value;
    for (var k = 0; k < 10; k++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((value << 10) | rem) ^ 0x5412;
    function bit(n) {
      return ((bits >>> n) & 1) !== 0;
    }
    for (k = 0; k <= 5; k++) set(8, k, bit(k));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (k = 9; k < 15; k++) set(14 - k, 8, bit(k));
    for (k = 0; k < 8; k++) set(size - 1 - k, 8, bit(k));
    for (k = 8; k < 15; k++) set(8, size - 15 + k, bit(k));
    set(8, size - 8, true);
  }
  format(mask);
  if (version >= 7) {
    var rem = version;
    for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    var vbits = (version << 12) | rem;
    for (i = 0; i < 18; i++) {
      var on = ((vbits >>> i) & 1) !== 0,
        a = size - 11 + (i % 3),
        b = Math.floor(i / 3);
      set(a, b, on);
      set(b, a, on);
    }
  }
  var n = 0;
  for (var right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (var vert = 0; vert < size; vert++)
      for (j = 0; j < 2; j++) {
        var x = right - j,
          up = ((right + 1) & 2) === 0,
          y = up ? size - 1 - vert : vert;
        if (!fixed[y][x] && n < data.length * 8) {
          dark[y][x] = ((data[n >>> 3] >>> (7 - (n & 7))) & 1) !== 0;
          n++;
        }
      }
  }
  for (y = 0; y < size; y++)
    for (x = 0; x < size; x++) if (!fixed[y][x] && MASKS[mask](x, y)) dark[y][x] = !dark[y][x];
  return dark;
}

/* how hard a symbol is to read, as the standard scores it: the mask with the lowest score is used */
function penalty(m) {
  var size = m.length,
    score = 0,
    x,
    y,
    darkCount = 0;
  function runs(get) {
    for (var a = 0; a < size; a++) {
      var run = 1;
      for (var b = 1; b <= size; b++) {
        if (b < size && get(a, b) === get(a, b - 1)) run++;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
    }
  }
  runs(function (a, b) {
    return m[a][b];
  });
  runs(function (a, b) {
    return m[b][a];
  });
  for (y = 0; y < size - 1; y++)
    for (x = 0; x < size - 1; x++)
      if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
  var finder = [true, false, true, true, true, false, true];
  function finderLike(get) {
    for (var a = 0; a < size; a++)
      for (var b = 0; b + 7 <= size; b++) {
        var match = true;
        for (var k = 0; k < 7 && match; k++) match = get(a, b + k) === finder[k];
        if (!match) continue;
        var before = true,
          after = true;
        for (k = 1; k <= 4; k++) {
          if (b - k >= 0 && get(a, b - k)) before = false;
          if (b + 6 + k < size && get(a, b + 6 + k)) after = false;
        }
        if (before || after) score += 40;
      }
  }
  finderLike(function (a, b) {
    return m[a][b];
  });
  finderLike(function (a, b) {
    return m[b][a];
  });
  for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (m[y][x]) darkCount++;
  score += Math.floor(Math.abs(darkCount * 20 - size * size * 10) / (size * size)) * 10;
  return score;
}

/* the modules of the smallest symbol that holds `text`, as rows of true (dark) and false */
function qrMatrix(text, forcedMask) {
  var bytes = Array.prototype.slice.call(Buffer.from(String(text), 'utf8')),
    version = 1;
  while (version <= 10 && dataCodewords(version) - (version < 10 ? 2 : 3) < bytes.length) version++;
  if (version > 10) throw new Error('too long for a QR code here');
  var data = codewords(bytes, version);
  if (forcedMask != null) return symbol(version, data, forcedMask);
  var best = null,
    bestScore = Infinity;
  for (var mask = 0; mask < 8; mask++) {
    var candidate = symbol(version, data, mask),
      score = penalty(candidate);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/* the symbol as an SVG image, with the quiet zone around it */
function qrSvg(text) {
  var m = qrMatrix(text),
    size = m.length + 8,
    path = '';
  for (var y = 0; y < m.length; y++)
    for (var x = 0; x < m.length; x++) if (m[y][x]) path += 'M' + (x + 4) + ' ' + (y + 4) + 'h1v1h-1z';
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
    size +
    ' ' +
    size +
    '" shape-rendering="crispEdges">' +
    '<rect width="' +
    size +
    '" height="' +
    size +
    '" fill="#fff"/><path d="' +
    path +
    '" fill="#000"/></svg>'
  );
}

module.exports = {
  qrMatrix: qrMatrix,
  qrSvg: qrSvg
};
