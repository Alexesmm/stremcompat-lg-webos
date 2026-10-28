// Player strings (en-US, pt-BR), chosen from the interface language.
var PBR = false;
try {
  PBR = localStorage.getItem('uiLanguage') === 'pt-BR';
} catch (e) {}
var SE = PBR ? SEPT : SEEN;
var P = PBR
  ? {
      paused: 'Pausado',
      nextEpisode: 'Próximo episódio',
      playNext: 'Reproduzir próximo',
      dismissHint: 'Cima: selecionar · Voltar: fechar',
      liked: 'Gostou?',
      similar: 'Ver algo parecido',
      findSimilar: 'Encontrar parecidos',
      playbackError: 'Erro de reprodução',
      retrying: 'Tentando iniciar a fonte novamente…',
      resuming: 'Continuando de ',
      nextLoading: 'Próximo episódio…',
      subtitlesReady: 'Legendas prontas',
      subtitleFailed: 'Falha ao extrair legendas',
      nativeSubs: 'Legendas nativas ativadas',
      noNative: 'Faixa nativa indisponível — extraindo…',
      preparingSubs: 'Preparando legendas…',
      noEmbedded: 'Nenhuma legenda incorporada',
      defaultAudio: 'Padrão',
      off: 'Desativadas',
      embedded: 'Incorporadas',
      external: 'Externas',
      selected: 'Selecionada',
      settings: 'Ajustes',
      audio: 'Áudio',
      subtitles: 'Legendas',
      none: 'Nenhuma',
      readingTracks: 'Lendo faixas…',
      noneInFile: 'Nenhuma neste arquivo',
      style: 'Estilo',
      delay: 'Atraso',
      later: 'Mais tarde (+0,5s)',
      earlier: 'Mais cedo (-0,5s)',
      reset: 'Redefinir',
      bigger: 'Aumentar texto',
      smaller: 'Diminuir texto',
      colour: 'Cor',
      background: 'Fundo',
      on: 'Ativado',
      white: 'Branco',
      yellow: 'Amarelo',
      couldNotResume: 'Não foi possível continuar',
      controlUnavailable: 'Controle de reprodução indisponível',
      inactive: 'Reprodução pausada enquanto a TV estava inativa',
      restoring: 'Restaurando o serviço local…',
      restoreFailed: 'Não foi possível restaurar o serviço local',
      ready: 'Prontas',
      loaded: 'Legendas carregadas',
      extracting: 'extraindo',
      language: 'idioma'
    }
  : {
      paused: 'Paused',
      nextEpisode: 'Next episode',
      playNext: 'Play next',
      dismissHint: 'Up: select · Back: dismiss',
      liked: 'Liked this?',
      similar: 'Watch something similar',
      findSimilar: 'Find similar',
      playbackError: 'Playback error',
      retrying: 'Retrying this source…',
      resuming: 'Resuming from ',
      nextLoading: 'Next episode…',
      subtitlesReady: 'Subtitles ready',
      subtitleFailed: 'Subtitle extraction failed',
      nativeSubs: 'Native subtitles on',
      noNative: 'No native track — extracting…',
      preparingSubs: 'Preparing subtitles…',
      noEmbedded: 'No embedded subtitles',
      defaultAudio: 'Default',
      off: 'Off',
      embedded: 'Embedded',
      external: 'External',
      selected: 'Selected',
      settings: 'Settings',
      audio: 'Audio',
      subtitles: 'Subtitles',
      none: 'None',
      readingTracks: 'Reading tracks…',
      noneInFile: 'None in this file',
      style: 'Style',
      delay: 'Delay',
      later: 'Later (+0.5s)',
      earlier: 'Earlier (-0.5s)',
      reset: 'Reset',
      bigger: 'Text bigger',
      smaller: 'Text smaller',
      colour: 'Colour',
      background: 'Background',
      on: 'On',
      white: 'White',
      yellow: 'Yellow',
      couldNotResume: 'Could not resume playback',
      controlUnavailable: 'Playback control unavailable',
      inactive: 'Playback paused while the TV was inactive',
      restoring: 'Restoring the local service…',
      restoreFailed: 'Could not restore the local service',
      ready: 'Subtitles ready',
      loaded: 'Subtitles loaded',
      extracting: 'extracting',
      language: 'language'
    };
// Element references, XHR helper, loading artwork and the startup watchdog.
var v = document.getElementById('v'),
  bar = document.getElementById('bar'),
  fill = document.getElementById('fill'),
  timeEl = document.getElementById('time'),
  menu = document.getElementById('menu'),
  subEl = document.getElementById('sub'),
  load = document.getElementById('load'),
  lname = document.getElementById('lname');
document.getElementById('title').textContent = TITLE;
document.getElementById('pvLbl').textContent = P.paused;
document.getElementById('npL').textContent = P.nextEpisode;
document.getElementById('npB').textContent = P.playNext;
document.getElementById('npH').textContent = P.dismissHint;
document.getElementById('b_next').textContent = P.nextEpisode;
function xhr(u, cb) {
  try {
    var x = new XMLHttpRequest();
    x.open('GET', u, true);
    x.onreadystatechange = function () {
      if (x.readyState === 4) {
        var j = null;
        try {
          j = JSON.parse(x.responseText);
        } catch (e) {}
        cb(j);
      }
    };
    x.send();
  } catch (e) {
    cb(null);
  }
}
function setArt(host, u) {
  if (!host) return;
  host.textContent = '';
  if (!u) return;
  var im = document.createElement('img');
  im.src = u;
  host.appendChild(im);
}
// ---- loading art is embedded server-side (no flash): show logo+backdrop now ----
if (BG) load.style.backgroundImage = 'url("' + BG + '")';
var bufArt = document.getElementById('bufart');
if (LOGO) {
  setArt(lname, LOGO);
  setArt(bufArt, LOGO);
} else {
  lname.textContent = TITLE;
  bufArt.textContent = TITLE;
}
if (SE) {
  document.getElementById('tse').textContent = SE;
}
var mediaUsable = false,
  startupRetry = 0,
  startupResetting = false,
  startupWatch = null;
