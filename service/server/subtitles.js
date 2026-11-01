// Subtitles: external files turned into cues, and text tracks read out of the video with FFmpeg.

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawn;
var zlib = require('zlib');
var { DIR, FFMPEG } = require('./config');
var { remoteAddress } = require('./server-address');
var { fetchUrl, sendJson } = require('./http-util');
var { localProxy } = require('./proxy');
var { NICE, lowerPriority } = require('./priority');
var { probeStreams } = require('./probe');

/* ISO 639 codes as tracks name their language */
var LANGUAGE_NAMES = {};
[
  ['English', 'eng'],
  ['Spanish', 'spa'],
  ['French', 'fre fra'],
  ['German', 'ger deu'],
  ['Italian', 'ita'],
  ['Portuguese', 'por'],
  ['Russian', 'rus'],
  ['Arabic', 'ara'],
  ['Dutch', 'dut nld'],
  ['Polish', 'pol'],
  ['Turkish', 'tur'],
  ['Swedish', 'swe'],
  ['Romanian', 'rum ron'],
  ['Greek', 'gre'],
  ['Hebrew', 'heb'],
  ['Hindi', 'hin'],
  ['Korean', 'kor'],
  ['Japanese', 'jpn'],
  ['Chinese', 'chi zho'],
  ['Czech', 'cze'],
  ['Danish', 'dan'],
  ['Finnish', 'fin'],
  ['Norwegian', 'nor'],
  ['Hungarian', 'hun'],
  ['Bulgarian', 'bul'],
  ['Ukrainian', 'ukr'],
  ['Serbian', 'srp'],
  ['Croatian', 'hrv'],
  ['Slovak', 'slo'],
  ['Slovenian', 'slv'],
  ['Spanish (LA)', 'spl'],
  ['Portuguese (BR)', 'pob']
].forEach(function (entry) {
  entry[1].split(' ').forEach(function (code) {
    LANGUAGE_NAMES[code] = entry[0];
  });
});

function langName(code) {
  return LANGUAGE_NAMES[code] || (code ? code.toUpperCase() : 'Unknown');
}

/* ---------- from a subtitle file to cues ---------- */
var TIMING = /(?:(\d+):)?(\d+):(\d+)[,.](\d+)\s*-->\s*(?:(\d+):)?(\d+):(\d+)[,.](\d+)/;

function seconds(hours, minutes, secs, millis) {
  return (Number(hours) || 0) * 3600 + Number(minutes) * 60 + Number(secs) + Number(millis) / 1000;
}

/* formatting tags and styling go: the player draws plain lines */
function plainText(text) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s+$/, '');
}

/* SRT or WebVTT; WebVTT may leave out the hours. */
function parseSrt(source) {
  var cues = [];
  source
    .replace(/\r/g, '')
    .split(/\n\n+/)
    .forEach(function (block) {
      var lines = block.split('\n');
      var at = -1;
      lines.some(function (line, i) {
        if (line.indexOf('-->') < 0) return false;
        at = i;
        return true;
      });
      var time = at >= 0 && TIMING.exec(lines[at]);
      if (!time) return;
      var text = plainText(lines.slice(at + 1).join('\n'));
      if (text)
        cues.push({
          s: seconds(time[1], time[2], time[3], time[4]),
          e: seconds(time[5], time[6], time[7], time[8]),
          t: text
        });
    });
  return cues;
}

/* ASS and SSA: "Dialogue: layer,0:00:01.50,0:00:03.00,style,name,0,0,0,,text" */
function parseAss(source) {
  var cues = [];
  source
    .replace(/\r/g, '')
    .split('\n')
    .forEach(function (line) {
      var m = /^Dialogue:\s*[^,]*,(\d+):(\d+):(\d+)\.(\d+),(\d+):(\d+):(\d+)\.(\d+),(?:[^,]*,){6}(.*)$/.exec(
        line
      );
      if (!m) return;
      var text = plainText(m[9].replace(/\\[Nn]/g, '\n').replace(/\\h/g, ' '));
      /* hundredths of a second */
      if (text)
        cues.push({
          s: seconds(m[1], m[2], m[3], m[4] + '0'),
          e: seconds(m[5], m[6], m[7], m[8] + '0'),
          t: text
        });
    });
  return cues.sort(function (a, b) {
    return a.s - b.s;
  });
}

function parseCues(text) {
  return /^\s*\[Script Info\]|^Dialogue:/m.test(text) ? parseAss(text) : parseSrt(text);
}

/* Bytes as text: gzip is unpacked, and what is not valid UTF-8 is read as Latin-1, as older
   Portuguese and Spanish subtitles are (Windows-1252). */
