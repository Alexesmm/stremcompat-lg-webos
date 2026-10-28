// External subtitles and embedded-track extraction with ffmpeg.

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawn;
var { DIR, FFMPEG, FFPROBE } = require('./config');
var { sendJson } = require('./http-util');
var { localProxy } = require('./proxy');
var { NICE, lowerPriority } = require('./priority');

var LANGS = {
  eng: 'English',
  spa: 'Spanish',
  fre: 'French',
  fra: 'French',
  ger: 'German',
  deu: 'German',
  ita: 'Italian',
  por: 'Portuguese',
  rus: 'Russian',
  ara: 'Arabic',
  dut: 'Dutch',
  nld: 'Dutch',
  pol: 'Polish',
  tur: 'Turkish',
  swe: 'Swedish',
  rum: 'Romanian',
  ron: 'Romanian',
  gre: 'Greek',
  heb: 'Hebrew',
  hin: 'Hindi',
  kor: 'Korean',
  jpn: 'Japanese',
  chi: 'Chinese',
  zho: 'Chinese',
  cze: 'Czech',
  dan: 'Danish',
  fin: 'Finnish',
  nor: 'Norwegian',
  hun: 'Hungarian',
  bul: 'Bulgarian',
  ukr: 'Ukrainian',
  srp: 'Serbian',
  hrv: 'Croatian',
  slo: 'Slovak',
  slv: 'Slovenian',
  spl: 'Spanish (LA)',
  pob: 'Portuguese (BR)'
};

function langName(l) {
  return LANGS[l] || (l ? l.toUpperCase() : 'Unknown');
}

function parseSrt(srt) {
  srt = srt.replace(/\r/g, '');
  var blocks = srt.split(/\n\n+/),
    cues = [];
  for (var b = 0; b < blocks.length; b++) {
    var lines = blocks[b].split('\n'),
      tc = -1;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf('-->') >= 0) {
        tc = i;
        break;
      }
    }
    if (tc < 0) continue;
    var m = lines[tc].match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) continue;
    var s = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
    var e = +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000;
    var txt = lines
      .slice(tc + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\{[^}]*\}/g, '');
    if (txt) cues.push({ s: s, e: e, t: txt });
  }
  return cues;
}

var IMG_SUB = { hdmv_pgs_subtitle: 1, dvd_subtitle: 1, dvb_subtitle: 1, xsub: 1, dvb_teletext: 1 };

function embTracks(u, res) {
  if (!u) return sendJson(res, { tracks: [] });
  var args = [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_entries',
    'stream=index,codec_name:stream_tags=language,title',
    '-select_streams',
    's',
    localProxy(u)
  ];
  var out = [],
    err = [],
    done = false,
    pr;
  function finish() {
    if (done) return;
    done = true;
    clearTimeout(to);
    var tracks = [],
      errStr = '';
    try {
      var j = JSON.parse(Buffer.concat(out).toString('utf8')),
        ss = j.streams || [],
        ti = 0;
      for (var i = 0; i < ss.length; i++) {
        if (IMG_SUB[ss[i].codec_name || '']) continue; // image subs can't render as text
        var tg = ss[i].tags || {},
          lang = (tg.language || '').toLowerCase();
        var nm = langName(lang);
        if (tg.title) nm += ' — ' + tg.title;
        tracks.push({ n: i, ti: ti, name: nm }); // n=ffmpeg 0:s:n index; ti=index among TEXT tracks (native textTracks[])
        ti++;
      }
    } catch (e) {
      errStr = (Buffer.concat(err).toString('utf8').split('\n')[0] || 'probe failed').slice(0, 160);
    }
    console.log('[embtracks] found=' + tracks.length + (errStr ? ' err=' + errStr : ''));
    sendJson(res, { tracks: tracks, err: tracks.length ? '' : errStr });
  }
  try {
    pr = spawn(FFPROBE, args);
    lowerPriority(pr, NICE.INTERACTIVE);
  } catch (e) {
    return sendJson(res, { tracks: [], err: 'ffprobe missing' });
  }
  var to = setTimeout(function () {
    try {
      pr.kill();
    } catch (e) {}
    finish();
  }, 20000);
  pr.stdout.on('data', function (d) {
    out.push(d);
  });
  pr.stderr.on('data', function (d) {
    err.push(d);
  });
  pr.on('error', function (e) {
    if (done) return;
    done = true;
    clearTimeout(to);
    sendJson(res, { tracks: [], err: 'ffprobe error: ' + ((e && e.code) || e) });
  });
  pr.on('close', finish);
}