function armStartupWatch() {
  if (startupWatch) clearTimeout(startupWatch);
  startupWatch = setTimeout(function () {
    if (!mediaUsable) retryStartup('timeout');
  }, 18000);
}
function mediaReady() {
  mediaUsable = true;
  startupResetting = false;
  if (startupWatch) {
    clearTimeout(startupWatch);
    startupWatch = null;
  }
}
function retryStartup(reason) {
  if (mediaUsable || startupRetry >= 1 || startupResetting) return false;
  startupRetry++;
  startupResetting = true;
  diag('media_start_retry', { reason: reason });
  showToast(P.retrying);
  try {
    v.pause();
    v.removeAttribute('src');
    v.load();
  } catch (e) {}
  setTimeout(function () {
    startupResetting = false;
    try {
      v.src = URL;
      v.load();
      var rp = v.play();
      if (rp && rp.catch) rp.catch(function () {});
    } catch (e) {}
    armStartupWatch();
  }, 650);
  return true;
}
v.addEventListener('loadedmetadata', mediaReady);
v.addEventListener('playing', mediaReady);
v.src = URL;
armStartupWatch();
// Resume, Continue Watching progress, account library sync and binge-to-next.
// ---- resume + Continue Watching (shared with the interface via same-origin localStorage) ----
// The interface keeps watch progress as lib_<first4 of user._id>_<id> items with state.timeOffset
// (ms). We read it to resume and write it so Continue Watching updates after our bare player.
function libPrefix() {
  try {
    var u = JSON.parse(localStorage.getItem('user') || 'null');
    if (u && u._id) return 'lib_' + u._id.slice(0, 4) + '_';
  } catch (e) {}
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k.indexOf('lib_') === 0) {
      var j = k.indexOf('_', 4);
      if (j > 0) return k.slice(0, j + 1);
    }
  }
  return 'lib_local_';
}
// one shared account library (lib_<hash>_): progress/watched is pushed to api.strem.io
var LIBKEY = libPrefix() + ID;
// POST helper + push the library item to the account (same datastorePut Stremio uses)
function xpost(u, body) {
  try {
    if (u.indexOf('https://api.strem.io/api/') === 0)
      u = '/stremioapi?path=' + encodeURIComponent(u.slice('https://api.strem.io'.length));
    var x = new XMLHttpRequest();
    x.open('POST', u, true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.send(JSON.stringify(body));
  } catch (e) {}
}
function authKeyLS() {
  try {
    return JSON.parse(localStorage.getItem('authKey') || 'null');
  } catch (e) {
    return null;
  }
}
var lastPush = 0;
function pushLib(force) {
  var ak = authKeyLS();
  if (!ak) return;
  var it = readLib();
  if (!it || !it._id) return;
  var n = Date.now();
  if (!force && n - lastPush < 60000) return;
  lastPush = n;
  xpost('https://api.strem.io/api/datastorePut', { authKey: ak, collection: 'libraryItem', changes: [it] });
}
// remember exactly which stream we played so Continue Watching can resume it directly
try {
  if (ID) localStorage.setItem('tvstream_' + ID + '_' + (VID || ID), location.search);
} catch (e) {}
// if the name/poster never came back from the server (Cinemeta was slow), fetch it now so
// the Continue Watching entry isn't left blank
if ((!TITLE || !POSTER) && TYPE && ID) {
  xhr('/meta?type=' + encodeURIComponent(TYPE) + '&id=' + encodeURIComponent(ID), function (j) {
    if (j) {
      if (!TITLE) {
        TITLE = j.name || '';
        try {
          document.getElementById('title').textContent = TITLE;
        } catch (e) {}
      }
      if (!POSTER) POSTER = j.poster || '';
    }
  });
}
function readLib() {
  try {
    return JSON.parse(localStorage.getItem(LIBKEY) || 'null');
  } catch (e) {
    return null;
  }
}
// NOTE removed:true on auto-created items -> they power Continue Watching (cwItems ignores
// removed) but are kept OUT of the Library grid. Only an explicit + Library flips removed:false.
// Stremio auto-watch semantics: removed:false + temp:true (shows in Library + Continue
// Watching and syncs everywhere). An explicit + Library later flips temp:false.
function saveProgress() {
  if (!v.duration || !ID) return;
  var now = new Date().toISOString();
  var it = readLib();
  if (!it || !it.state) {
    it = {
      state: {},
      _id: ID,
      removed: false,
      temp: true,
      _ctime: now,
      name: TITLE,
      type: TYPE,
      poster: POSTER || '',
      posterShape: 'poster',
      background: BG || '',
      logo: LOGO || '',
      year: ''
    };
  } else {
    if (!it.name && TITLE) it.name = TITLE;
    if (!it.poster && POSTER) it.poster = POSTER;
    if (!it.type && TYPE) it.type = TYPE;
    if (!it.posterShape) it.posterShape = 'poster';
  }
  var s = it.state;
  s.timeOffset = Math.round(v.currentTime * 1000);
  s.duration = Math.round(v.duration * 1000);
  s.video_id = VID || ID;
  s.lastWatched = now;
  s.timeWatched = s.timeOffset;
  if (s.overallTimeWatched == null) s.overallTimeWatched = s.timeOffset;
  if (s.timesWatched == null) s.timesWatched = 0;
  if (s.flaggedWatched == null) s.flaggedWatched = 0;
  if (s.season == null) s.season = 0;
  if (s.episode == null) s.episode = 0;
  if (!s.watchedEpisodes) s.watchedEpisodes = [];
  if (s.noNotif == null) s.noNotif = false;
  if (s.watched == null) s.watched = '';
  it.state = s;
  it._mtime = now;
  if (it.removed == null) it.removed = false;
  if (it.temp == null) it.temp = true;
  try {
    localStorage.setItem(LIBKEY, JSON.stringify(it));
  } catch (e) {}
}
var didResume = false;
function tryResume() {
  if (didResume) return;
  didResume = true;
  var it = readLib();
  if (it && it.state && it.state.video_id === (VID || ID) && it.state.timeOffset > 5000) {
    var sec = it.state.timeOffset / 1000;
    if (!it.state.duration || sec < it.state.duration / 1000 - 30) {
      try {
        v.currentTime = sec;
        showToast(P.resuming + fmt(sec));
      } catch (e) {}
    }
  }
}
v.addEventListener('loadeddata', tryResume);
v.addEventListener('canplay', tryResume);
setInterval(function () {
  if (!v.paused) {
    saveProgress();
    pushLib(false);
    if (v.duration && v.currentTime / v.duration > 0.95) markWatchedLocal();
  }
}, 10000);
v.addEventListener('pause', function () {
  saveProgress();
  pushLib(true);
});
v.addEventListener('ended', function () {
  saveProgress();
  pushLib(true);
});
// local watched flag: add this video id to state.watchedEpisodes (drives the beta checkmarks)
function markWatchedLocal() {
  try {
    var it = readLib();
    if (!it || !it.state) return;
    var wv = VID || ID;
    if (!it.state.watchedEpisodes) it.state.watchedEpisodes = [];
    for (var i = 0; i < it.state.watchedEpisodes.length; i++) if (it.state.watchedEpisodes[i] === wv) return;
    it.state.watchedEpisodes.push(wv);
    it.state.flaggedWatched = 1;
    it._mtime = new Date().toISOString();
    localStorage.setItem(LIBKEY, JSON.stringify(it));
    pushLib(true);
  } catch (e) {}
}
// binge: when the episode ends, jump straight to the next one (detail deep-link opens its streams)
v.addEventListener('ended', function () {
  markWatchedLocal();
  var binge = lsGet('bingeWatch', 'true') !== 'false' && lsGet('enableNextVideo', 'true') !== 'false';
  if (binge && NEXTHREF && !npDismissed) {
    rememberNextSource();
    showToast(P.nextLoading);
    setTimeout(function () {
      location.replace(NEXTHREF);
    }, 600);
  }
});
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
var embTracks = null,
  embTracksLoading = false,
  embTracksLoaded = false,
  embErr = '',
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
if (TYPE && VID) {
  xhr('/subs?type=' + encodeURIComponent(TYPE) + '&vid=' + encodeURIComponent(VID), function (j) {
    if (j && j.subtitles) {
      extSubs = j.subtitles;
      autoSub();
    }
  });
}
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
// Control bar, buffering state, toasts, diagnostics and local service recovery.
function updatePP() {
  var b = document.getElementById('b_pp');
  b.innerHTML = v.paused ? '<i class=ic-play></i>' : '<i class=ic-pause></i>';
}
v.addEventListener('play', updatePP);
v.addEventListener('pause', updatePP);
if (NEXTVID) {
  document.getElementById('b_next').style.display = '';
}
var btns = [];
(function () {
  var ids = ['b_rw', 'b_pp', 'b_ff', 'b_next', 'b_set'];
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (el && el.style.display !== 'none') {
      el._base = el.className;
      btns.push(el);
    }
  }
})();
function rememberNextSource() {
  if (!ID || !NEXTVID) return;
  try {
    localStorage.setItem(
      'tvnextpref_' + ID + '_' + NEXTVID,
      JSON.stringify({ at: Date.now(), addon: ADDON, quality: QUALITY, compat: COMPAT, text: SNAME })
    );
  } catch (e) {}
}
function nextEp() {
  if (NEXTHREF) {
    try {
      saveProgress();
      markWatchedLocal();
      rememberNextSource();
    } catch (e) {}
    location.replace(NEXTHREF);
  }
}
var mode = 'video',
  bIdx = 1,
  mIdx = 0,
  menuItems = [],
  hideT = null;
