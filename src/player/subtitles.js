// Subtitle and audio preferences, external and embedded subtitle tracks and the overlay.
// ---- external subtitles (English first) ----
var extSubs = [],
  cues = null,
  subSize = 38,
  subColor = '#fff',
  subOutline = '#000000',
  subBgOp = 0,
  curSub = 'off',
  subDelay = 0,
  subView = 'root',
  extLang = '';
// ---- pull the interface Settings (same-origin localStorage) so they drive OUR player ----
function lsGet(k, d) {
  try {
    var v = localStorage.getItem(k);
    return v == null ? d : v;
  } catch (e) {
    return d;
  }
}
var SIZEPCT = { '0': 72, '1': 80, '2': 100, '3': 120, '4': 140, '5': 160, '6': 180 };
subSize = Math.round(38 * ((SIZEPCT[lsGet('subtitleSize', '2')] || 100) / 100));
subColor = lsGet('subsColor', '#ffffff');
subOutline = lsGet('subsOutlineColor', '#000000');
subBgOp = parseFloat(lsGet('subsBgStyle', '0')) || 0;
var SEEKSTEP = parseInt(lsGet('seekStep', '10'), 10) || 10;
var EMBMODE = lsGet('embSubsMode', 'server');
// "server"=our ffmpeg extraction, "native"=TV textTracks
var PREVIEW_ON = lsGet('scrubPreview', 'false') === 'true';
// default to English auto-subs when the setting was NEVER configured; a stored "" = user chose Off
var rawSub = lsGet('subsLang', null);
if (rawSub == null) rawSub = lsGet('subtitles', null);
var WANTSUB = (rawSub == null ? 'eng' : rawSub).toLowerCase();
var WANTAUD =
  lsGet('enableDefaultAudioTrack', 'false') === 'true'
    ? (lsGet('defaultAudioTrack', '') || '').toLowerCase()
    : '';
/* Choices remembered per title (the series, not the episode): the audio language, the
   subtitle language or Off, and the subtitle delay. They win over the Settings defaults,
   so an anime watched in Japanese with Portuguese subtitles stays that way. */
var TITLE_PREF_KEY = 'tvtitle_' + ID;
function titlePref() {
  try {
    return JSON.parse(localStorage.getItem(TITLE_PREF_KEY) || 'null') || {};
  } catch (e) {
    return {};
  }
}
function saveTitlePref(field, value) {
  if (!ID) return;
  var p = titlePref();
  p[field] = value;
  try {
    localStorage.setItem(TITLE_PREF_KEY, JSON.stringify(p));
  } catch (e) {}
}
(function () {
  var p = titlePref();
  if (p.aud) WANTAUD = p.aud;
  if (p.sub) WANTSUB = p.sub === 'off' ? '' : p.sub;
  if (typeof p.delay === 'number') subDelay = p.delay;
})();
var embTracks = null,
  embTracksLoading = false,
  embTracksLoaded = false,
  embErr = '',
  embTimeout = false,
  embReopenArmed = false,
  embN = -1,
  embFirst = false;
var autoSubDone = false;
function autoSub() {
  if (autoSubDone || curSub !== 'off' || !WANTSUB) return;
  for (var i = 0; i < extSubs.length; i++) {
    if ((extSubs[i].lang || '').toLowerCase() === WANTSUB) {
      autoSubDone = true;
      setExtSub(extSubs[i].u);
      showToast(P.subtitles + ': ' + extSubs[i].name);
      return;
    }
  }
}
/* External subtitles from the account's subtitle addons (same-origin localStorage, as the
   interface keeps them), asked by the local server with this file's name and hash; with
   none installed the server asks the public OpenSubtitles addon. */
