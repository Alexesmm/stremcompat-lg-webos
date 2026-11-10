// What the settings menu offers beyond audio and subtitles: the season's episodes, chapters,
// the files of a torrent, the picture size and the speed.

/* what FFprobe read from the file, once asked (paused.js): chapters and the audio tracks */
var mediaInfo = null;

/* ---- audio tracks: the languages asked for first, each with what the file says about it ---- */
function audioOrder() {
  var first = [],
    rest = [];
  for (var i = 0; i < v.audioTracks.length; i++) {
    var lang = v.audioTracks[i].language;
    (sameLanguage(lang, WANTAUD) || sameLanguage(lang, WANTAUD2) ? first : rest).push(i);
  }
  return first.concat(rest);
}
function audioLabel(i) {
  var track = v.audioTracks[i],
    plain = track.label || track.language || P.audio + ' ' + (i + 1),
    known =
      mediaInfo &&
      mediaInfo.audios &&
      mediaInfo.audios.length === v.audioTracks.length &&
      mediaInfo.audios[i];
  if (!known) return plain;
  var parts = [known.lang || plain];
  if (known.title && known.title !== known.lang) parts.push(known.title);
  if (known.format) parts.push(known.format);
  return parts.join('  ·  ');
}

/* ---- subtitle languages: the ones asked for, the interface's and English come first ---- */
function wantedSubtitleLanguage(lang) {
  return (
    sameLanguage(lang, WANTSUB) ||
    sameLanguage(lang, WANTSUB2) ||
    sameLanguage(lang, defaultMediaLanguage()) ||
    sameLanguage(lang, 'eng')
  );
}

/* ---- picture: the whole image, or grown until it fills the screen ----
   The TV draws the video inside the element's box and keeps its shape, so a box larger than
   the screen crops the sides (or the top and bottom) of a film wider or narrower than it. */
/* Simple (Settings) leaves the technical rows out of the player's menu */
var SIMPLE = lsGet('uiMode', 'full') === 'simple';
var IS_VIDEO_ELEMENT = v.tagName === 'VIDEO',
  pictureMode = IS_VIDEO_ELEMENT ? lsGet('pictureMode', 'fit') : 'fit';
function applyPicture() {
  if (!IS_VIDEO_ELEMENT) return;
  var grow = 1;
  if (pictureMode === 'zoom' && v.videoWidth && v.videoHeight) {
    var screen = window.innerWidth / window.innerHeight,
      video = v.videoWidth / v.videoHeight;
    grow = Math.max(screen / video, video / screen);
  }
  var size = Math.round(grow * 1000) / 10 + '%',
    offset = Math.round((1 - grow) * 500) / 10 + '%';
  v.style.width = size;
  v.style.height = size;
  v.style.left = offset;
  v.style.top = offset;
}
function togglePicture() {
  pictureMode = pictureMode === 'zoom' ? 'fit' : 'zoom';
  try {
    localStorage.setItem('pictureMode', pictureMode);
  } catch (e) {}
  applyPicture();
}
v.addEventListener('loadedmetadata', applyPicture);

/* ---- speed: offered until the TV shows it does not follow ---- */
var SPEEDS = [0.75, 1, 1.25, 1.5],
  speedRefused = false;
function canChangeSpeed() {
  return IS_VIDEO_ELEMENT && typeof v.playbackRate === 'number' && !speedRefused;
}
function speedLabel(rate) {
  return rate + '×';
}
function setSpeed(rate) {
  try {
    v.playbackRate = rate;
  } catch (e) {}
  setTimeout(function () {
    if (Math.abs(v.playbackRate - rate) < 0.01) return;
    speedRefused = true;
    showToast(P.speedRefused);
  }, 500);
}

/* ---- chapters ---- */
function currentChapter() {
  var list = (mediaInfo && mediaInfo.chapters) || [],
    at = -1;
  for (var i = 0; i < list.length; i++) if (list[i].t <= v.currentTime + 0.5) at = i;
  return at;
}

/* ---- the episodes of this season, opened from here with the source that matches this one ---- */
var CAN_LIST_EPISODES = TYPE === 'series' && !!ID && VID.indexOf(':') > 0 && BACK.indexOf('beta') === 0,
  seasonList = null,
  seasonListAsked = false;
function ensureSeasonList() {
  if (seasonListAsked) return;
  seasonListAsked = true;
  xhr('/episodes?id=' + encodeURIComponent(ID) + '&vid=' + encodeURIComponent(VID), function (j) {
    seasonList = (j && j.episodes) || [];
    if (mode === 'menu' && subView === 'episodes') reopen();
  });
}
function episodePage(vid) {
  return '/beta#detail/' + [TYPE, ID, vid].map(encodeURIComponent).join('/');
}
function goToEpisode(vid) {
  if (nextStarting) return;
  nextStarting = true;
  try {
    saveProgress();
    pushLib(true);
    rememberNextSource(vid);
    openEpisodeDirect(vid, episodePage(vid));
  } catch (e) {
    location.replace(appUrl(episodePage(vid)));
  }
}

/* ---- a torrent with several films or episodes: its other video files ---- */
var torrentFileList = null,
  torrentFilesAsked = false;
function ensureTorrentFiles() {
  if (torrentFilesAsked || !IS_TORRENT) return;
  torrentFilesAsked = true;
  xhr('/torrentfiles?u=' + encodeURIComponent(URL), function (j) {
    torrentFileList = (j && j.files) || [];
    if (torrentFileList.length > 1 && mode === 'menu' && subView === 'root') reopen();
  });
}
function fileSize(bytes) {
  return bytes >= 1073741824 ? (bytes / 1073741824).toFixed(1) + ' GB' : Math.round(bytes / 1048576) + ' MB';
}
function playTorrentFile(index) {
  var source = {
    url: URL.replace(/(:11470\/[0-9a-f]{40}\/)\d+/i, '$1' + index),
    addon: ADDON,
    addonBase: ADDONBASE,
    name: SNAME,
    quality: QUALITY,
    compatLabels: COMPAT ? COMPAT.split(',') : []
  };
  postStreamRef(source, function (ref) {
    if (!ref) return showToast(P.sourceFailed);
    location.replace(
      appUrl(
        '/play?ref=' +
          encodeURIComponent(ref) +
          '&type=' +
          encodeURIComponent(TYPE) +
          '&id=' +
          encodeURIComponent(ID) +
          '&vid=' +
          encodeURIComponent(VID) +
          '&back=' +
          encodeURIComponent(BACK)
      )
    );
  });
}