function fmt(s) {
  s = Math.max(0, s | 0);
  var h = (s / 3600) | 0,
    m = ((s % 3600) / 60) | 0,
    x = s % 60;
  function p(n) {
    return (n < 10 ? '0' : '') + n;
  }
  return (h ? h + ':' + p(m) : m) + ':' + p(x);
}
/* The bar is hidden most of the time; timeupdate only repaints it while it is visible. */
function paintProgress() {
  if (!v.duration || seekTarget >= 0) return;
  var pct = (v.currentTime / v.duration) * 100;
  fill.style.width = pct + '%';
  knob.style.left = pct + '%';
  timeEl.textContent = fmt(v.currentTime) + ' / ' + fmt(v.duration);
}
function showBar() {
  if (bar.className !== 'show') paintProgress();
  bar.className = 'show';
  if (hideT) clearTimeout(hideT);
  hideT = setTimeout(function () {
    if (mode === 'video') {
      bar.className = '';
    }
  }, 4000);
}
function paintBtns() {
  for (var i = 0; i < btns.length; i++)
    btns[i].className = btns[i]._base + (mode === 'controls' && i === bIdx ? ' f' : '');
  if (seekBar) seekBar.className = (seekTarget >= 0 ? 'seeking' : '') + (mode === 'seek' ? ' f' : '');
}
function hideLoad() {
  load.style.display = 'none';
}
v.addEventListener('playing', hideLoad);
v.addEventListener('loadeddata', function () {
  setTimeout(hideLoad, 300);
});
v.addEventListener('error', function () {
  if (retryStartup('error')) return;
  lname.textContent = P.playbackError;
  diag('media_error', {
    code: v.error ? v.error.code : 0,
    ready: v.readyState,
    network: v.networkState,
    compat: COMPAT
  });
});
// buffering: dim the frozen frame and breathe the art (the same look as initial load)
var bufEl = document.getElementById('buf');
function showBuf() {
  if (load.style.display === 'none' && !v.paused) {
    bufEl.style.display = '-webkit-flex';
    bufEl.style.display = 'flex';
  }
}
function hideBuf() {
  bufEl.style.display = 'none';
}
// a pause fires "waiting"/"stalled" on this TV too; only treat it as buffering while playing
v.addEventListener('waiting', showBuf);
v.addEventListener('stalled', showBuf);
v.addEventListener('playing', hideBuf);
v.addEventListener('canplay', hideBuf);
v.addEventListener('seeked', hideBuf);
v.addEventListener('pause', hideBuf);
v.addEventListener('timeupdate', function () {
  if (seekTarget < 0 && !v.paused) hideBuf();
  if (bar.className === 'show') paintProgress();
  renderSub();
});
// poll on a TIMER, not timeupdate: cues keep arriving while paused / after playback ends
setInterval(function () {
  if (embN >= 0) pollEmbCues();
}, 4000);
function setPlaying(play) {
  try {
    if (play) {
      var result = v.play();
      if (result && result.catch)
        result.catch(function () {
          diag('play_rejected', {});
          showToast(P.couldNotResume);
        });
    } else v.pause();
    setTimeout(updatePP, 0);
  } catch (e) {
    diag('play_toggle_error', {});
    showToast(P.controlUnavailable);
  }
  showBar();
}
function tog() {
  setPlaying(!!(v.paused || v.ended));
}
var seekEl = document.getElementById('seekind'),
  knob = document.getElementById('knob'),
  seekBar = document.getElementById('seek'),
  seekHideT = null,
  seekTarget = -1,
  seekTimer = null;