function subtitleAddons() {
  var list = [];
  try {
    list = JSON.parse(localStorage.getItem('addons') || '[]') || [];
  } catch (e) {}
  return addonsFor(list, 'subtitles', TYPE, VID);
}
function loadExtSubs() {
  var ref = (location.search.match(/[?&]ref=([^&]+)/) || [])[1] || '';
  try {
    var x = new XMLHttpRequest();
    x.open('POST', '/subs', true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      var j = null;
      try {
        j = JSON.parse(x.responseText);
      } catch (e) {}
      if (j && j.subtitles) {
        extSubs = j.subtitles;
        autoSub();
      }
    };
    x.send(JSON.stringify({ ref: decodeURIComponent(ref), type: TYPE, vid: VID, addons: subtitleAddons() }));
  } catch (e) {}
}
if (TYPE && VID) loadExtSubs();
// honour the Settings default audio language: enable the matching embedded audio track
var autoAudDone = false;
function autoAudio() {
  if (autoAudDone || !WANTAUD) return;
  try {
    var ts = v.audioTracks;
    if (!ts || !ts.length) return;
    for (var i = 0; i < ts.length; i++) {
      var l = (ts[i].language || '').toLowerCase();
      if (l === WANTAUD || l.indexOf(WANTAUD) === 0 || WANTAUD.indexOf(l) === 0) {
        autoAudDone = true;
        for (var j = 0; j < ts.length; j++) ts[j].enabled = j === i;
        return;
      }
    }
  } catch (e) {}
}
v.addEventListener('loadeddata', autoAudio);
v.addEventListener('canplay', autoAudio);
// On this CPU, ffprobe during startup makes the remote stutter. Probe only when
// the user actually opens the subtitle menu.
function ensureEmbTracks() {
  if (embTracksLoaded || embTracksLoading) return;
  embTracksLoading = true;
  xhr('/embtracks?u=' + encodeURIComponent(URL), function (j) {
    embTracksLoading = false;
    embTracksLoaded = true;
    embTracks = (j && j.tracks) || [];
    embErr = (j && j.err) || '';
    embTimeout = !!(j && j.timeout);
    /* a failed read is asked again the next time the menu opens (or on Try again) */
    if (embErr || !j) embTracksLoaded = false;
  });
}
function setExtSub(u) {
  curSub = 'ext:' + u;
  embN = -1;
  cues = null;
  subEl.textContent = '';
  for (var i = 0; i < v.textTracks.length; i++) {
    try {
      v.textTracks[i].mode = 'disabled';
    } catch (e) {}
  }
  xhr('/sub?u=' + encodeURIComponent(u), function (j) {
    cues = (j && j.cues) || [];
  });
}
// embedded: the TV never exposes MKV sub cues to JS (textTracks empty), so the server
// demuxes them with ONE sequential ffmpeg read (~9x realtime) and we poll for new cues
// (append-only) rendered in OUR overlay; finished tracks are disk-cached server-side.
function embQS() {
  return (
    'u=' +
    encodeURIComponent(URL) +
    '&n=' +
    embN +
    '&id=' +
    encodeURIComponent(ID) +
    '&vid=' +
    encodeURIComponent(VID)
  );
}
function pollEmbCues() {
  if (embN < 0) return;
  var want = embN;
  xhr(
    '/embcues?' + embQS() + '&since=' + (cues ? cues.length : 0) + '&t=' + (v.currentTime | 0),
    function (j) {
      if (want !== embN || !j) return;
      if (j.gone) {
        setEmbSub(embN);
        return;
      }
      // server restarted / job reaped -> re-kick
      if (j.cues && j.cues.length) {
        if (!cues) cues = [];
        for (var i = 0; i < j.cues.length; i++) cues.push(j.cues[i]);
        subEl._t = null;
        if (!embFirst) {
          embFirst = true;
          showToast(P.subtitlesReady);
        }
      }
      if (j.err && !cues.length) {
        showToast(P.subtitleFailed);
      }
    }
  );
}
// TRY NATIVE: the TV already decodes the MKV; ask its pipeline to render this text track
// (mode="showing"). Far better than demuxing over the network if the TV exposes the tracks.
function setEmbSub(n, ti) {
  curSub = 'emb:' + n;
  embN = n;
  cues = [];
  embFirst = false;
  subEl.textContent = '';
  // Settings: "native" tries the TV's own text track (usually empty on this TV -> falls back)
  if (EMBMODE === 'native') {
    var ok = false;
    try {
      for (var i = 0; i < v.textTracks.length; i++) v.textTracks[i].mode = 'disabled';
      var tt = v.textTracks[ti || 0];
      if (tt) {
        tt.mode = 'showing';
        ok = true;
      }
    } catch (e) {}
    if (ok) {
      showToast(P.nativeSubs);
      return;
    }
    showToast(P.noNative);
  }
  xhr('/embstart?' + embQS() + '&t=' + (v.currentTime | 0), function (j) {
    if (embN !== n || !j) return;
    if (j.cues && j.cues.length) {
      cues = j.cues;
      subEl._t = null;
      embFirst = true;
      showToast(j.cached ? P.loaded : P.ready);
    } else if (j.started) {
      showToast(P.preparingSubs);
    } else if (j.err) {
      showToast(P.noEmbedded);
    }
  });
}
function subsOff() {
  curSub = 'off';
  embN = -1;
  cues = null;
  subEl.textContent = '';
}
function audioName() {
  try {
    for (var i = 0; i < v.audioTracks.length; i++) {
      var a = v.audioTracks[i];
      if (a.enabled) return a.label || a.language || P.audio + ' ' + (i + 1);
    }
  } catch (e) {}
  return P.defaultAudio;
}
function subtitleName() {
  if (curSub === 'off') return P.off;
  if (curSub.indexOf('emb:') === 0) {
    var n = parseInt(curSub.slice(4), 10);
    if (embTracks)
      for (var i = 0; i < embTracks.length; i++)
        if (embTracks[i].n === n) return embTracks[i].name || P.embedded + ' ' + (i + 1);
    return P.embedded;
  }
  if (curSub.indexOf('ext:') === 0) {
    var u = curSub.slice(4);
    for (var j = 0; j < extSubs.length; j++)
      if (extSubs[j].u === u) return extSubs[j].name || extSubs[j].lang || P.external;
    return P.external;
  }
  return P.off;
}
function selectedLabel(label, on) {
  return label + (on ? '  [' + P.selected + ']' : '');
}
function eh(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function subStyle() {
  var o = subOutline;
  var sh =
    'text-shadow:-2px 0 ' +
    o +
    ',2px 0 ' +
    o +
    ',0 -2px ' +
    o +
    ',0 2px ' +
    o +
    ',-1px -1px ' +
    o +
    ',1px 1px ' +
    o +
    ',0 0 5px ' +
    o +
    ';';
  var bg = subBgOp > 0 ? 'background:rgba(0,0,0,' + subBgOp + ');padding:2px 16px;border-radius:8px;' : '';
  return 'font-size:' + subSize + 'px;color:' + subColor + ';' + sh + bg;
}
/* Cues can arrive out of order (an extraction restarted from 0 appends earlier lines),
   so the first matching cue is found by a full scan. The scan also records when the
   set of active cues next changes, and the result is reused until then: one scan per
   subtitle boundary instead of one per timeupdate. */
var cueMemo = { list: null, len: 0, from: 0, until: -1, txt: '' };
function cueText(t) {
  var m = cueMemo;
  if (m.list === cues && m.len === cues.length && t >= m.from && t < m.until) return m.txt;
  var txt = '',
    found = false,
    until = Infinity;
  for (var i = 0; i < cues.length; i++) {
    var c = cues[i];
    if (t >= c.s && t <= c.e) {
      if (!found) {
        found = true;
        txt = c.t;
      }
      if (c.e < until) until = c.e;
    } else if (c.s > t && c.s < until) until = c.s;
  }
  m.list = cues;
  m.len = cues.length;
  m.from = t;
  m.until = until;
  m.txt = txt;
  return txt;
}
function renderSub() {
  if (curSub === 'off') return;
  var txt = '';
  if (cues && cues.length) txt = cueText(v.currentTime - subDelay);
  if (subEl._t !== txt) {
    subEl._t = txt;
    subEl.textContent = '';
    if (txt) {
      var sp = document.createElement('span');
      sp.style.cssText = subStyle() + 'white-space:pre-line;';
      sp.textContent = txt;
      subEl.appendChild(sp);
    }
  }
}