// ---- progressive embedded-subtitle extraction ----
// The windowed approach failed: every window re-seeked the container over the network
// and got truncated. But a straight sequential read measured ~9x realtime on this TV.
// So: ONE ffmpeg reading from the playhead to EOF, cues parsed as they stream out,
// the player polls for increments, and finished tracks are cached on disk so a file
// is only ever extracted once.
var SUBCACHE = path.join(DIR, 'subcache');

try {
  fs.mkdirSync(SUBCACHE);
} catch (e) {}

function subKey(q) {
  var tail = String(q.u || '')
    .split('/')
    .pop()
    .slice(0, 48);
  return crypto
    .createHash('sha1')
    .update((q.id || '') + '|' + (q.vid || '') + '|' + (q.n || 0) + '|' + tail)
    .digest('hex');
}

function pruneSubcache() {
  try {
    var fl = fs.readdirSync(SUBCACHE);
    var st = [],
      total = 0,
      maxBytes = 24 * 1024 * 1024;
    for (var i = 0; i < fl.length; i++) {
      try {
        var si = fs.statSync(path.join(SUBCACHE, fl[i]));
        st.push({ f: fl[i], m: si.mtimeMs, s: si.size || 0 });
        total += si.size || 0;
      } catch (e) {}
    }
    st.sort(function (a, b) {
      return a.m - b.m;
    });
    while (st.length > 40 || total > maxBytes) {
      var old = st.shift();
      if (!old) break;
      try {
        fs.unlinkSync(path.join(SUBCACHE, old.f));
        total -= old.s;
      } catch (e) {}
    }
  } catch (e) {}
}

var embJob = null;

// single slot (low-RAM TV)
function killJob() {
  if (!embJob) return;
  try {
    if (embJob.pr) embJob.pr.kill('SIGKILL');
  } catch (e) {}
  embJob = null;
}

function spawnJobProc(job, fromT) {
  job.baseT = fromT;
  job.tail = '';
  job.startedAt = Date.now();
  var args = ['-nostdin'];
  if (fromT > 0) args.push('-ss', String(fromT));
  // -copyts: keep ORIGINAL absolute timestamps. Without it, -ss output may be seek-relative
  // or absolute depending on the file, which silently desynced mid-file extractions.
  args.push('-i', localProxy(job.u), '-copyts', '-map', '0:s:' + job.n, '-f', 'srt', 'pipe:1');
  var pr;
  try {
    pr = spawn(FFMPEG, args);
    lowerPriority(pr, NICE.SUBTITLES);
  } catch (e) {
    job.done = true;
    job.err = 'spawn failed';
    return;
  }
  job.pr = pr;
  pr.stdout.on('data', function (d) {
    if (embJob !== job || job.pr !== pr) return;
    job.tail += d.toString('utf8');
    // parse only COMPLETE srt blocks; keep the trailing partial block for the next chunk
    var cut = job.tail.lastIndexOf('\n\n');
    if (cut < 0) return;
    var ready = job.tail.slice(0, cut);
    job.tail = job.tail.slice(cut + 2);
    var cues = parseSrt(ready);
    for (var i = 0; i < cues.length; i++) {
      // -copyts => timestamps are already absolute; no offset arithmetic
      job.cues.push(cues[i]);
      if (cues[i].e > job.frontier) job.frontier = cues[i].e;
    }
  });
  pr.stderr.on('data', function (d) {
    job.errTail = (job.errTail + d.toString('utf8')).slice(-400);
  });
  pr.on('error', function () {
    if (embJob === job && job.pr === pr) {
      job.done = true;
      job.err = 'ffmpeg error';
    }
  });
  pr.on('close', function (code) {
    if (embJob !== job || job.pr !== pr) return;
    var last = parseSrt(job.tail); // flush the final block (timestamps already absolute via -copyts)
    for (var i = 0; i < last.length; i++) job.cues.push(last[i]);
    job.tail = '';
    job.pr = null;
    job.done = true;
    var secs = ((Date.now() - job.startedAt) / 1000) | 0;
    console.log(
      '[embjob] done key=' +
        job.key.slice(0, 8) +
        ' cues=' +
        job.cues.length +
        ' base=' +
        job.baseT +
        ' took=' +
        secs +
        's code=' +
        code
    );
    // cache only full-coverage runs (started at the very beginning) that yielded cues
    if (code === 0 && job.baseT <= 5 && job.cues.length) {
      try {
        fs.writeFileSync(path.join(SUBCACHE, job.key + '.json'), JSON.stringify({ v: 1, cues: job.cues }));
        pruneSubcache();
      } catch (e) {}
    }
  });
}

