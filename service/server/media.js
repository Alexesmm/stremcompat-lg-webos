// What the player shows about a video: the badges on the paused screen and the seek previews.

var crypto = require('crypto');
var spawn = require('child_process').spawn;
var { FFMPEG } = require('./config');
var { sendJson } = require('./http-util');
var { localProxy } = require('./proxy');
var { NICE, lowerPriority } = require('./priority');
var { probeStreams } = require('./probe');
var { langName } = require('./subtitles');

/* ---------- the badges ---------- */
var VIDEO_NAMES = { hevc: 'HEVC', h264: 'H.264', av1: 'AV1' };
var AUDIO_NAMES = { eac3: 'Dolby Digital+', ac3: 'Dolby Digital', truehd: 'Dolby TrueHD' };
var CHANNEL_NAMES = { 8: '7.1', 6: '5.1', 2: '2.0' };
var COVER_ART = ['mjpeg', 'png'];
var GiB = 1073741824;
var MiB = 1048576;

function firstStream(streams, test) {
  return streams.filter(test)[0] || null;
}

/* by the width too: a film in a cinema format is wider than tall, 4K at 3840x1600 */
function resolutionName(width, height) {
  if (width >= 3000 || height >= 2000) return '4K';
  if (width >= 1800 || height >= 1000) return '1080p';
  if (width >= 1200 || height >= 690) return '720p';
  return height ? height + 'p' : '';
}

function hdrName(video) {
  var sideData = video.side_data_list || [];
  var dolby =
    String(video.codec_tag_string || '')
      .toLowerCase()
      .indexOf('dvh') === 0 ||
    sideData.some(function (item) {
      return (
        String(item.side_data_type || '')
          .toLowerCase()
          .indexOf('dovi') >= 0
      );
    });
  if (dolby) return 'Dolby Vision';
  var transfer = String(video.color_transfer || '').toLowerCase();
  return transfer === 'smpte2084' ? 'HDR10' : transfer === 'arib-std-b67' ? 'HLG' : '';
}

function audioName(audio) {
  var codec = String(audio.codec_name || '').toLowerCase();
  var name = AUDIO_NAMES[codec] || (codec.indexOf('dts') === 0 ? 'DTS' : codec.toUpperCase());
  var channels = audio.channels || 0;
  var layout = CHANNEL_NAMES[channels] || (channels ? channels + 'ch' : '');
  return layout ? name + ' ' + layout : name;
}

function describe(streams, format, chapters) {
  var info = {};
  var video = firstStream(streams, function (s) {
    return s.codec_type === 'video' && COVER_ART.indexOf(String(s.codec_name || '')) < 0;
  });
  var audio = firstStream(streams, function (s) {
    return s.codec_type === 'audio';
  });
  /* every audio track for the player's list, and the chapters when the file has some */
  var audios = streams.filter(function (s) {
    return s.codec_type === 'audio';
  });
  if (audios.length > 1)
    info.audios = audios.map(function (track) {
      var tags = track.tags || {};
      return {
        lang: tags.language ? langName(String(tags.language).toLowerCase()) : '',
        title: String(tags.title || '').slice(0, 60),
        format: audioName(track)
      };
    });
  var marks = (chapters || [])
    .map(function (chapter) {
      return {
        t: Number(chapter.start_time),
        name: String((chapter.tags && chapter.tags.title) || '').slice(0, 60)
      };
    })
    .filter(function (mark) {
      return mark.t >= 0;
    })
    .slice(0, 80);
  if (marks.length > 1) info.chapters = marks;
  if (video) {
    var codec = String(video.codec_name || '').toLowerCase();
    info.res = resolutionName(video.width || 0, video.height || 0);
    info.vcodec = VIDEO_NAMES[codec] || codec.toUpperCase();
    var hdr = hdrName(video);
    if (hdr) info.hdr = hdr;
  }
  if (audio) info.audio = audioName(audio);
  var size = parseInt(format.size || '0', 10);
  if (size > 0)
    info.size = size >= GiB ? Math.round((size * 10) / GiB) / 10 + ' GB' : Math.round(size / MiB) + ' MB';
  var bitrate = parseInt(format.bit_rate || '0', 10);
  if (bitrate > 0) info.br = Math.round(bitrate / 100000) / 10 + ' Mb/s';
  return info;
}

var described = {};

