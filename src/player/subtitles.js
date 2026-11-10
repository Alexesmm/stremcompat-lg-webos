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
/* how far from the bottom of the screen, in percent, and how solid (the player's Style menu) */
var subBottom = parseInt(lsGet('subsBottom', '8'), 10) || 8,
  subOpacity = parseFloat(lsGet('subsOpacity', '1')) || 1;
subEl.style.bottom = subBottom + '%';
var SEEKSTEP = parseInt(lsGet('seekStep', '10'), 10) || 10;
var EMBMODE = lsGet('embSubsMode', 'server');
// "server"=our ffmpeg extraction, "native"=TV textTracks
var PREVIEW_ON = HAS_MEDIA_TOOLS && lsGet('scrubPreview', 'false') === 'true';
// the interface language's subtitles when the setting was NEVER configured; a stored "" = user chose Off
var rawSub = lsGet('subsLang', null);
if (rawSub == null) rawSub = lsGet('subtitles', null);
var WANTSUB = (rawSub == null ? defaultMediaLanguage() : rawSub).toLowerCase();
var WANTSUB2 = lsGet('subsLang2', '');
var AUDIO_AUTO = lsGet('enableDefaultAudioTrack', 'false') === 'true';
var WANTAUD = AUDIO_AUTO ? (lsGet('defaultAudioTrack', defaultMediaLanguage()) || '').toLowerCase() : '';
var WANTAUD2 = AUDIO_AUTO ? lsGet('defaultAudioTrack2', '') : '';
/* TVs and addons name a language in two or three letters, sometimes with a region */
var LANG_CODES = {
  pt: 'por',
  pob: 'por',
  en: 'eng',
  es: 'spa',
  fr: 'fre',
  fra: 'fre',
  it: 'ita',
  de: 'ger',
  deu: 'ger',
  ar: 'ara',
  ru: 'rus',
  tr: 'tur',
  pl: 'pol',
  nl: 'dut',
  nld: 'dut',
  sv: 'swe',
  he: 'heb',
  hi: 'hin',
  ja: 'jpn',
  ko: 'kor',
  zh: 'chi',
  zho: 'chi',
  spl: 'spa',
  ro: 'rum',
  ron: 'rum',
  el: 'gre',
  ell: 'gre',
  cs: 'cze',
  ces: 'cze',
  da: 'dan',
  fi: 'fin',
  no: 'nor',
  nb: 'nor',
  nob: 'nor',
  hu: 'hun',
  bg: 'bul',
  uk: 'ukr',
  sr: 'srp',
  hr: 'hrv',
  sk: 'slo',
  slk: 'slo',
  sl: 'slv'
};
function languageCode(lang) {
  var base = (lang || '').toLowerCase().split(/[-_]/)[0];
  return LANG_CODES[base] || base;
}
function sameLanguage(a, b) {
  a = languageCode(a);
  return !!a && a === languageCode(b);
}
/* Choices remembered per title (the series, not the episode): the audio language, the
   subtitle language or Off, whether it was inside the file, and the subtitle delay. They
   win over the Settings defaults, so an anime watched in Japanese with Portuguese subtitles
   stays that way. */
var TITLE_PREF_KEY = 'tvtitle_' + ID;
var WANT_EMB = '',
  WANT_SUB_URL = '',
  WANT_SUB_SRC = '';
function titlePref() {
  try {
    return JSON.parse(localStorage.getItem(TITLE_PREF_KEY) || 'null') || {};
  } catch (e) {
    return {};
  }
}
function saveTitlePref(field, value) {
  var fields = {};
  fields[field] = value;
  saveTitlePrefs(fields);
}
function saveTitlePrefs(fields) {
  if (!ID || NO_HISTORY) return;
  var p = titlePref();
  for (var field in fields) p[field] = fields[field];
  try {
    localStorage.setItem(TITLE_PREF_KEY, JSON.stringify(p));
  } catch (e) {}
}
(function () {
  var p = titlePref();
  if (p.aud) WANTAUD = p.aud;
  if (p.sub) WANTSUB = p.sub === 'off' ? '' : p.sub;
  if (p.embLang) WANT_EMB = p.embLang;
  WANT_SUB_URL = p.subUrl || '';
  WANT_SUB_SRC = p.subSrc || '';
  if (typeof p.delay === 'number') subDelay = p.delay;
})();
var embTracks = null,
  embTracksLoading = false,
  embTracksLoaded = false,
  embErr = '',
  embTimeout = false,
  embReopenArmed = false,
  embN = -1,
  embFirst = false,
  embFailed = false;
var autoSubDone = false;
function subOfLanguage(lang) {
  for (var i = 0; i < extSubs.length; i++) if (sameLanguage(extSubs[i].lang, lang)) return extSubs[i];
  return null;
}
/* The subtitle chosen for this title: the same one in this episode, or the same addon's in
   that language in another. */