var toastEl = document.getElementById('toast'),
  toastT = null;
function showToast(m) {
  if (!toastEl) return;
  toastEl.textContent = m;
  toastEl.style.opacity = '1';
  if (toastT) clearTimeout(toastT);
  toastT = setTimeout(function () {
    toastEl.style.opacity = '0';
  }, 3200);
}
function diag(ev, data) {
  try {
    var q = [
      'ev=' + encodeURIComponent(ev),
      'ready=' + v.readyState,
      'network=' + v.networkState,
      't=' + (v.currentTime | 0)
    ];
    data = data || {};
    for (var k in data)
      if (Object.prototype.hasOwnProperty.call(data, k) && data[k] != null)
        q.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(data[k]).slice(0, 160)));
    var im = new Image();
    im.src = 'http://127.0.0.1:' + APP_PORT + '/log?' + q.join('&') + '&_=' + Date.now();
  } catch (e) {}
}
function health(cb) {
  var done = false;
  function end(ok) {
    if (done) return;
    done = true;
    cb(ok);
  }
  try {
    var x = new XMLHttpRequest();
    x.open('GET', 'http://127.0.0.1:' + APP_PORT + '/health?player=' + Date.now(), true);
    x.onreadystatechange = function () {
      if (x.readyState === 4) end(x.status >= 200 && x.status < 300);
    };
    x.timeout = 900;
    x.ontimeout = function () {
      end(false);
    };
    x.onerror = function () {
      end(false);
    };
    x.send();
    setTimeout(function () {
      end(false);
    }, 1100);
  } catch (e) {
    end(false);
  }
}
function startRuntime(cb) {
  var done = false,
    b = null;
  function end(ok) {
    if (done) return;
    done = true;
    b = null;
    cb(ok);
  }
  try {
    if (typeof PalmServiceBridge === 'undefined') {
      end(false);
      return;
    }
    b = new PalmServiceBridge();
    b.onservicecallback = function () {
      end(true);
    };
    b.call('luna://' + SERVICE_ID + '/start', '{}');
    setTimeout(function () {
      end(false);
    }, 2600);
  } catch (e) {
    end(false);
  }
}
var wasPlayingBeforeHide = false,
  resumeRecovering = false;