function subtitleText(buf) {
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      buf = zlib.gunzipSync(buf);
    } catch (e) {}
  }
  var text = buf.toString('utf8');
  return text.indexOf('�') < 0 ? text : buf.toString('binary');
}

/* A streaming server on another computer converts any format, so it is asked first; the file
   itself is read when there is none, or when it did not answer. */
function subtitleCues(u, cb) {
  if (!/^https?:\/\//i.test(u)) return cb([]);
  function readFile() {
    fetchUrl(u, function (buf) {
      cb(buf ? parseCues(subtitleText(buf)) : []);
    });
  }
  if (!remoteAddress()) return readFile();
  fetchUrl(remoteAddress() + '/subtitles.vtt?from=' + encodeURIComponent(u), function (buf) {
    var cues = buf ? parseSrt(buf.toString('utf8')) : [];
    if (cues.length) cb(cues);
    else readFile();
  });
}

/* ---------- the text tracks inside a video ---------- */
var IMAGE_CODECS = ['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvb_subtitle', 'xsub', 'dvb_teletext'];

/* n is FFmpeg's 0:s:n, counting every subtitle track; ti counts only text tracks, as the TV's
   textTracks does. A probe that ran out of time says so, so the player can offer to try again. */
function embTracks(u, res) {
  if (!u) return sendJson(res, { tracks: [] });
  probeStreams(u, function (probe) {
    if (probe.err) return sendJson(res, { tracks: [], err: probe.err, timeout: !!probe.timedOut });
    var tracks = [];
    probe.streams
      .filter(function (stream) {
        return stream.codec_type === 'subtitle';
      })
      .forEach(function (stream, n) {
        if (IMAGE_CODECS.indexOf(stream.codec_name || '') >= 0) return;
        var tags = stream.tags || {};
        var lang = (tags.language || '').toLowerCase();
        var name = langName(lang);
        tracks.push({
          n: n,
          ti: tracks.length,
          lang: lang,
          name: tags.title ? name + ' — ' + tags.title : name
        });
      });
    sendJson(res, { tracks: tracks, err: '' });
  });
}

/* ---------- reading a track out, while the film plays ----------
   Asking for small windows made FFmpeg seek over the network each time, and they came back cut
   short. One FFmpeg reading from the playhead to the end is about 9 times faster than the film
   on these TVs, so that is what runs: the player polls for what is new, and a track read from
   the very start is kept on storage so a file only has to be read once. */
var STORED_FOLDER = path.join(DIR, 'subcache');
var STORED_MAX_FILES = 40;
var STORED_MAX_BYTES = 24 * 1024 * 1024;
var LEAD_IN_SECONDS = 30;
var FAR_AHEAD_SECONDS = 300;
var ABANDONED_AFTER_MS = 90000;

try {
  fs.mkdirSync(STORED_FOLDER);
} catch (e) {}

function trackKey(q) {
  /* a torrent's address ends in its file number: what tells two releases apart is the hash */
  var torrent = /\/([0-9a-f]{40})\/(\d+)/i.exec(String(q.u || ''));
  var fileName = torrent
    ? torrent[1].toLowerCase() + '/' + torrent[2]
    : String(q.u || '')
        .split('/')
        .pop()
        .slice(0, 48);
  return crypto
    .createHash('sha1')
    .update([q.id || '', q.vid || '', q.n || 0, fileName].join('|'))
    .digest('hex');
}

function storedPath(key) {
  return path.join(STORED_FOLDER, key + '.json');
}

function trimStored() {
  try {
    var files = fs.readdirSync(STORED_FOLDER).map(function (name) {
      var info = fs.statSync(path.join(STORED_FOLDER, name));
      return { name: name, size: info.size || 0, at: info.mtime.getTime() };
    });
    files.sort(function (a, b) {
      return a.at - b.at;
    });
    var total = files.reduce(function (sum, file) {
      return sum + file.size;
    }, 0);
    while (files.length && (files.length > STORED_MAX_FILES || total > STORED_MAX_BYTES)) {
      var oldest = files.shift();
      fs.unlinkSync(path.join(STORED_FOLDER, oldest.name));
      total -= oldest.size;
    }
  } catch (e) {}
}

/* one at a time: the TV has little memory */
var reading = null;

function stopWorker(job) {
  try {
    if (job.worker) job.worker.kill('SIGKILL');
  } catch (e) {}
}

function isCurrent(job, worker) {
  return reading === job && job.worker === worker;
}

function addCues(job, text) {
  parseSrt(text).forEach(function (cue) {
    /* reading again after a rewind passes over lines it already has */
    var seenKey = cue.s + '|' + cue.t;
    if (job.seen[seenKey]) return;
    job.seen[seenKey] = true;
    job.cues.push(cue);
    job.frontier = Math.max(job.frontier, cue.e);
  });
}

function readFrom(job, startAt) {
  job.startedAt = startAt;
  job.pending = '';
  /* -copyts keeps the film's own timestamps: without it, what comes after -ss may count from the
     seek or from the start depending on the file, and the subtitles drift */
  var options = (startAt > 0 ? ['-nostdin', '-ss', String(startAt)] : ['-nostdin']).concat([
    '-i',
    localProxy(job.u),
    '-copyts',
    '-map',
    '0:s:' + job.n,
    '-f',
    'srt',
    'pipe:1'
  ]);
  var worker;
  try {
    worker = spawn(FFMPEG, options);
    lowerPriority(worker, NICE.SUBTITLES);
  } catch (e) {
    job.done = true;
    job.err = 'spawn failed';
    return;
  }
  job.worker = worker;
  worker.stdout.on('data', function (chunk) {
    if (!isCurrent(job, worker)) return;
    job.pending += chunk.toString('utf8');
    /* only blocks that have ended; the rest waits for the next chunk */
    var end = job.pending.lastIndexOf('\n\n');
    if (end < 0) return;
    addCues(job, job.pending.slice(0, end));
    job.pending = job.pending.slice(end + 2);
  });
  worker.stderr.on('data', function () {});
  worker.on('error', function () {
    if (!isCurrent(job, worker)) return;
    job.done = true;
    job.err = 'ffmpeg error';
  });
  worker.on('close', function (code) {
    if (!isCurrent(job, worker)) return;
    addCues(job, job.pending);
    job.pending = '';
    job.worker = null;
    job.done = true;
    if (code !== 0 && !job.cues.length) job.err = 'ffmpeg failed';
    if (code !== 0 || job.startedAt > 5 || !job.cues.length) return;
    try {
      fs.writeFileSync(storedPath(job.key), JSON.stringify({ v: 1, cues: job.cues }));
      trimStored();
    } catch (e) {}
  });
}

function readStored(key) {
  try {
    var stored = JSON.parse(fs.readFileSync(storedPath(key), 'utf8'));
    return stored && stored.cues && stored.cues.length ? stored.cues : null;
  } catch (e) {
    return null;
  }
}

function embStart(q, res) {
  if (!q.u) return sendJson(res, { err: 'no url' });
  var key = trackKey(q);
  var stored = readStored(key);
  if (stored) return sendJson(res, { cached: true, done: true, final: true, cues: stored });
  if (reading && reading.key === key && !reading.err)
    return sendJson(res, { started: true, cues: reading.cues, done: reading.done });
  if (reading) stopWorker(reading);
  var playhead = Math.max(0, Math.floor(parseFloat(q.t || '0') || 0));
  var from = Math.max(0, playhead - LEAD_IN_SECONDS);
  reading = {
    key: key,
    u: q.u,
    n: parseInt(q.n || '0', 10) || 0,
    cues: [],
    seen: {},
    frontier: from,
    startedAt: from,
    done: false,
    err: '',
    polledAt: Date.now(),
    worker: null,
    pending: '',
    rewound: false,
    jumped: false
  };
  readFrom(reading, from);
  sendJson(res, { started: true, cues: [], done: false });
}

function embCues(q, res) {
  var job = reading;
  if (!job || job.key !== trackKey(q)) return sendJson(res, { cues: [], done: true, gone: true });
  var playhead = parseFloat(q.t || '0') || 0;
  job.polledAt = Date.now();
  if (job.startedAt > 5 && playhead > 0 && playhead < job.startedAt - 5 && !job.rewound) {
    /* the viewer went back before where reading began, even if it has reached the end */
    job.rewound = true;
    job.done = false;
    stopWorker(job);
    readFrom(job, 0);
  } else if (!job.done && playhead > job.frontier + FAR_AHEAD_SECONDS && !job.jumped) {
    /* the viewer went far past what has been read */
    job.jumped = true;
    stopWorker(job);
    readFrom(job, Math.max(0, Math.floor(playhead - LEAD_IN_SECONDS)));
  }
  sendJson(res, {
    cues: job.cues.slice(parseInt(q.since || '0', 10) || 0),
    done: job.done,
    /* a read that began later still has to watch for the viewer going back */
    final: job.done && (!!job.err || job.startedAt <= 5),
    err: job.err
  });
}

/* the player left without saying so */
setInterval(function () {
  if (!reading || Date.now() - reading.polledAt <= ABANDONED_AFTER_MS) return;
  stopWorker(reading);
  reading = null;
}, 30000).unref();

module.exports = {
  embCues: embCues,
  embStart: embStart,
  embTracks: embTracks,
  langName: langName,
  parseCues: parseCues,
  parseSrt: parseSrt,
  subtitleCues: subtitleCues,
  subtitleText: subtitleText
};
