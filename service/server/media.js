// ffprobe tech info and seek-preview frames.

var crypto = require('crypto');
var spawn = require('child_process').spawn;
var { FFMPEG } = require('./config');
var { sendJson } = require('./http-util');
var { localProxy } = require('./proxy');
var { NICE, lowerPriority } = require('./priority');
var { probeStreams } = require('./probe');

// ---- stream tech-info probe (for the paused-player vignette badges) ----
var infoCache = {};

function probeInfo(u, res) {
  if (!u) return sendJson(res, {});
  if (infoCache[u]) return sendJson(res, infoCache[u]);
  probeStreams(u, function (j) {
    var info = {};
    if (j.err) return sendJson(res, info);
    try {
      var ss = j.streams || [],
        fmtI = j.format || {},
        vs = null,
        as = null;
      for (var i = 0; i < ss.length; i++) {
        var cn = String(ss[i].codec_name || '');
        if (!vs && ss[i].codec_type === 'video' && cn !== 'mjpeg' && cn !== 'png') vs = ss[i];
        if (!as && ss[i].codec_type === 'audio') as = ss[i];
      }
      if (vs) {
        var h = vs.height || 0;
        info.res = h >= 2000 ? '4K' : h >= 1000 ? '1080p' : h >= 690 ? '720p' : h ? h + 'p' : '';
        var vc = String(vs.codec_name || '').toLowerCase();
        info.vcodec =
          vc === 'hevc' ? 'HEVC' : vc === 'h264' ? 'H.264' : vc === 'av1' ? 'AV1' : vc.toUpperCase();
        var trc = String(vs.color_transfer || '').toLowerCase();
        if (
          String(vs.codec_tag_string || '')
            .toLowerCase()
            .indexOf('dvh') === 0
        )
          info.hdr = 'Dolby Vision';
        else if (trc === 'smpte2084') info.hdr = 'HDR10';
        else if (trc === 'arib-std-b67') info.hdr = 'HLG';
        var sd = vs.side_data_list || [];
        for (var s2 = 0; s2 < sd.length; s2++) {
          if (
            String(sd[s2].side_data_type || '')
              .toLowerCase()
              .indexOf('dovi') >= 0
          )
            info.hdr = 'Dolby Vision';
        }
      }
      if (as) {
        var ac = String(as.codec_name || '').toLowerCase();
        var nm =
          ac === 'eac3'
            ? 'Dolby Digital+'
            : ac === 'ac3'
              ? 'Dolby Digital'
              : ac === 'truehd'
                ? 'Dolby TrueHD'
                : ac.indexOf('dts') === 0
                  ? 'DTS'
                  : ac.toUpperCase();
        var ch = as.channels || 0;
        var lay = ch === 8 ? '7.1' : ch === 6 ? '5.1' : ch === 2 ? '2.0' : ch ? ch + 'ch' : '';
        info.audio = nm + (lay ? ' ' + lay : '');
      }
      var sz = parseInt(fmtI.size || '0', 10);
      if (sz > 0)
        info.size =
          sz >= 1073741824 ? Math.round(sz / 107374182.4) / 10 + ' GB' : Math.round(sz / 1048576) + ' MB';
      var br = parseInt(fmtI.bit_rate || '0', 10);
      if (br > 0) info.br = Math.round(br / 100000) / 10 + ' Mb/s';
    } catch (e) {}
    if (Object.keys(infoCache).length > 20) infoCache = {};
    infoCache[u] = info;
    console.log('[probe] ' + JSON.stringify(info));
    sendJson(res, info);
  });
}

// ---- scrub-preview: background coarse-sprite cache (Netflix-style, adapted for a remote
// stream on weak hardware). On player load /spritegen extracts ~SPRITE_N evenly-spaced
// thumbnails ONE AT A TIME in the background; /frame snaps the seek target to the nearest
// already-extracted bucket and serves it INSTANTLY (204 while that region isn't ready yet).
// The header/Cues are fetched once by the first seek, so each extra thumb is cheap.
var SPRITE_N = 24;

var spriteJob = null;

// { key, u, buckets:[t...], frames:{i:buf}, queue:[i...], act, prs:[], done }
function spriteKeyOf(u) {
  return crypto.createHash('sha1').update(String(u)).digest('hex').slice(0, 16);
}

function spriteExtractNext() {
  var job = spriteJob;
  if (!job) return;
  if (!job.queue.length) {
    if (!job.act) {
      job.done = true;
      console.log('[sprite] done ' + Object.keys(job.frames).length + '/' + job.buckets.length);
    }
    return;
  }
  while (job.act < 1 && job.queue.length) spriteSpawnOne(job); // one process: preserve CPU for playback and remote input
}