function recoverPlayerRuntime() {
  if (resumeRecovering) return;
  resumeRecovering = true;
  health(function (up) {
    if (up) {
      resumeRecovering = false;
      showToast(P.inactive);
      diag('player_resume_ok', {});
      return;
    }
    showToast(P.restoring);
    diag('player_resume_restart', {});
    startRuntime(function () {
      var tries = 0;
      function check() {
        health(function (ok) {
          if (ok) {
            diag('player_resume_recovered', { tries: tries });
            location.replace('http://127.0.0.1:' + APP_PORT + '/' + (BACK || 'beta'));
            return;
          }
          tries++;
          if (tries < 20) {
            setTimeout(check, 500);
            return;
          }
          resumeRecovering = false;
          showToast(P.restoreFailed);
          diag('player_resume_failed', { tries: tries });
        });
      }
      check();
    });
  });
}
(function () {
  var prop = '',
    event = '',
    hiddenAt = 0;
  if ('hidden' in document) {
    prop = 'hidden';
    event = 'visibilitychange';
  } else if ('webkitHidden' in document) {
    prop = 'webkitHidden';
    event = 'webkitvisibilitychange';
  }
  if (!event) return;
  document.addEventListener(
    event,
    function () {
      if (document[prop]) {
        hiddenAt = Date.now();
        wasPlayingBeforeHide = !v.paused;
        try {
          saveProgress();
          if (wasPlayingBeforeHide) v.pause();
          else pushLib(true);
        } catch (e) {}
        diag('player_hidden', { playing: wasPlayingBeforeHide ? 1 : 0 });
      } else if (hiddenAt) {
        diag('player_visible', { awaySec: Math.max(0, ((Date.now() - hiddenAt) / 1000) | 0) });
        hiddenAt = 0;
        setTimeout(recoverPlayerRuntime, 120);
      }
    },
    true
  );
})();
// Accumulated seeking, exit and the Back history entry.
// seeks accumulate while you keep pressing (+10, +20, ...) and only commit ~0.5s after
// you stop, so the bar/knob glide to the target and we buffer once instead of every press.
function fmtDelta(d) {
  var a = Math.abs(d),
    s = d >= 0 ? '+' : '-';
  if (a >= 60) {
    var m = (a / 60) | 0,
      x = a % 60;
    return s + m + 'm' + (x ? ' ' + x + 's' : '');
  }
  return s + a + 's';
}
function showSeekInd() {
  var d = Math.round(seekTarget - v.currentTime);
  seekEl.textContent = fmtDelta(d);
  seekEl.style.opacity = '1';
  if (seekHideT) {
    clearTimeout(seekHideT);
    seekHideT = null;
  }
}
function paintSeek() {
  if (!v.duration) return;
  var pct = Math.max(0, Math.min(100, (seekTarget / v.duration) * 100));
  fill.style.width = pct + '%';
  knob.style.left = pct + '%';
  timeEl.textContent = fmt(seekTarget) + ' / ' + fmt(v.duration);
}
function commitSeek() {
  if (seekTarget < 0) return;
  var tgt = seekTarget;
  seekTarget = -1;
  seekTimer = null;
  seekBar.className = mode === 'seek' ? 'f' : '';
  v.currentTime = tgt;
  showBuf();
  if (embN >= 0) {
    pollEmbCues();
  }
  if (seekHideT) clearTimeout(seekHideT);
  seekHideT = setTimeout(function () {
    seekEl.style.opacity = '0';
  }, 700);
}
function seek(d) {
  if (!v.duration) return;
  var base = seekTarget >= 0 ? seekTarget : v.currentTime;
  seekTarget = Math.max(0, Math.min(v.duration, base + d));
  seekBar.className = 'seeking' + (mode === 'seek' ? ' f' : '');
  showSeekInd();
  paintSeek();
  schedPreview();
  showBar();
  if (seekTimer) clearTimeout(seekTimer);
  seekTimer = setTimeout(commitSeek, 1200);
}
function activateButton() {
  var id = btns[bIdx] && btns[bIdx].id;
  if (id === 'b_rw') seek(-SEEKSTEP);
  else if (id === 'b_pp') tog();
  else if (id === 'b_ff') seek(SEEKSTEP);
  else if (id === 'b_next') nextEp();
  else if (id === 'b_set') openMenu('root');
}
var exited = false;
function exit() {
  if (exited) return;
  exited = true;
  try {
    saveProgress();
    pushLib(true);
  } catch (e) {}
  try {
    v.pause();
  } catch (e) {}
  try {
    window.removeEventListener('popstate', onPop);
  } catch (e) {}
  // one clean dark cover (same bg as the Stremio splash) so there is no flash, then a flag so
  // the interface shows a single "Taking you back to Stremio" loading splash.
  try {
    var cov = document.createElement('div');
    cov.id = 'gocov';
    document.body.appendChild(cov);
  } catch (e) {}
  try {
    sessionStorage.setItem('tvBack', '1');
  } catch (e) {}
  var st = null;
  try {
    st = history.state;
  } catch (e) {}
  try {
    new Image().src =
      '/log?ev=exit&hl=' + history.length + '&tv=' + (st && st.tv ? 1 : 0) + '&t=' + (v.currentTime | 0);
  } catch (e) {}
  // Adaptive: if our dummy is still the CURRENT entry (Back didn't pop it), drop dummy + /play
  // with go(-2); otherwise the Back already popped the dummy and /play is current, so replace it.
  // Either way /play is removed from history, so a second Back can't loop into the player.
  if (st && st.tv) {
    try {
      history.go(-2);
      return;
    } catch (e) {}
  }
  location.replace('/' + (BACK || 'beta'));
}
function repush() {
  try {
    history.pushState({ tv: 1 }, '');
  } catch (e) {}
}
function goBack() {
  if (npShown) {
    dismissNp();
    repush();
  } else if (mode === 'menu') {
    menuBack();
    repush();
  } else if (mode === 'controls') {
    mode = 'video';
    paintBtns();
    repush();
  } else {
    exit();
  }
}
// Settings menu: audio, subtitles, embedded tracks and subtitle style.
// This TV delivers Back as a history pop. We keep ONE dummy entry: popstate closes the
// menu/controls (re-pushing to stay), or exits when nothing is open.
try {
  history.pushState({ tv: 1 }, '');
} catch (e) {}
function onPop() {
  goBack();
}
window.addEventListener('popstate', onPop);
// ---- menus (subtitles = Off + external English-first + embedded; audio = embedded) ----
function openMenu(view) {
  subView = view;
  menuItems = [];
  var html = '';
  if (view === 'subsroot' || view === 'embedded') ensureEmbTracks();
  if (view === 'root') {
    html += '<div class=mh>' + P.settings + '</div>';
    html += '<div class=mi>' + P.audio + ': ' + eh(audioName()) + ' \u203a</div>';
    menuItems.push({ k: 'go', to: 'audio' });
    html += '<div class=mi>' + P.subtitles + ': ' + eh(subtitleName()) + ' \u203a</div>';
    menuItems.push({ k: 'go', to: 'subsroot' });
  } else if (view === 'audio') {
    html += '<div class=mh>' + P.audio + '</div>';
    try {
      for (var a = 0; a < v.audioTracks.length; a++) {
        var at = v.audioTracks[a],
          al = at.label || at.language || P.audio + ' ' + (a + 1);
        html +=
          '<div class="mi' + (at.enabled ? ' on' : '') + '">' + eh(selectedLabel(al, at.enabled)) + '</div>';
        menuItems.push({ k: 'aud', idx: a });
      }
    } catch (e) {}
    if (!menuItems.length) html += '<div class=mi style="opacity:.5">' + P.none + '</div>';
  } else if (view === 'subsroot') {
    html += '<div class=mh>' + P.subtitles + ': ' + eh(subtitleName()) + '</div>';
    var f0 = curSub === 'off';
    html += '<div class="mi' + (f0 ? ' on' : '') + '">' + eh(selectedLabel(P.off, f0)) + '</div>';
    menuItems.push({ k: 'off' });
    html += '<div class=mi>' + P.embedded + ' \u203a</div>';
    menuItems.push({ k: 'go', to: 'embedded' });
    html += '<div class=mi>' + P.external + ' \u203a</div>';
    menuItems.push({ k: 'go', to: 'external' });
    html += '<div class=mi>' + P.style + ' \u203a</div>';
    menuItems.push({ k: 'go', to: 'style' });
    if (curSub.indexOf('ext:') === 0) {
      html += '<div class=mi>' + P.delay + ' \u203a</div>';
      menuItems.push({ k: 'go', to: 'delay' });
    }
  } else if (view === 'embedded') {
    html += '<div class=mh>' + P.embedded + '</div>';
    if (embTracksLoading || embTracks === null) {
      html += '<div class=mi style="opacity:.5">' + P.readingTracks + '</div>';
      if (!embReopenArmed) {
        embReopenArmed = true;
        var iv = setInterval(function () {
          if (!embTracksLoading) {
            clearInterval(iv);
            embReopenArmed = false;
            if (subView === 'embedded') reopen();
          }
        }, 400);
      }
    } else if (embErr) {
      html += '<div class=mi style="opacity:.6;white-space:normal;font-size:22px">' + eh(embErr) + '</div>';
    } else if (!embTracks.length) {
      html += '<div class=mi style="opacity:.5">' + P.noneInFile + '</div>';
    } else {
      for (var j = 0; j < embTracks.length; j++) {
        var et = embTracks[j];
        var fb = curSub === 'emb:' + et.n;
        html += '<div class="mi' + (fb ? ' on' : '') + '">' + eh(selectedLabel(et.name, fb)) + '</div>';
        menuItems.push({ k: 'emb', idx: et.n, ti: et.ti });
      }
    }
  } else if (view === 'external') {
    html += '<div class=mh>' + P.external + ' \u2014 ' + P.language + '</div>';
    if (!extSubs.length) html += '<div class=mi style="opacity:.5">' + P.none + '</div>';
    var seen = {};
    for (var i = 0; i < extSubs.length; i++) {
      var L = extSubs[i].lang;
      if (!seen[L]) {
        seen[L] = 1;
        html += '<div class=mi>' + eh(extSubs[i].name) + ' \u203a</div>';
        menuItems.push({ k: 'lang', lang: L });
      }
    }
  } else if (view === 'extlang') {
    var nm = '';
    for (var i = 0; i < extSubs.length; i++) {
      if (extSubs[i].lang === extLang) {
        nm = extSubs[i].name;
        break;
      }
    }
    html += '<div class=mh>' + eh(nm) + ' ' + P.subtitles.toLowerCase() + '</div>';
    var c = 0;
    for (var i = 0; i < extSubs.length; i++) {
      if (extSubs[i].lang === extLang) {
        c++;
        var fe = curSub === 'ext:' + extSubs[i].u;
        html += '<div class="mi' + (fe ? ' on' : '') + '">' + eh(selectedLabel(nm + ' ' + c, fe)) + '</div>';
        menuItems.push({ k: 'ext', u: extSubs[i].u });
      }
    }
  } else if (view === 'style') {
    html += '<div class=mh>' + P.style + '</div>';
    html += '<div class=mi>' + P.bigger + '</div>';
    menuItems.push({ k: 'size+' });
    html += '<div class=mi>' + P.smaller + '</div>';
    menuItems.push({ k: 'size-' });
    html +=
      '<div class=mi>' +
      P.colour +
      ': ' +
      (subColor.toLowerCase() === '#ffe600' ? P.yellow : P.white) +
      '</div>';
    menuItems.push({ k: 'color' });
    html += '<div class=mi>' + P.background + ': ' + (subBgOp > 0 ? P.on : P.off) + '</div>';
    menuItems.push({ k: 'bg' });
  } else if (view === 'delay') {
    html += '<div class=mh>' + P.delay + ': ' + (subDelay > 0 ? '+' : '') + subDelay.toFixed(1) + 's</div>';
    html += '<div class=mi>' + P.later + '</div>';
    menuItems.push({ k: 'd+' });
    html += '<div class=mi>' + P.earlier + '</div>';
    menuItems.push({ k: 'd-' });
    html += '<div class=mi>' + P.reset + '</div>';
    menuItems.push({ k: 'd0' });
  }
  menu.innerHTML = html;
  menu.className = 'show';
  mode = 'menu';
  mIdx = 0;
  paintMenu();
}
function paintMenu() {
  var els = menu.querySelectorAll('.mi');
  for (var i = 0; i < els.length; i++) els[i].className = 'mi' + (i === mIdx ? ' f' : '');
  if (els[mIdx]) els[mIdx].scrollIntoView(false);
}
function reopen() {
  var keep = mIdx;
  openMenu(subView);
  mIdx = keep;
  paintMenu();
}
function menuBack() {
  if (subView === 'embedded' || subView === 'external' || subView === 'style' || subView === 'delay')
    openMenu('subsroot');
  else if (subView === 'extlang') openMenu('external');
  else if (subView === 'audio' || subView === 'subsroot') openMenu('root');
  else {
    menu.className = '';
    mode = 'controls';
    paintBtns();
  }
}
function chooseMenu() {
  var it = menuItems[mIdx];
  if (!it) {
    menuBack();
    return;
  }
  if (it.k === 'go') {
    openMenu(it.to);
    return;
  }
  if (it.k === 'lang') {
    extLang = it.lang;
    openMenu('extlang');
    return;
  }
  if (it.k === 'size+') {
    subSize = Math.min(76, subSize + 4);
    subEl._t = null;
    reopen();
    return;
  }
  if (it.k === 'size-') {
    subSize = Math.max(20, subSize - 4);
    subEl._t = null;
    reopen();
    return;
  }
  if (it.k === 'color') {
    subColor = subColor.toLowerCase() === '#ffe600' ? '#ffffff' : '#ffe600';
    subEl._t = null;
    reopen();
    return;
  }
  if (it.k === 'bg') {
    subBgOp = subBgOp > 0 ? 0 : 0.6;
    subEl._t = null;
    reopen();
    return;
  }
  if (it.k === 'd+') {
    subDelay += 0.5;
    reopen();
    return;
  }
  if (it.k === 'd-') {
    subDelay -= 0.5;
    reopen();
    return;
  }
  if (it.k === 'd0') {
    subDelay = 0;
    reopen();
    return;
  }
  if (it.k === 'off') subsOff();
  else if (it.k === 'ext') setExtSub(it.u);
  else if (it.k === 'emb') setEmbSub(it.idx, it.ti);
  else if (it.k === 'aud') {
    try {
      for (var j = 0; j < v.audioTracks.length; j++) v.audioTracks[j].enabled = j === it.idx;
    } catch (e) {}
  }
  var chosen = it.k === 'aud' ? P.audio + ': ' + audioName() : P.subtitles + ': ' + subtitleName();
  closeMenu();
  showToast(chosen);
}
function closeMenu() {
  menu.className = '';
  mode = 'controls';
  paintBtns();
  showBar();
}
// Paused vignette: title and technical badges.
// ---- paused vignette: title + tech badges (ffprobe via /probe, stream-name text as instant fallback) ----
var pv = document.getElementById('pv');
// title = the cover-art LOGO image when we have one (Netflix-style), else clean text; no S/E up here
(function () {
  var pt = document.getElementById('pvTitle');
  if (LOGO) setArt(pt, LOGO);
  else pt.textContent = TITLE;
})();
function fillBadges(j) {
  var host = document.getElementById('pvBadges');
  host.innerHTML = '';
  function ab(t, cls) {
    if (!t) return;
    var d = document.createElement('div');
    d.className = 'bdg' + (cls ? ' ' + cls : '');
    d.textContent = t;
    host.appendChild(d);
  }
  if (CERT) ab(CERT, 'cert');
  var sn = SNAME.toLowerCase();
  var rs =
    (j && j.res) ||
    (sn.indexOf('2160') >= 0 || sn.indexOf('4k') >= 0
      ? '4K'
      : sn.indexOf('1080') >= 0
        ? '1080p'
        : sn.indexOf('720') >= 0
          ? '720p'
          : '');
  ab(rs);
  var hd = (j && j.hdr) || '';
  if (!hd) {
    if (/dolby.?vision|\bdv\b|dovi/.test(sn)) hd = 'Dolby Vision';
    else if (sn.indexOf('hdr10+') >= 0) hd = 'HDR10+';
    else if (sn.indexOf('hdr') >= 0) hd = 'HDR';
  }
  ab(hd);
  var au = '';
  if (sn.indexOf('atmos') >= 0) au = 'Dolby Atmos';
  if (!au && j && j.audio) au = j.audio;
  if (!au) {
    if (/ddp|dd\+|eac3|e-ac-3/.test(sn)) au = 'Dolby Digital+';
    else if (/\bac3\b|dolby.?digital/.test(sn)) au = 'Dolby Digital';
    else if (sn.indexOf('dts') >= 0) au = 'DTS';
  }
  ab(au);
  if (j && j.vcodec) ab(j.vcodec);
  if (j && j.size) ab(j.size);
}
fillBadges(null);
var techProbed = false;
function ensureTechProbe() {
  if (techProbed) return;
  techProbed = true;
  xhr('/probe?u=' + encodeURIComponent(URL), function (j) {
    if (j) fillBadges(j);
  });
}
var pvT = null;
v.addEventListener('pause', function () {
  ensureTechProbe();
  if (pvT) clearTimeout(pvT);
  pvT = setTimeout(function () {
    if (v.paused && mode !== 'menu' && load.style.display === 'none') pv.className = 'show';
  }, 350);
});
v.addEventListener('play', function () {
  if (pvT) clearTimeout(pvT);
  pv.className = '';
});
// End-of-title popup: next episode or something similar.
// ---- end-of-title popup (last 3 min): series -> next episode; movie -> "watch something similar" ----
var SIMHREF =
  BACK.indexOf('beta') === 0 && TYPE && ID && !NEXTHREF
    ? '/beta#sim/' + encodeURIComponent(TYPE) + '/' + encodeURIComponent(ID)
    : '';