function embStart(q, res) {
  if (!q.u) return sendJson(res, { err: 'no url' });
  var key = subKey(q),
    n = parseInt(q.n || '0', 10) || 0,
    t = Math.max(0, Math.floor(parseFloat(q.t || '0') || 0));
  // instant path: already extracted this track before
  try {
    var cachedRaw = fs.readFileSync(path.join(SUBCACHE, key + '.json'), 'utf8');
    var cached = JSON.parse(cachedRaw);
    if (cached && cached.cues && cached.cues.length) {
      console.log('[embjob] cache hit key=' + key.slice(0, 8) + ' cues=' + cached.cues.length);
      return sendJson(res, { cached: true, done: true, cues: cached.cues });
    }
  } catch (e) {}
  if (embJob && embJob.key === key && !embJob.err) {
    return sendJson(res, { started: true, cues: embJob.cues, done: embJob.done });
  }
  killJob();
  // start slightly behind the playhead; if they later rewind past this, we restart from 0
  var from = Math.max(0, t - 30);
  embJob = {
    key: key,
    u: q.u,
    n: n,
    cues: [],
    frontier: from,
    baseT: from,
    done: false,
    err: '',
    errTail: '',
    lastPoll: Date.now(),
    pr: null,
    tail: ''
  };
  spawnJobProc(embJob, from);
  console.log('[embjob] start key=' + key.slice(0, 8) + ' n=' + n + ' from=' + from);
  sendJson(res, { started: true, cues: [], done: false });
}

function embCues(q, res) {
  var key = subKey(q),
    since = parseInt(q.since || '0', 10) || 0,
    t = parseFloat(q.t || '0') || 0;
  if (!embJob || embJob.key !== key) return sendJson(res, { cues: [], done: true, gone: true });
  var job = embJob;
  job.lastPoll = Date.now();
  // user rewound before our start point -> restart from 0 (keeps already-parsed cues)
  if (!job.done && job.baseT > 5 && t > 0 && t < job.baseT - 5 && !job.restarted0) {
    job.restarted0 = true;
    try {
      if (job.pr) job.pr.kill('SIGKILL');
    } catch (e) {}
    console.log('[embjob] rewind -> restart from 0');
    spawnJobProc(job, 0);
  }
  // user jumped far past the extraction frontier -> hop the reader forward
  else if (!job.done && t > job.frontier + 300 && !job.hopped) {
    job.hopped = true; // one hop per job keeps it simple; cache is skipped anyway once baseT>5
    try {
      if (job.pr) job.pr.kill('SIGKILL');
    } catch (e) {}
    console.log('[embjob] far seek -> hop to ' + ((t - 30) | 0));
    spawnJobProc(job, Math.max(0, Math.floor(t - 30)));
  }
  sendJson(res, { cues: job.cues.slice(since), done: job.done, err: job.err });
}

// reap the job if the player stopped polling (left playback)
setInterval(function () {
  if (embJob && Date.now() - embJob.lastPoll > 90000) {
    console.log('[embjob] idle reap');
    killJob();
  }
}, 30000);

module.exports = {
  embCues: embCues,
  embStart: embStart,
  embTracks: embTracks,
  langName: langName,
  parseSrt: parseSrt
};