function probeInfo(u, res) {
  if (!u) return sendJson(res, {});
  if (described[u]) return sendJson(res, described[u]);
  probeStreams(u, function (probe) {
    if (probe.err) return sendJson(res, {});
    var info = describe(probe.streams || [], probe.format || {}, probe.chapters);
    if (Object.keys(described).length > 20) described = {};
    described[u] = info;
    sendJson(res, info);
  });
}

/* ---------- the seek previews ----------
   When a film opens, a few frames spread over its length are taken in the background, one at a
   time so playback and the remote keep the processor. A seek gets the nearest frame already
   taken, at once, and moves the frame it really wanted to the front of the line. */
var PREVIEW_COUNT = 24;
var SECONDS_PER_PREVIEW = 20;
var FRAME_TIMEOUT_MS = 12000;
var PAUSE_BETWEEN_MS = 250;
var SMALLEST_FRAME = 500;

var previews = null;

function previewKey(u) {
  return crypto.createHash('sha1').update(String(u)).digest('hex').slice(0, 16);
}

/* every 6th first, then every 3rd, then the rest: the whole film gets rough coverage early */
function coarseFirst(count) {
  var order = [];
  [6, 3, 1].forEach(function (stride) {
    for (var i = 0; i < count; i += stride) {
      if (order.indexOf(i) < 0) order.push(i);
    }
  });
  return order;
}

function frameArguments(u, at) {
  return [
    '-nostdin',
    '-probesize',
    '900000',
    '-analyzeduration',
    '900000',
    '-ss',
    String(at),
    '-noaccurate_seek',
    '-i',
    localProxy(u),
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
}

function takeNextFrame(set) {
  if (previews !== set || set.worker) return;
  if (!set.waiting.length) {
    set.done = true;
    return;
  }
  var index = set.waiting.shift();
  var parts = [];
  var finished = false;
  var worker;
  try {
    worker = spawn(FFMPEG, frameArguments(set.u, set.times[index]));
    lowerPriority(worker, NICE.BACKGROUND);
  } catch (e) {
    return;
  }
  set.worker = worker;
  var timer = setTimeout(function () {
    worker.kill('SIGKILL');
  }, FRAME_TIMEOUT_MS);
  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    set.worker = null;
    var frame = Buffer.concat(parts);
    if (frame.length > SMALLEST_FRAME) set.frames[index] = frame;
    setTimeout(function () {
      takeNextFrame(set);
    }, PAUSE_BETWEEN_MS);
  }
  worker.stdout.on('data', function (chunk) {
    parts.push(chunk);
  });
  worker.on('error', finish);
  worker.on('close', finish);
}

function spriteGen(q, res) {
  var u = q.u || '';
  var length = Math.floor(parseFloat(q.dur || '0') || 0);
  if (!u || length < 30) return sendJson(res, { ok: false });
  var key = previewKey(u);
  if (previews && previews.key === key)
    return sendJson(res, { ok: true, buckets: previews.times, done: previews.done });
  if (previews && previews.worker) previews.worker.kill('SIGKILL');
  var count = Math.min(PREVIEW_COUNT, Math.max(10, Math.floor(length / SECONDS_PER_PREVIEW)));
  var times = [];
  for (var i = 0; i < count; i++) times.push(Math.floor((length * (i + 0.5)) / count));
  previews = {
    key: key,
    u: u,
    times: times,
    frames: {},
    waiting: coarseFirst(count),
    worker: null,
    done: false
  };
  takeNextFrame(previews);
  sendJson(res, { ok: true, buckets: times });
}

function nearestIndex(times, target, allowed) {
  var best = -1;
  times.forEach(function (time, i) {
    if (allowed(i) && (best < 0 || Math.abs(time - target) < Math.abs(times[best] - target))) best = i;
  });
  return best;
}

function grabFrame(q, res) {
  var u = q.u || '';
  if (!u) {
    res.writeHead(404);
    return res.end();
  }
  var set = previews && previews.key === previewKey(u) ? previews : null;
  if (set) {
    var target = Math.max(0, parseInt(q.t || '0', 10) || 0);
    var wanted = nearestIndex(set.times, target, function () {
      return true;
    });
    var place = set.waiting.indexOf(wanted);
    if (place > 0) set.waiting.unshift(set.waiting.splice(place, 1)[0]);
    var taken = nearestIndex(set.times, target, function (i) {
      return !!set.frames[i];
    });
    if (taken >= 0) {
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(set.frames[taken]);
    }
  }
  res.writeHead(204);
  res.end();
}

module.exports = {
  describe: describe,
  grabFrame: grabFrame,
  probeInfo: probeInfo,
  spriteGen: spriteGen
};