var POPHREF = NEXTHREF || SIMHREF,
  isNextEp = !!NEXTHREF;
var np = document.getElementById('np'),
  npX = document.getElementById('npX'),
  npShown = false,
  npFocus = false,
  npDismissed = false;
function paintNp() {
  np.className = npShown ? 'show' + (npFocus ? ' f' : '') : '';
}
function dismissNp() {
  npFocus = false;
  npShown = false;
  npDismissed = true;
  paintNp();
}
(function () {
  var L = document.getElementById('npL'),
    T = document.getElementById('npT'),
    B = document.getElementById('npB');
  if (isNextEp) {
    L.textContent = P.nextEpisode;
    B.textContent = P.playNext;
    if (NEXTTITLE) T.textContent = NEXTTITLE;
    else if (NEXTVID && NEXTVID.indexOf(':') > 0) {
      var npp = NEXTVID.split(':');
      T.textContent = 'S' + npp[npp.length - 2] + ' E' + npp[npp.length - 1];
    }
    if (NEXTTHUMB) {
      var npi = document.getElementById('npI');
      npi.onload = function () {
        npi.style.display = 'block';
      };
      npi.src = NEXTTHUMB;
    }
  } else if (SIMHREF) {
    L.textContent = P.liked;
    T.textContent = P.similar;
    B.textContent = P.findSimilar;
  }
})();
function npGo() {
  if (isNextEp) nextEp();
  else if (SIMHREF) {
    try {
      saveProgress();
    } catch (e) {}
    location.replace(SIMHREF);
  }
}
function checkNp() {
  if (!POPHREF || npDismissed || !v.duration) return;
  var rem = v.duration - v.currentTime;
  if (rem <= 180 && rem > 2 && !npShown) {
    npShown = true;
    paintNp();
  } else if (rem > 180 && npShown) {
    npShown = false;
    npFocus = false;
    paintNp();
  }
}
v.addEventListener('timeupdate', checkNp);
// Scrub previews and pointer input.
// ---- scrub previews: /frame grabs one small jpeg at the seek target (debounced) ----
// Centered Netflix-style preview: shimmer while a frame loads, keep the LAST frame instead of
// flashing black, and only re-fetch per 10s bucket. spvi loads async; on load it reveals.
var spv = document.getElementById('spv'),
  spvImg = document.getElementById('spvi'),
  spvTime = document.getElementById('spvT'),
  spvT = null,
  spvLast = -1;