function chosenSub() {
  var i;
  for (i = 0; WANT_SUB_URL && i < extSubs.length; i++) if (extSubs[i].u === WANT_SUB_URL) return extSubs[i];
  for (i = 0; WANT_SUB_SRC && i < extSubs.length; i++)
    if (extSubs[i].src === WANT_SUB_SRC && sameLanguage(extSubs[i].lang, WANTSUB)) return extSubs[i];
  return null;
}
function autoSub() {
  if (autoSubDone || curSub !== 'off' || !WANTSUB || WANT_EMB) return;
  var found = chosenSub() || subOfLanguage(WANTSUB) || subOfLanguage(WANTSUB2);
  if (!found) return;
  autoSubDone = true;
  setExtSub(found.u);
  showToast(P.subtitles + ': ' + found.name);
}
/* A subtitle from inside the file, chosen before for this title. Reading the tracks costs
   the TV some effort, so only the titles that need it do so, once the film is playing. */
function autoEmb() {
  if (!WANT_EMB) return;
  var want = WANT_EMB;
  WANT_EMB = '';
  if (curSub !== 'off') return;
  for (var i = 0; embTracks && i < embTracks.length; i++) {
    if (sameLanguage(embTracks[i].lang, want)) {
      setEmbSub(embTracks[i].n, embTracks[i].ti);
      showToast(P.subtitles + ': ' + embTracks[i].name);
      return;
    }
  }
  autoSub();
}
v.addEventListener('playing', function () {
  if (WANT_EMB) ensureEmbTracks();
});
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
var extSubsLoading = false;
function loadExtSubs() {
  extSubsLoading = true;
  var ref = (location.search.match(/[?&]ref=([^&]+)/) || [])[1] || '';
  try {
    var x = new XMLHttpRequest();
    x.open('POST', '/subs', true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      extSubsLoading = false;
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
  } catch (e) {
    extSubsLoading = false;
  }
}
if (TYPE && VID) loadExtSubs();
// honour the Settings default audio language: enable the matching embedded audio track
var autoAudDone = false;
function audioOfLanguage(ts, lang) {
  for (var i = 0; i < ts.length; i++) if (sameLanguage(ts[i].language, lang)) return i;
  return -1;
}
function autoAudio() {
  if (autoAudDone || !WANTAUD) return;
  try {
    var ts = v.audioTracks;
    if (!ts || !ts.length) return;
    var found = audioOfLanguage(ts, WANTAUD);
    if (found < 0) found = audioOfLanguage(ts, WANTAUD2);
    if (found < 0) return;
    autoAudDone = true;
    for (var j = 0; j < ts.length; j++) ts[j].enabled = j === found;
  } catch (e) {}
}
v.addEventListener('loadeddata', autoAudio);
v.addEventListener('canplay', autoAudio);
// On this CPU, ffprobe during startup makes the remote stutter. Probe only when
// the user actually opens the subtitle menu.
function ensureEmbTracks() {
  /* a player that decodes the file itself already knows its tracks */
  if (v.textTrackList) {
    embTracks = v.textTrackList();
    autoEmb();
    return;
  }
  if (embTracksLoaded || embTracksLoading) return;
  embTracksLoading = true;
  xhr('/subtitle-tracks?u=' + encodeURIComponent(URL), function (j) {
    embTracksLoading = false;
    embTracksLoaded = true;
    embTracks = (j && j.tracks) || [];
    embErr = (j && j.err) || '';
    embTimeout = !!(j && j.timeout);
    /* a failed read is asked again the next time the menu opens (or on Try again) */
    if (embErr || !j) embTracksLoaded = false;
    autoEmb();
  });
}
function setExtSub(u) {
  if (v.selectTextTrack) v.selectTextTrack(-1);
  curSub = 'ext:' + u;
  trackChosenAt = Date.now();
  embN = -1;
  cues = null;
  subEl.textContent = '';
  for (var i = 0; i < v.textTracks.length; i++) {
    try {
      v.textTracks[i].mode = 'disabled';
    } catch (e) {}
  }
  xhr('/sub?u=' + encodeURIComponent(u), function (j) {
    if (curSub !== 'ext:' + u) return;
    cues = (j && j.cues) || [];
    releaseSubHold();
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
var embPolling = false;
function pollEmbCues() {
  if (embN < 0 || embPolling) return;
  var want = embN;
  embPolling = true;
  xhr(
    '/subtitle-cues?' + embQS() + '&since=' + (cues ? cues.length : 0) + '&t=' + (v.currentTime | 0),
    function (j) {
      embPolling = false;
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
          releaseSubHold();
        }
      }
      if (j.err && !cues.length) {
        embFailed = true;
        showToast(P.subtitleFailed);
        releaseSubHold();
      }
      /* nothing more will come */
      if (j.final) embN = -1;
    }
  );
}
// TRY NATIVE: the TV already decodes the MKV; ask its pipeline to render this text track
// (mode="showing"). Far better than demuxing over the network if the TV exposes the tracks.
/* Lines from the player itself arrive one at a time, with how long each one lasts. */
function setPlayerTextTrack(n) {
  curSub = 'emb:' + n;
  trackChosenAt = Date.now();
  embN = -1;
  cues = [];
  embFirst = true;
  embFailed = false;
  subEl.textContent = '';
  subEl._t = null;
  v.selectTextTrack(n, function (ms, text) {
    cues = text ? [{ s: 0, e: v.currentTime + ms / 1000, t: text }] : [];
    renderSub();
  });
}
function setEmbSub(n, ti) {
  if (v.selectTextTrack) return setPlayerTextTrack(n);
  curSub = 'emb:' + n;
  trackChosenAt = Date.now();
  embN = n;
  cues = [];
  embFirst = false;
  embFailed = false;
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
      embFirst = true;
      showToast(P.nativeSubs);
      return;
    }
    showToast(P.noNative);
  }
  xhr('/subtitle-start?' + embQS() + '&t=' + (v.currentTime | 0), function (j) {
    if (embN !== n || !j) return;
    if (j.cues && j.cues.length) {
      cues = j.cues;
      subEl._t = null;
      embFirst = true;
      /* a track kept on storage is complete: nothing is being read, so there is nothing to poll */
      if (j.final) embN = -1;
      showToast(j.cached ? P.loaded : P.ready);
      releaseSubHold();
    } else if (j.started) {
      showToast(P.preparingSubs);
    } else if (j.err) {
      embFailed = true;
      showToast(P.noEmbedded);
      releaseSubHold();
    }
  });
}
/* While something the viewer asked for is still loading (the track list, the subtitle
   list, a chosen subtitle or audio track), the controls stay on screen instead of hiding
   after the usual few seconds (controls.js hideControls). The wait has a limit so a track
   that never loads cannot keep them up forever. */