function spriteSpawnOne(job) {
  var idx = job.queue.shift(),
    t = job.buckets[idx];
  job.act++;
  var args = [
    '-nostdin',
    '-probesize',
    '900000',
    '-analyzeduration',
    '900000',
    '-ss',
    String(t),
    '-noaccurate_seek',
    '-i',
    localProxy(job.u),
    '-an',
    '-frames:v',
    '1',
    '-vf',
    'scale=320:-2',
    '-q:v',
    '7',
    '-f',
    'mjpeg',
    'pipe:1'
  ];
  var chunks = [],
    pr,
    closed = false;
  try {
    pr = spawn(FFMPEG, args);
    lowerPriority(pr, NICE.BACKGROUND);
  } catch (e) {
    job.act--;
    return;
  }
  job.prs.push(pr);
  var to = setTimeout(function () {
    try {
      pr.kill('SIGKILL');
    } catch (e) {}
  }, 12000);
  pr.stdout.on('data', function (d) {
    chunks.push(d);
  });
  function step() {
    if (closed) return;
    closed = true;
    clearTimeout(to);
    var pi = job.prs.indexOf(pr);
    if (pi >= 0) job.prs.splice(pi, 1);
    if (spriteJob !== job) return;
    var buf = Buffer.concat(chunks);
    if (buf.length > 500) job.frames[idx] = buf;
    job.act--;
    setTimeout(spriteExtractNext, 250);
  }
  pr.on('error', step);
  pr.on('close', step);
}

// coarse-first order: every 6th bucket, then every 3rd, then the rest -> the WHOLE movie
// gets rough coverage in the first ~10 extractions instead of baking left-to-right.
function spriteOrder(n) {
  var out = [],
    seen = {},
    strides = [6, 3, 1];
  for (var s = 0; s < strides.length; s++)
    for (var i = 0; i < n; i += strides[s])
      if (!seen[i]) {
        seen[i] = 1;
        out.push(i);
      }
  return out;
}

function spriteGen(q, res) {
  var u = q.u || '',
    dur = Math.floor(parseFloat(q.dur || '0') || 0);
  if (!u || dur < 30) {
    sendJson(res, { ok: false });
    return;
  }
  var key = spriteKeyOf(u);
  if (spriteJob && spriteJob.key === key) {
    sendJson(res, { ok: true, buckets: spriteJob.buckets, done: spriteJob.done });
    return;
  }
  if (spriteJob && spriteJob.prs) {
    for (var kp = 0; kp < spriteJob.prs.length; kp++) {
      try {
        spriteJob.prs[kp].kill('SIGKILL');
      } catch (e) {}
    }
  }
  var n = Math.min(SPRITE_N, Math.max(10, Math.floor(dur / 20))); // ~1/20s, capped at 60
  var buckets = [];
  for (var i = 0; i < n; i++) buckets.push(Math.floor((dur * (i + 0.5)) / n));
  spriteJob = {
    key: key,
    u: u,
    buckets: buckets,
    frames: {},
    queue: spriteOrder(n),
    act: 0,
    prs: [],
    done: false
  };
  console.log('[sprite] start n=' + n + ' dur=' + dur);
  spriteExtractNext();
  sendJson(res, { ok: true, buckets: buckets });
}

function grabFrame(q, res) {
  var u = q.u || '',
    t = Math.max(0, parseInt(q.t || '0', 10) || 0);
  if (!u) {
    res.writeHead(404);
    res.end();
    return;
  }
  if (spriteJob && spriteJob.key === spriteKeyOf(u)) {
    var job = spriteJob,
      b = job.buckets;
    // nearest BAKED bucket
    var best = -1,
      bd = 1e9;
    for (var i = 0; i < b.length; i++) {
      if (job.frames[i] != null) {
        var d = Math.abs(b[i] - t);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    }
    // nearest bucket overall; if it isn't baked yet, bump it to the FRONT of the queue so
    // the region being scrubbed bakes next (priority-on-demand)
    var want = -1,
      wd = 1e9;
    for (var j = 0; j < b.length; j++) {
      var dj = Math.abs(b[j] - t);
      if (dj < wd) {
        wd = dj;
        want = j;
      }
    }
    if (want >= 0 && job.frames[want] == null && !job.done) {
      var qi = job.queue.indexOf(want);
      if (qi > 0) {
        job.queue.splice(qi, 1);
        job.queue.unshift(want);
      }
    }
    if (best >= 0) {
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(job.frames[best]);
      return;
    }
  }
  res.writeHead(204);
  res.end();
}

module.exports = {
  grabFrame: grabFrame,
  probeInfo: probeInfo,
  spriteGen: spriteGen
};