spvImg.addEventListener('load', function () {
  if (spvImg.naturalWidth > 0) {
    spvImg.style.opacity = '1';
    spv.className = '';
  }
});
// kick background sprite extraction ~4s after playback starts (once, when duration is known)
var spriteKicked = false;
function kickSprite() {
  if (!PREVIEW_ON || spriteKicked || !v.duration || v.duration === Infinity) return;
  spriteKicked = true;
  xhr('/spritegen?u=' + encodeURIComponent(URL) + '&dur=' + Math.floor(v.duration), function () {});
}
function schedPreview() {
  if (!v.duration) return;
  if (!PREVIEW_ON) {
    spv.style.display = 'none';
    return;
  }
  // Settings: Scrubbing previews Off
  kickSprite();
  spv.style.display = 'block';
  spvTime.textContent = fmt(seekTarget) + '  /  ' + fmt(v.duration);
  // /frame snaps to the nearest already-extracted sprite -> returns instantly (or 204 if that
  // region isn't baked yet, in which case the shimmer/last frame stays)
  var b = seekTarget | 0;
  b = b - (b % 5);
  if (b === spvLast) return;
  spvLast = b;
  if (spvImg.naturalWidth === 0) spv.className = 'load';
  var im = new Image();
  im.onload = function () {
    spvImg.src = im.src;
    spv.className = '';
  };
  im.onerror = function () {};
  im.src = '/frame?u=' + encodeURIComponent(URL) + '&t=' + b;
}
function hidePreview() {
  spv.style.display = 'none';
  spv.className = '';
  if (spvT) {
    clearTimeout(spvT);
    spvT = null;
  }
}
v.addEventListener('seeked', hidePreview);
v.addEventListener('playing', hidePreview);
function hitIndex(target, list) {
  for (var n = target; n && n !== document.body; n = n.parentNode) {
    for (var i = 0; i < list.length; i++) if (list[i] === n) return i;
  }
  return -1;
}
function hitNode(target, node) {
  for (var n = target; n && n !== document.body; n = n.parentNode) if (n === node) return true;
  return false;
}
document.addEventListener('mouseover', function (e) {
  var i;
  if (mode === 'menu') {
    var mis = menu.querySelectorAll('.mi');
    i = hitIndex(e.target, mis);
    if (i >= 0 && i < menuItems.length) {
      mIdx = i;
      paintMenu();
    }
    return;
  }
  i = hitIndex(e.target, btns);
  if (i >= 0) {
    mode = 'controls';
    bIdx = i;
    paintBtns();
    showBar();
    return;
  }
  if (hitNode(e.target, seekBar)) {
    mode = 'seek';
    paintBtns();
    showBar();
  } else if (npShown && hitNode(e.target, np) && !hitNode(e.target, npX)) {
    npFocus = true;
    paintNp();
  }
});
document.addEventListener('click', function (e) {
  var i;
  if (mode === 'menu') {
    var mis = menu.querySelectorAll('.mi');
    i = hitIndex(e.target, mis);
    if (i >= 0 && i < menuItems.length) {
      mIdx = i;
      paintMenu();
      chooseMenu();
      e.preventDefault();
    }
    return;
  }
  i = hitIndex(e.target, btns);
  if (i >= 0) {
    mode = 'controls';
    bIdx = i;
    paintBtns();
    activateButton();
    e.preventDefault();
    return;
  }
  if (hitNode(e.target, seekBar) && v.duration) {
    var rect = seekBar.getBoundingClientRect(),
      ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    mode = 'seek';
    seekTarget = v.duration * ratio;
    paintSeek();
    commitSeek();
    paintBtns();
    showBar();
    e.preventDefault();
    return;
  }
  if (npShown && hitNode(e.target, npX)) {
    dismissNp();
    e.preventDefault();
    return;
  }
  if (npShown && hitNode(e.target, np)) {
    npFocus = true;
    paintNp();
    npGo();
    e.preventDefault();
    return;
  }
  if (e.target === v) {
    mode = 'controls';
    bIdx = 1;
    paintBtns();
    showBar();
    e.preventDefault();
  }
});
// Remote key handling and the remote-debug hook.
// ---- key handling ----
document.addEventListener(
  'keydown',
  function (e) {
    var k = e.keyCode,
      key = e.key || '';
    if (k === 415 || key === 'MediaPlay') {
      setPlaying(true);
      e.preventDefault();
      return;
    }
    if (k === 19 || key === 'MediaPause') {
      setPlaying(false);
      e.preventDefault();
      return;
    }
    if (k === 179 || key === 'MediaPlayPause') {
      tog();
      e.preventDefault();
      return;
    }
    if (k === 461 || k === 8 || k === 27) {
      e.preventDefault();
      e.stopPropagation();
      history.back();
      return;
    }
    showBar();
    if (mode === 'menu') {
      if (k === 38) {
        mIdx = Math.max(0, mIdx - 1);
        paintMenu();
      } else if (k === 40) {
        mIdx = Math.min(menuItems.length - 1, mIdx + 1);
        paintMenu();
      } else if (k === 13) chooseMenu();
      e.preventDefault();
      return;
    }
    if (npFocus) {
      if (k === 13) {
        npGo();
      } else if (k === 38) {
        npFocus = false;
        paintNp();
        mode = 'controls';
        paintBtns();
      } else if (k === 40 || k === 37 || k === 39) {
        dismissNp();
      }
      e.preventDefault();
      return;
    }
    if (mode === 'controls') {
      if (k === 37) {
        bIdx = Math.max(0, bIdx - 1);
        paintBtns();
      } else if (k === 39) {
        bIdx = Math.min(btns.length - 1, bIdx + 1);
        paintBtns();
      } else if (k === 38) {
        mode = 'seek';
        paintBtns();
      } else if (k === 40) {
        mode = 'video';
        paintBtns();
      } else if (k === 13) activateButton();
      e.preventDefault();
      return;
    }
    if (mode === 'seek') {
      if (k === 37) seek(-SEEKSTEP);
      else if (k === 39) seek(SEEKSTEP);
      else if (k === 40) {
        mode = 'controls';
        paintBtns();
      } else if (k === 38) {
        mode = 'video';
        paintBtns();
      } else if (k === 13 && seekTarget >= 0) commitSeek();
      e.preventDefault();
      return;
    }
    if (k === 38) {
      if (npShown) {
        npFocus = true;
        paintNp();
      } else {
        mode = 'controls';
        if (bIdx < 0) bIdx = 1;
        paintBtns();
      }
      e.preventDefault();
      return;
    }
    if (k === 40) {
      mode = 'seek';
      paintBtns();
      e.preventDefault();
      return;
    }
    if (k === 13) {
      tog();
      e.preventDefault();
    } else if (k === 37) {
      seek(-SEEKSTEP);
      e.preventDefault();
    } else if (k === 39) {
      seek(SEEKSTEP);
      e.preventDefault();
    }
  },
  true
);
showBar();
// remote-debug hook: lets the CDP inspector read player state / drive sub selection
window.__tv = {
  st: function () {
    return {
      cur: curSub,
      subtitle: subtitleName(),
      audio: audioName(),
      mode: mode,
      bIdx: bIdx,
      embN: embN,
      cues: cues ? cues.length : null,
      cf: cues && cues[0] ? cues[0].s : null,
      cl: cues && cues.length ? cues[cues.length - 1].e : null,
      t: v.currentTime,
      paused: v.paused,
      dur: v.duration,
      tracks: embTracks
    };
  },
  emb: function (n) {
    setEmbSub(n);
  },
  ext: function (u) {
    setExtSub(u);
  },
  off: function () {
    subsOff();
  }
};