var BUSY_LIMIT_MS = 45000,
  trackChosenAt = 0,
  audioChosenAt = 0;
function playerBusy() {
  var now = Date.now();
  if (mode === 'menu' && (embTracksLoading || extSubsLoading)) return true;
  if (now - trackChosenAt < BUSY_LIMIT_MS) {
    if (curSub.indexOf('ext:') === 0 && cues === null) return true;
    if (curSub.indexOf('emb:') === 0 && !embFirst && !embFailed) return true;
  }
  return now - audioChosenAt < 15000 && v.readyState < 3;
}
function subsOff() {
  if (v.selectTextTrack) v.selectTextTrack(-1);
  curSub = 'off';
  embN = -1;
  cues = null;
  subEl.textContent = '';
  releaseSubHold();
}
/* A subtitle chosen in the menu should start with the line being spoken, so playback waits
   for it, ten seconds at most, and carries on if it is late. Only a video that was playing
   is held, and any play or pause key takes over (setPlaying). */
var SUB_HOLD_LIMIT_MS = 10000,
  subHolding = false,
  subHoldLimit = null,
  subHoldPoll = null;
function subtitleLoading() {
  if (curSub.indexOf('ext:') === 0) return cues === null;
  return curSub.indexOf('emb:') === 0 && !embFirst && !embFailed;
}
function holdForSubtitle() {
  if (subHolding || v.paused || v.ended || load.style.display !== 'none' || !subtitleLoading()) return;
  subHolding = true;
  try {
    v.pause();
  } catch (e) {}
  showToast(P.loadingSubtitle, SUB_HOLD_LIMIT_MS);
  subHoldLimit = setTimeout(function () {
    showToast(P.preparingSubs);
    releaseSubHold();
  }, SUB_HOLD_LIMIT_MS);
  /* a track already extracted answers at once: no need to wait for the slow poll */
  if (embN >= 0) subHoldPoll = setInterval(pollEmbCues, 1000);
}
function dropSubHold() {
  subHolding = false;
  clearTimeout(subHoldLimit);
  clearInterval(subHoldPoll);
}
function releaseSubHold() {
  if (!subHolding) return;
  dropSubHold();
  try {
    var r = v.play();
    if (r && r.catch) r.catch(function () {});
  } catch (e) {}
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
  return label + (on ? ' — ' + P.selected : '');
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
  return 'font-size:' + subSize + 'px;color:' + subColor + ';opacity:' + subOpacity + ';' + sh + bg;
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
