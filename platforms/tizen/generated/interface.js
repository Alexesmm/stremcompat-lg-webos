try{
(function(){
'use strict';
window.__SC_MAIN_PARSED__=true;
window.__SC_PHASE__('M0');
// What differs between TV platforms, Samsung Tizen here. src/platform/lg has the same functions.
/* programs other than the TV's own service runtime cannot run on Tizen, so no FFmpeg or FFprobe */
var HAS_MEDIA_TOOLS = false;
/* The pages are files inside the package, with <base> pointing every request at the local
   server: a path that leaves for another page has to name its file. */
var APP_ROOT = String(location.href)
  .replace(/[?#].*$/, '')
  .replace(/[^\/]*$/, '');
function appUrl(path) {
  var p = String(path)
    .replace(/^https?:\/\/[^\/]+/, '')
    .replace(/^\/+/, '');
  if (p.indexOf('play') === 0) return APP_ROOT + 'player.html' + p.slice(4);
  if (p.indexOf('beta') === 0) return APP_ROOT + 'index.html' + p.slice(4);
  return path;
}
function isRemoteBack(k) {
  return k === 10009 || k === 27;
}
function isBackKey(k) {
  return isRemoteBack(k) || k === 8;
}
function startService(serviceId, cb) {
  try {
    tizen.application.launchAppControl(
      new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/service'),
      serviceId,
      function () {
        cb(true);
      },
      function () {
        cb(false);
      }
    );
  } catch (e) {
    cb(false);
  }
}
/* Only Back, the arrows and OK reach a page by default. */
(function () {
  try {
    var keys = tizen.tvinputdevice.getSupportedKeys();
    for (var i = 0; i < keys.length; i++)
      if (/^(ColorF|Media|\d$)/.test(keys[i].name)) tizen.tvinputdevice.registerKey(keys[i].name);
  } catch (e) {}
})();
/* The service leaves by itself when nothing has asked it anything for a while, so the app
   leaves nothing running after it closes. A video playing from a link asks nothing. */
setInterval(function () {
  try {
    var x = new XMLHttpRequest();
    x.open('GET', '/health?alive=' + Date.now(), true);
    x.send();
  } catch (e) {}
}, 30000);
// Interface side of the Tizen platform.
/* the YouTube app is not opened from here on Samsung yet */
function openYoutubeApp() {
  return false;
}
function exitApp() {
  var left = false;
  function leave() {
    if (left) return;
    left = true;
    try {
      tizen.application.getCurrentApplication().exit();
    } catch (e) {}
  }
  try {
    var x = new XMLHttpRequest();
    x.open('GET', '/quit', true);
    x.onreadystatechange = function () {
      if (x.readyState === 4) leave();
    };
    x.send();
  } catch (e) {}
  setTimeout(leave, 500);
}
/* these packages are not updated from inside the app */
function installUpdate(info, onStatus, done) {
  done(false);
}
function openUpdater() {
  return false;
}
// Service endpoints, the build profile, viewport metrics and DOM/event helpers.
/* ================= utils ================= */
var CIN = 'https://v3-cinemeta.strem.io';
var API = 'https://api.strem.io';
/* Injected by local-server.js from the build profile; the fallback is the webOS 4 1920x1080 profile. */
var TV_PROFILE = window.__SC_PROFILE__ || {
  id: 'um4-armv7',
  serviceId: 'io.github.alexesmm.legacytv.server',
  lowMemory: false,
  sourceCap: 60,
  libraryCap: 60,
  catalogCap: 16,
  catalogRowsCap: 24,
  discoverCap: 80
};
function $(id) {
  return document.getElementById(id);
}
function viewportWidth() {
  var d = document.documentElement;
  return Math.max(640, (d && d.clientWidth) || window.innerWidth || 1920);
}
function contentWidth() {
  var d = document.documentElement,
    h = (d && d.clientHeight) || window.innerHeight || 1080;
  return viewportWidth() - (h <= 800 ? 112 : 176);
}
function on(target, name, handler, capture) {
  if (!target) return false;
  try {
    if (typeof target.addEventListener === 'function') {
      target.addEventListener(name, handler, !!capture);
      return true;
    }
    if (typeof target.attachEvent === 'function') {
      target.attachEvent('on' + name, function () {
        handler(window.event);
      });
      return true;
    }
    target['on' + name] = handler;
    return true;
  } catch (e) {
    try {
      target['on' + name] = handler;
      return true;
    } catch (ignore) {
      return false;
    }
  }
}
function bodyHas(name) {
  return (' ' + document.body.className + ' ').indexOf(' ' + name + ' ') >= 0;
}
function bodyAdd(name) {
  if (!bodyHas(name)) document.body.className += (document.body.className ? ' ' : '') + name;
}
function bodyRemove(name) {
  document.body.className = (' ' + document.body.className + ' ')
    .replace(new RegExp(' ' + name + ' ', 'g'), ' ')
    .replace(/^\s+|\s+$/g, '');
}
// XHR helpers. Addon GETs and Stremio API POSTs go through the local bridges in local-server.js.
function xhrGetUrl(u) {
  return /^https?:\/\//i.test(String(u || '')) ? '/addon?u=' + encodeURIComponent(u) : u;
}
/* cb(json, failure, status): failure is null on success, otherwise 'timeout', 'offline'
   (the local service did not answer), 'unavailable' (HTTP error, e.g. the addon
   bridge's 502) or 'invalid' (the body was not JSON); status is the HTTP status. */
function xhrJson(u, cb, tmo) {
  var done = false;
  try {
    var x = new XMLHttpRequest();
    x.open('GET', xhrGetUrl(u), true);
    x.onreadystatechange = function () {
      if (x.readyState === 4 && !done) {
        done = true;
        var j = null,
          failure = null;
        if (!x.status) failure = 'offline';
        else if (x.status >= 400) failure = 'unavailable';
        try {
          j = JSON.parse(x.responseText);
        } catch (e) {
          failure = failure || 'invalid';
        }
        cb(failure ? null : j, failure, x.status);
      }
    };
    x.send();
    setTimeout(function () {
      if (!done) {
        done = true;
        try {
          x.abort();
        } catch (e) {}
        cb(null, 'timeout');
      }
    }, tmo || 14000);
    return x;
  } catch (e) {
    cb(null, 'offline');
    return null;
  }
}
/* After a request failed: asks the local server whether Stremio answers at all, so the
   screen can say the TV has no connection instead of a vague error. cb(code) gets the
   network error (such as ENOTFOUND or ETIMEDOUT), or '' when Stremio is reachable or
   the local server itself did not answer. Never runs while things work. */
function checkConnection(cb) {
  xhrJson(
    '/netcheck',
    function (j) {
      cb(j && j.ok === false ? String(j.code || 'ERROR') : '');
    },
    15000
  );
}
function apiPostUrl(u) {
  var p = API + '/api/';
  return String(u || '').indexOf(p) === 0
    ? '/stremioapi?path=' + encodeURIComponent(String(u).slice(API.length))
    : u;
}
function postJson(u, body, cb, tmo) {
  var done = false;
  try {
    var x = new XMLHttpRequest();
    x.open('POST', apiPostUrl(u), true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.onreadystatechange = function () {
      if (x.readyState === 4 && !done) {
        done = true;
        var j = null;
        try {
          j = JSON.parse(x.responseText);
        } catch (e) {}
        cb(j);
      }
    };
    x.send(JSON.stringify(body));
    setTimeout(function () {
      if (!done) {
        done = true;
        try {
          x.abort();
        } catch (e) {}
        cb(null);
      }
    }, tmo || 14000);
  } catch (e) {
    cb(null);
  }
}
// localStorage access that never throws (storage can be unavailable on old webOS).
function lsJson(k) {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null');
  } catch (e) {
    return null;
  }
}
function lsSet(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {}
}
function lsRaw(k, d) {
  try {
    var v = localStorage.getItem(k);
    return v == null ? d : v;
  } catch (e) {
    return d;
  }
}
function lsRawSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch (e) {}
}
function storageKeys() {
  var out = [];
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k != null) out.push(k);
    }
  } catch (e) {}
  return out;
}
// Interface and player strings, shared by both bundles. English and Portuguese are built in; the
// others are service/lang/<code>.json, read only when chosen, so a TV holds just its own language.
/* Adding a language means adding its file and its name in UI_LANGUAGES: the interface reads it
   with tx(), the player through playerText() in src/player/strings.js. */
/* Interface language is deliberately local to the television. It does not follow
   the Stremio account and it does not change subtitle/audio preferences. English is
   the reliable first-run and fallback language; Portuguese remains an explicit choice. */
var UI_LANG_KEY = 'uiLanguage';
var UI_TEXT = {
  'en-US': {
    navSearch: 'Search',
    navHome: 'Home',
    navDiscover: 'Discover',
    navLibrary: 'Library',
    navAddons: 'Addons',
    navSettings: 'Settings',
    searchPlaceholder: 'Search movies and series',
    searchHint: 'Type with the keyboard; results appear as you type',
    searching: 'Searching…',
    noResults: 'No results for “{0}”',
    movies: 'Movies',
    series: 'Series',
    anime: 'Anime',
    movie: 'Movie',
    seriesOne: 'Series',
    other: 'Other',
    all: 'All',
    recent: 'Recent',
    recentSearches: 'Recent searches',
    seeAll: 'See all ›',
    seeAllHint: 'Open the whole catalog in Discover',
    keySpace: 'space',
    keyDelete: 'delete',
    keyClear: 'clear',
    clearHistory: 'Clear history',
    removeFromCw: 'Remove from Continue watching',
    exitTitle: 'Leave StremCompat?',
    exitSub: 'Choose an option',
    exitStay: 'Stay',
    exitLeave: 'Leave the app',
    removedFromCw: 'Removed from Continue watching',
    torrentsNeedServer: 'This TV cannot run torrents by itself. Set a server in Settings > Streaming server.',
    serverAddress: 'Address',
    serverHere: 'This TV',
    serverTitle: 'Streaming server address',
    serverHint: 'Used for torrents. Example: 192.168.0.10:11470',
    serverDelete: 'Delete',
    serverClear: 'Clear',
    serverUseTv: 'Use this TV',
    serverSave: 'Test and save',
    serverTesting: 'Testing the connection…',
    serverSaved: 'Streaming server saved',
    serverLocal: 'Using the server on this TV',
    serverInvalid: 'Check the address',
    serverUnreachable: 'No streaming server answered at this address',
    serverDisk: 'Could not save the address',
    historyGroup: 'History',
    noHistory: 'Do not save history',
    clearSearches: 'Clear recent searches',
    clearCw: 'Clear Continue watching',
    confirmAgain: 'Press OK again to confirm',
    searchesCleared: 'Recent searches cleared',
    cwCleared: 'Continue watching cleared ({0})',
    nothingToClear: 'Nothing to clear',
    holdOkHint: 'Tip: hold OK on a title for more options',
    discoverTitle: 'Discover',
    popular: 'Popular',
    topRated: 'Top rated',
    allGenres: 'All genres',
    popularMovies: 'Popular · Movies',
    popularSeries: 'Popular · Series',
    topMovies: 'Top rated · Movies',
    topSeries: 'Top rated · Series',
    trendingMovies: 'Trending · Movies',
    trendingSeries: 'Trending · Series',
    continueWatching: 'Continue watching',
    myList: 'My list',
    newEpisodes: 'New episodes',
    newEpisodeTag: 'New · S{0} E{1}',
    cwUpNext: 'Up next · S{0} E{1}',
    cwEpisode: 'S{0} E{1}',
    cwLeft: '{0} min left',
    badgeSoon: 'Coming soon',
    badgeNew: 'New',
    emptyLibraryTitle: 'Your library is empty',
    emptyLibraryHint: 'Hold OK on any title and choose Add to Library.',
    nothingFoundHint: 'Try another catalog or genre.',
    similarEmptyHint: 'This title has no similar suggestions yet.',
    noResultsHint: 'Try another name, fewer words or the original title.',
    interfaceTextSize: 'Interface text',
    textNormal: 'Normal',
    textLarge: 'Larger',
    loadingTrailer: 'Loading trailer…',
    trailerUnavailable: 'Trailer unavailable',
    trailerInYoutube: 'Opening the trailer in the YouTube app',
    noTrailer: 'No trailer available',
    continueLabel: 'Continue',
    continueEpisode: 'Continue S{0} E{1}',
    playEpisode: 'Play S{0} E{1}',
    watch: 'Watch',
    details: 'Details',
    similarTitles: 'More like this',
    trailer: 'Trailer',
    markWatched: 'Mark as watched',
    markedWatched: 'Marked as watched',
    removeLibrary: 'Remove from Library',
    addLibrary: 'Add to Library',
    removedLibrary: 'Removed from Library',
    addedLibrary: 'Added to Library',
    inLibrary: 'In Library',
    libraryButton: 'Library',
    similar: 'Similar',
    similarTo: 'More like {0}',
    findingSimilar: 'Finding similar titles…',
    nothingFound: 'Nothing found.',
    couldNotLoad: 'Could not load title',
    specials: 'Specials',
    season: 'Season {0}',
    episode: 'Episode {0}',
    seasonEpisode: 'Season {0} · Episode {1}',
    absoluteEpisode: 'Episode {0} overall',
    seasonAbsoluteEpisode: 'Season {0} · Episode {1} · Episode {2} overall',
    seasonOrder: 'By season',
    continuousOrder: 'Continuous order',
    previous: 'Previous',
    next: 'Next',
    episodeRange: 'Episodes {0}–{1}',
    goToEpisode: 'Go to episode',
    episodeNumberPrompt: 'Enter the overall episode number',
    episodeNotFound: 'Episode not found',
    jumpDelete: 'Delete',
    jumpGo: 'Go',
    jumpHint: 'Use the arrows and OK. Back cancels.',
    sources: 'Sources',
    findingSources: 'Finding sources…',
    noSources: 'No sources found.',
    noSourcesQuality: 'No sources in this quality.',
    addonsNoAnswer: 'No answer from: {0}',
    tryingNextSource: 'Trying the next source…',
    noOtherSource: 'No other source to try',
    catalogsFailed: 'No catalog could be loaded. Check the connection and your addons.',
    playBest: 'Best source',
    directedBy: 'Directed by {0}',
    sourceLanguageRow: 'Audio: {0}',
    bestAudioHint: 'Sources with {0} audio first. Subtitles are chosen later, in the player.',
    bestAudioAny: 'Any audio language. Subtitles are chosen later, in the player.',
    audioLanguageTitle: 'Audio language',
    audioLanguageSub:
      'Sources dubbed in this language come first. Subtitles are chosen later, in the player.',
    anyAudioLanguage: 'Any language',
    sourcesButton: 'All sources',
    seeDetails: 'See details',
    playingBest: 'Playing the best source: {0}',
    updateAvailable: 'StremCompat {0} is available. Update it in the Homebrew Channel.',
    updateNav: 'Update',
    updateTitle: 'StremCompat {0} is available',
    updateSub: 'It installs over this version and keeps your account and settings.',
    updateNow: 'Update now',
    updateLater: 'Later',
    updateStarting: 'Downloading the update…',
    updateProgress: 'Downloading the update… {0}%',
    updateInstalling: 'Installing the update. StremCompat will close and open again.',
    updateElsewhere: 'Could not update from here. Update StremCompat in the Homebrew Channel.',
    whatsNew:
      'Updated to StremCompat {0}: Nuvio profiles, a new side menu and Settings, and episodes, chapters and speed in the player.',
    lastStartStopped:
      'The last time, StremCompat stopped while starting (step {0}). If it happens again, mention this step in your report.',
    setupUseQuestion: 'How do you want to use StremCompat?',
    modeSimple: 'Simple',
    modeSimpleHint: 'Only the essentials in Settings and in the player. The best source in one press.',
    modeFull: 'Complete',
    modeFullHint: 'Every option, as before.',
    setupLookQuestion: 'Which look?',
    lookLight: 'Light',
    lookLightHint: 'No effects and smaller images. Best for webOS 3 and TVs with little memory.',
    setupSkip: 'Skip',
    setupHint: 'You can change this later in Settings.',
    uiModeLabel: 'How the app is used',
    uiLookLabel: 'Look',
    lookStandard: 'Standard',
    lookStandardHint: 'Recommended for most TVs. The look of earlier versions.',
    providerNuvio: 'Nuvio (experimental)',
    whoIsWatching: 'Who is watching?',
    profileNumber: 'Profile {0}',
    profileLocked: 'Protected with a PIN, not available in StremCompat yet',
    addProfile: 'Add profile',
    editProfile: 'Edit profile',
    profileName: 'Name',
    profileNameNeeded: 'Give the profile a name',
    profileNotSaved: 'Could not save the profile on Nuvio',
    profilesHint: 'OK chooses · Down edits the profile',
    profileEditHint: 'OK on the name opens the keyboard · Back returns',
    hideNewEpisodes: 'Hide from New episodes',
    newEpisodesHidden: 'This series no longer appears in New episodes',
    showHiddenNewEpisodes: 'Bring back series removed from New episodes',
    newEpisodesShown: '{0} series back in New episodes',
    save: 'Save',
    cancel: 'Cancel',
    saving: 'Saving…',
    nuvioProfile: 'Nuvio profile',
    profilesUnavailable: 'Could not read the Nuvio profiles',
    becauseYouWatched: 'Because you watched {0}',
    syncSiteNote: 'Copy addons and library between Stremio and Nuvio: addons-sync.vercel.app',
    recommendedSource: 'Likely the best choice',
    pressOkRetry: 'Press OK to try again',
    noConnection:
      "Can't reach Stremio. Check the TV's internet connection. If other apps work, turn off IPv6 in the TV's network settings. ({0})",
    noConnectionShort: 'No connection to Stremio',
    evNoNetwork: 'Stremio could not be reached',
    lastSource: 'Last source',
    continuePlayback: 'Continue playback',
    sameSource: 'The same source used previously',
    seeders: 'seeders',
    seedsTag: '{0} seeds',
    compatibilityCheck: 'Check compatibility: {0}',
    sourcePrepareFailed: 'Could not prepare this source. Please try again.',
    runtimeRestoring: 'Restoring the local service…',
    runtimeUnavailable: 'Could not restore the local service',
    interfaceGroup: 'Interface',
    interfaceLanguage: 'Interface language',
    english: 'English',
    portugueseBrazil: 'Português (Brasil)',
    maintenanceGroup: 'Recovery',
    reloadApp: 'Reload StremCompat',
    diagnostics: 'Diagnostics',
    diagLoading: 'Reading…',
    diagUnavailable: 'The local service did not answer',
    diagServer: 'Local server: {0} MB in use (JS {1} MB) · running for {2} min',
    diagTv: 'Television: {0} MB free of {1} MB · CPU load {2}',
    diagDisk: 'Storage: {0} MB free of {1} MB',
    diagStreaming: 'Streaming server: {0}',
    diagStreamFailed: 'not available ({0})',
    torrentsUnavailable:
      'The torrent engine is not available on this TV. Debrid and direct sources still work.',
    diagEngineReady: 'Ready, starts with the first torrent',
    torrentsNoRoom: 'Not enough free space on the TV for torrents. Debrid and direct sources still work.',
    assStyle: 'ASS subtitle styling (position, italic, colour)',
    diagOnUsb: 'on the USB drive',
    diagCache: 'cache {0} of {1} MB',
    clearTorrentCache: 'Clear torrent cache',
    torrentsOnUsb: 'Always keep torrents on the USB drive',
    cacheCleared: '{0} MB of torrent cache cleared',
    cacheInUse: 'A torrent is playing. Try again when it stops.',
    testConnection: 'Test connection',
    testingConnection: 'Testing the connection…',
    connectionLatency: 'Stremio answers in {0} ms',
    connectionSpeed: 'last source {0} Mbit/s ({1})',
    connectionFailed: 'Stremio did not answer ({0})',
    diagRunning: 'running',
    diagStopped: 'stopped',
    diagInterface: 'Interface: {0} MB of JS · Home on screen in {1} s · catalogs in {2} s',
    diagPeak: 'Since start: local server peak {0} MB · lowest TV free memory {1} MB',
    diagRemote: 'Remote: {0} ms typical · {1} ms slowest · {2} % of frames late',
    diagRecent: 'Recent problems:',
    diagNoProblems: 'No problems recorded since start',
    evMediaError: 'Source would not play',
    evSlowStart: 'Source was slow to start, retried',
    evPrepareFailed: 'Source could not be prepared',
    evPlayRejected: 'Playback was refused',
    evAddonDown: 'Addon did not answer',
    reloadingApp: 'Reloading StremCompat…',
    supportGroup: 'Support',
    supportCoffee: 'Buy me a coffee',
    supportText: 'StremCompat is free and made by one person. If it helps you, a coffee keeps it going. Scan the code with your phone:',
    preferredQuality: 'Preferred quality',
    qualityAsk: 'Ask',
    whichQuality: 'Which quality?',
    preferredLanguage: 'Audio language of sources',
    anyLanguage: 'Any',
    langFilter: 'Audio: {0}',
    langAll: 'All',
    langOther: 'Other',
    subsTag: 'SUBS',
    automatic: 'Automatic',
    subtitlesGroup: 'Subtitles',
    subtitleSize: 'Subtitle size',
    defaultLanguage: 'Default language',
    backupLanguage: 'Backup language',
    subtitleColor: 'Subtitle color',
    subtitleOutline: 'Subtitle outline',
    subtitleBackground: 'Subtitle background',
    embeddedSubtitles: 'Embedded subtitles',
    audioGroup: 'Audio',
    autoAudio: 'Select audio automatically',
    defaultAudio: 'Default audio language',
    playbackGroup: 'Playback',
    seekInterval: 'Seek interval',
    nextEpisode: 'Play next episode',
    backgroundTrailers: 'Background trailers',
    scrubPreview: 'Seek preview',
    addonsGroup: 'Addons',
    addonsHelp: 'Addons synchronized with your Stremio account',
    syncAddons: 'Sync addons now',
    syncShort: 'Sync',
    noAddons: 'No addons are installed in this account.',
    accountGroup: 'Account',
    signOut: 'Sign out',
    disabled: 'Disabled',
    enabled: 'Enabled',
    white: 'White',
    yellow: 'Yellow',
    cyan: 'Cyan',
    black: 'Black',
    none: 'None',
    solid: 'Solid',
    transparent: 'Transparent',
    extractRecommended: 'Extract (recommended)',
    tvNative: 'TV native',
    french: 'French',
    spanish: 'Spanish',
    italian: 'Italian',
    german: 'German',
    arabic: 'Arabic',
    russian: 'Russian',
    turkish: 'Turkish',
    polish: 'Polish',
    dutch: 'Dutch',
    swedish: 'Swedish',
    hebrew: 'Hebrew',
    hindi: 'Hindi',
    japanese: 'Japanese',
    korean: 'Korean',
    chinese: 'Chinese',
    connectedAccount: 'Connected account',
    freeAccount: 'Free account',
    nuvioAccountLabel: 'Nuvio account',
    premiumUntil: 'Premium until {0}',
    settingsHint: 'Press OK to edit · Left returns to the menu',
    settingsEditing: 'Left/Right changes · OK confirms · Back cancels',
    syncing: 'Syncing…',
    addonsUpdated: 'Addons updated',
    addonsCurrent: 'Addons are already up to date',
    signingOut: 'Signing out…',
    phoneSignIn: 'Sign in with your phone',
    scanCode: 'Scan the code with your camera',
    generatingCode: 'Generating code',
    emailSignIn: 'Or use your email',
    email: 'Email',
    password: 'Password',
    signIn: 'Sign in',
    qrUnavailable: 'QR unavailable — use email',
    waitingPhone: 'Waiting for your phone',
    usePhoneCode: 'Use the access code on your phone',
    enterCredentials: 'Enter your email and password',
    signingIn: 'Signing in',
    signInFailed: 'Could not sign in',
    accountNote: 'No account? Create one for free at stremio.com/register or nuvio.tv',
    unofficialNote: 'Unofficial client. Not affiliated with Stremio, Nuvio or LG.',
    accountConnected: 'Account connected! Loading',
    genreAction: 'Action',
    genreComedy: 'Comedy',
    genreSciFi: 'Sci-Fi',
    genreDrama: 'Drama',
    genreHorror: 'Horror',
    player: {
      paused: 'Paused',
      nextEpisode: 'Next episode',
      playNext: 'Play next',
      playNextIn: 'Next episode in {0}',
      sourceFailed: 'This source could not be played',
      tryAnother: 'Try another source',
      failHint: 'OK: try another · Back: leave',
      countdownHint: 'OK: play now · Back: cancel',
      stillWatching: 'Are you still watching?',
      keepWatching: 'Continue watching',
      dismissHint: 'Up: select · Back: dismiss',
      liked: 'Liked this?',
      similar: 'Watch something similar',
      findSimilar: 'Find similar',
      playbackError: 'Playback error',
      retrying: 'Retrying this source…',
      resuming: 'Resuming from ',
      restartHint: 'OK: start over',
      fromStart: 'Playing from the start',
      nextLoading: 'Next episode…',
      moreLanguages: 'More languages',
      higher: 'Move up',
      lower: 'Move down',
      opacity: 'Opacity',
      episodes: 'Episodes',
      chapters: 'Chapters',
      files: 'Files in this torrent',
      picture: 'Picture',
      pictureFit: 'Whole picture',
      pictureZoom: 'Fill the screen',
      audioSubs: 'Audio and subtitles',
      sources: 'Sources',
      speed: 'Speed',
      speedRefused: 'This TV does not change the speed of this video',
      subtitlesReady: 'Subtitles ready',
      subtitleFailed: 'Subtitle extraction failed',
      nativeSubs: 'Native subtitles on',
      noNative: 'No native track — extracting…',
      preparingSubs: 'Preparing subtitles…',
      loadingSubtitle: 'Loading subtitles…',
      noHistoryOn: 'History is not being saved',
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
      tracksStillLoading: 'The file is still loading. Try again in a few seconds.',
      tryAgain: 'Try again',
      style: 'Style',
      delay: 'Delay',
      later: 'Later (+0.1s)',
      earlier: 'Earlier (-0.1s)',
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
    }
  },
  'pt-BR': {
    navSearch: 'Buscar',
    navHome: 'Início',
    navDiscover: 'Descobrir',
    navLibrary: 'Biblioteca',
    navAddons: 'Addons',
    navSettings: 'Ajustes',
    searchPlaceholder: 'Buscar filmes e séries',
    searchHint: 'Digite pelo teclado; os resultados aparecem enquanto você digita',
    searching: 'Buscando…',
    noResults: 'Nenhum resultado para “{0}”',
    movies: 'Filmes',
    series: 'Séries',
    anime: 'Anime',
    movie: 'Filme',
    seriesOne: 'Série',
    other: 'Outras',
    all: 'Todas',
    recent: 'Recente',
    recentSearches: 'Buscas recentes',
    seeAll: 'Ver tudo ›',
    seeAllHint: 'Abrir o catálogo completo em Descobrir',
    keySpace: 'espaço',
    keyDelete: 'apagar',
    keyClear: 'limpar',
    clearHistory: 'Limpar histórico',
    removeFromCw: 'Remover de Continuar assistindo',
    exitTitle: 'Sair do StremCompat?',
    exitSub: 'Escolha uma opção',
    exitStay: 'Continuar no app',
    exitLeave: 'Sair do app',
    removedFromCw: 'Removido de Continuar assistindo',
    torrentsNeedServer:
      'Esta TV não roda torrents sozinha. Defina um servidor em Configurações > Servidor de streaming.',
    serverAddress: 'Endereço',
    serverHere: 'Esta TV',
    serverTitle: 'Endereço do servidor de streaming',
    serverHint: 'Usado para torrents. Exemplo: 192.168.0.10:11470',
    serverDelete: 'Apagar',
    serverClear: 'Limpar',
    serverUseTv: 'Usar esta TV',
    serverSave: 'Testar e salvar',
    serverTesting: 'Testando a conexão…',
    serverSaved: 'Servidor de streaming salvo',
    serverLocal: 'Usando o servidor desta TV',
    serverInvalid: 'Confira o endereço',
    serverUnreachable: 'Nenhum servidor de streaming respondeu nesse endereço',
    serverDisk: 'Não foi possível salvar o endereço',
    historyGroup: 'Histórico',
    noHistory: 'Não salvar histórico',
    clearSearches: 'Limpar buscas recentes',
    clearCw: 'Limpar Continuar assistindo',
    confirmAgain: 'Pressione OK de novo para confirmar',
    searchesCleared: 'Buscas recentes apagadas',
    cwCleared: 'Continuar assistindo limpo ({0})',
    nothingToClear: 'Nada para limpar',
    holdOkHint: 'Dica: segure OK em um título para mais opções',
    discoverTitle: 'Descobrir',
    popular: 'Populares',
    topRated: 'Mais bem avaliados',
    allGenres: 'Todos os gêneros',
    popularMovies: 'Populares · Filmes',
    popularSeries: 'Populares · Séries',
    topMovies: 'Mais bem avaliados · Filmes',
    topSeries: 'Mais bem avaliadas · Séries',
    trendingMovies: 'Em alta · Filmes',
    trendingSeries: 'Em alta · Séries',
    continueWatching: 'Continuar assistindo',
    myList: 'Minha lista',
    newEpisodes: 'Novos episódios',
    newEpisodeTag: 'Novo · T{0} E{1}',
    cwUpNext: 'Próximo · T{0} E{1}',
    cwEpisode: 'T{0} E{1}',
    cwLeft: 'faltam {0} min',
    badgeSoon: 'Em breve',
    badgeNew: 'Novo',
    emptyLibraryTitle: 'Sua biblioteca está vazia',
    emptyLibraryHint: 'Segure OK em qualquer título e escolha Adicionar à Biblioteca.',
    nothingFoundHint: 'Tente outro catálogo ou gênero.',
    similarEmptyHint: 'Este título ainda não tem sugestões parecidas.',
    noResultsHint: 'Tente outro nome, menos palavras ou o título original.',
    interfaceTextSize: 'Texto da interface',
    textNormal: 'Normal',
    textLarge: 'Maior',
    loadingTrailer: 'Carregando trailer…',
    trailerUnavailable: 'Trailer indisponível',
    trailerInYoutube: 'Abrindo o trailer no app do YouTube',
    noTrailer: 'Trailer indisponível',
    continueLabel: 'Continuar',
    continueEpisode: 'Continuar T{0} E{1}',
    playEpisode: 'Assistir T{0} E{1}',
    watch: 'Assistir',
    details: 'Detalhes',
    similarTitles: 'Ver títulos parecidos',
    trailer: 'Trailer',
    markWatched: 'Marcar como assistido',
    markedWatched: 'Marcado como assistido',
    removeLibrary: 'Remover da Biblioteca',
    addLibrary: 'Adicionar à Biblioteca',
    removedLibrary: 'Removido da Biblioteca',
    addedLibrary: 'Adicionado à Biblioteca',
    inLibrary: 'Na Biblioteca',
    libraryButton: 'Biblioteca',
    similar: 'Parecidos',
    similarTo: 'Parecidos com {0}',
    findingSimilar: 'Buscando títulos parecidos…',
    nothingFound: 'Nada encontrado.',
    couldNotLoad: 'Não foi possível carregar o título',
    specials: 'Especiais',
    season: 'Temporada {0}',
    episode: 'Episódio {0}',
    seasonEpisode: 'Temporada {0} · Episódio {1}',
    absoluteEpisode: 'Episódio geral {0}',
    seasonAbsoluteEpisode: 'Temporada {0} · Episódio {1} · Episódio geral {2}',
    seasonOrder: 'Por temporada',
    continuousOrder: 'Ordem contínua',
    previous: 'Anterior',
    next: 'Próximo',
    episodeRange: 'Episódios {0}–{1}',
    goToEpisode: 'Ir para episódio',
    episodeNumberPrompt: 'Digite o número geral do episódio',
    episodeNotFound: 'Episódio não encontrado',
    jumpDelete: 'Apagar',
    jumpGo: 'Ir',
    jumpHint: 'Use as setas e OK. Voltar cancela.',
    sources: 'Fontes',
    findingSources: 'Buscando fontes…',
    noSources: 'Nenhuma fonte encontrada.',
    noSourcesQuality: 'Nenhuma fonte nesta qualidade.',
    addonsNoAnswer: 'Sem resposta de: {0}',
    tryingNextSource: 'Tentando a próxima fonte…',
    noOtherSource: 'Não há outra fonte para tentar',
    catalogsFailed: 'Nenhum catálogo pôde ser carregado. Verifique a conexão e seus addons.',
    playBest: 'Melhor fonte',
    directedBy: 'Direção: {0}',
    sourceLanguageRow: 'Áudio: {0}',
    bestAudioHint: 'Fontes com áudio em {0} primeiro. A legenda você escolhe depois, no player.',
    bestAudioAny: 'Qualquer idioma de áudio. A legenda você escolhe depois, no player.',
    audioLanguageTitle: 'Idioma do áudio',
    audioLanguageSub: 'Fontes dubladas nesse idioma vêm primeiro. A legenda você escolhe depois, no player.',
    anyAudioLanguage: 'Qualquer idioma',
    sourcesButton: 'Todas as fontes',
    seeDetails: 'Ver detalhes',
    playingBest: 'Tocando a melhor fonte: {0}',
    updateAvailable: 'StremCompat {0} disponível. Atualize pelo Homebrew Channel.',
    updateNav: 'Atualizar',
    updateTitle: 'O StremCompat {0} está disponível',
    updateSub: 'Ele é instalado por cima desta versão e mantém sua conta e seus ajustes.',
    updateNow: 'Atualizar agora',
    updateLater: 'Depois',
    updateStarting: 'Baixando a atualização…',
    updateProgress: 'Baixando a atualização… {0}%',
    updateInstalling: 'Instalando a atualização. O StremCompat vai fechar e abrir de novo.',
    updateElsewhere: 'Não foi possível atualizar por aqui. Atualize o StremCompat no Homebrew Channel.',
    whatsNew:
      'Atualizado para o StremCompat {0}: perfis do Nuvio, novo menu lateral e Ajustes, e episódios, capítulos e velocidade no player.',
    lastStartStopped:
      'Da última vez, o StremCompat parou enquanto abria (etapa {0}). Se acontecer de novo, cite essa etapa no seu relato.',
    setupUseQuestion: 'Como você quer usar o StremCompat?',
    modeSimple: 'Simples',
    modeSimpleHint: 'Só o essencial nas configurações e no player. A melhor fonte em um botão.',
    modeFull: 'Completo',
    modeFullHint: 'Todas as opções, como até agora.',
    setupLookQuestion: 'Qual visual?',
    lookLight: 'Leve',
    lookLightHint: 'Sem efeitos e com imagens menores. Melhor para webOS 3 e TVs com pouca memória.',
    setupSkip: 'Pular',
    setupHint: 'Dá para mudar depois em Configurações.',
    uiModeLabel: 'Modo de uso',
    uiLookLabel: 'Visual',
    lookStandard: 'Padrão',
    lookStandardHint: 'Recomendado para a maioria das TVs. O visual das versões anteriores.',
    providerNuvio: 'Nuvio (experimental)',
    whoIsWatching: 'Quem está assistindo?',
    profileNumber: 'Perfil {0}',
    profileLocked: 'Protegido por PIN, ainda não disponível no StremCompat',
    addProfile: 'Adicionar perfil',
    editProfile: 'Editar perfil',
    profileName: 'Nome',
    profileNameNeeded: 'Dê um nome ao perfil',
    profileNotSaved: 'Não foi possível salvar o perfil no Nuvio',
    profilesHint: 'OK escolhe · Para baixo edita o perfil',
    profileEditHint: 'OK no nome abre o teclado · Voltar retorna',
    hideNewEpisodes: 'Não mostrar em Novos episódios',
    newEpisodesHidden: 'Esta série não aparece mais em Novos episódios',
    showHiddenNewEpisodes: 'Trazer de volta séries tiradas de Novos episódios',
    newEpisodesShown: '{0} série(s) de volta em Novos episódios',
    save: 'Salvar',
    cancel: 'Cancelar',
    saving: 'Salvando…',
    nuvioProfile: 'Perfil do Nuvio',
    profilesUnavailable: 'Não foi possível ler os perfis do Nuvio',
    becauseYouWatched: 'Porque você assistiu {0}',
    syncSiteNote: 'Copie addons e biblioteca entre Stremio e Nuvio: addons-sync.vercel.app',
    recommendedSource: 'Provável melhor opção',
    pressOkRetry: 'Pressione OK para tentar de novo',
    noConnection:
      'Não foi possível conectar ao Stremio. Verifique a internet da TV. Se outros apps funcionam, desative o IPv6 nas configurações de rede da TV. ({0})',
    noConnectionShort: 'Sem conexão com o Stremio',
    evNoNetwork: 'O Stremio não pôde ser alcançado',
    lastSource: 'Última fonte',
    continuePlayback: 'Continuar reprodução',
    sameSource: 'A mesma fonte usada anteriormente',
    seeders: 'seeders',
    seedsTag: '{0} seeds',
    compatibilityCheck: 'Verifique a compatibilidade: {0}',
    sourcePrepareFailed: 'Não foi possível preparar esta fonte. Tente novamente.',
    runtimeRestoring: 'Restaurando o serviço local…',
    runtimeUnavailable: 'Não foi possível restaurar o serviço local',
    interfaceGroup: 'Interface',
    interfaceLanguage: 'Idioma da interface',
    english: 'English',
    portugueseBrazil: 'Português (Brasil)',
    maintenanceGroup: 'Recuperação',
    reloadApp: 'Recarregar StremCompat',
    diagnostics: 'Diagnóstico',
    diagLoading: 'Lendo…',
    diagUnavailable: 'O serviço local não respondeu',
    diagServer: 'Servidor local: {0} MB em uso (JS {1} MB) · ativo há {2} min',
    diagTv: 'TV: {0} MB livres de {1} MB · carga da CPU {2}',
    diagDisk: 'Armazenamento: {0} MB livres de {1} MB',
    diagStreaming: 'Servidor de streaming: {0}',
    diagStreamFailed: 'indisponível ({0})',
    torrentsUnavailable:
      'O motor de torrents não está disponível nesta TV. Fontes debrid e diretas continuam funcionando.',
    diagEngineReady: 'Pronto, inicia com o primeiro torrent',
    torrentsNoRoom:
      'Não há espaço livre suficiente na TV para torrents. Fontes debrid e diretas continuam funcionando.',
    assStyle: 'Estilo das legendas ASS (posição, itálico, cor)',
    diagOnUsb: 'no pendrive',
    diagCache: 'cache {0} de {1} MB',
    clearTorrentCache: 'Limpar cache de torrents',
    torrentsOnUsb: 'Guardar torrents sempre no pen drive',
    cacheCleared: '{0} MB de cache de torrents apagados',
    cacheInUse: 'Um torrent está tocando. Tente de novo quando ele parar.',
    testConnection: 'Testar conexão',
    testingConnection: 'Testando a conexão…',
    connectionLatency: 'O Stremio responde em {0} ms',
    connectionSpeed: 'última fonte {0} Mbit/s ({1})',
    connectionFailed: 'O Stremio não respondeu ({0})',
    diagRunning: 'ativo',
    diagStopped: 'parado',
    diagInterface: 'Interface: {0} MB de JS · Início na tela em {1} s · catálogos em {2} s',
    diagPeak: 'Desde o início: pico do servidor local {0} MB · menor memória livre da TV {1} MB',
    diagRemote: 'Controle: {0} ms normalmente · {1} ms no pior caso · {2} % dos quadros atrasados',
    diagRecent: 'Problemas recentes:',
    diagNoProblems: 'Nenhum problema registrado desde o início',
    evMediaError: 'A fonte não reproduziu',
    evSlowStart: 'A fonte demorou a iniciar, tentou de novo',
    evPrepareFailed: 'A fonte não pôde ser preparada',
    evPlayRejected: 'A reprodução foi recusada',
    evAddonDown: 'O addon não respondeu',
    reloadingApp: 'Recarregando o StremCompat…',
    supportGroup: 'Apoiar',
    supportCoffee: 'Pague um café ao desenvolvedor',
    supportText: 'O StremCompat é gratuito e feito por uma pessoa só. Se ele te ajuda, um café ajuda a continuar. Aponte a câmera do celular para o código:',
    preferredQuality: 'Qualidade preferida',
    qualityAsk: 'Perguntar',
    whichQuality: 'Qual qualidade?',
    preferredLanguage: 'Idioma do áudio das fontes',
    anyLanguage: 'Qualquer',
    langFilter: 'Áudio: {0}',
    langAll: 'Todos',
    langOther: 'Outros',
    subsTag: 'LEG',
    automatic: 'Automática',
    subtitlesGroup: 'Legendas',
    subtitleSize: 'Tamanho da legenda',
    defaultLanguage: 'Idioma padrão',
    backupLanguage: 'Idioma de reserva',
    subtitleColor: 'Cor da legenda',
    subtitleOutline: 'Contorno da legenda',
    subtitleBackground: 'Fundo da legenda',
    embeddedSubtitles: 'Legendas incorporadas',
    audioGroup: 'Áudio',
    autoAudio: 'Selecionar áudio automaticamente',
    defaultAudio: 'Idioma de áudio padrão',
    playbackGroup: 'Reprodução',
    seekInterval: 'Intervalo de avanço',
    nextEpisode: 'Reproduzir próximo episódio',
    backgroundTrailers: 'Trailers em segundo plano',
    scrubPreview: 'Prévia ao avançar',
    addonsGroup: 'Addons',
    addonsHelp: 'Addons sincronizados com sua conta Stremio',
    syncAddons: 'Sincronizar addons agora',
    syncShort: 'Sincronizar',
    noAddons: 'Nenhum addon instalado nesta conta.',
    accountGroup: 'Conta',
    signOut: 'Sair',
    disabled: 'Desativado',
    enabled: 'Ativado',
    white: 'Branco',
    yellow: 'Amarelo',
    cyan: 'Ciano',
    black: 'Preto',
    none: 'Nenhum',
    solid: 'Sólido',
    transparent: 'Transparente',
    extractRecommended: 'Extrair (recomendado)',
    tvNative: 'Nativo da TV',
    french: 'Francês',
    spanish: 'Espanhol',
    italian: 'Italiano',
    german: 'Alemão',
    arabic: 'Árabe',
    russian: 'Russo',
    turkish: 'Turco',
    polish: 'Polonês',
    dutch: 'Holandês',
    swedish: 'Sueco',
    hebrew: 'Hebraico',
    hindi: 'Hindi',
    japanese: 'Japonês',
    korean: 'Coreano',
    chinese: 'Chinês',
    connectedAccount: 'Conta conectada',
    freeAccount: 'Conta gratuita',
    nuvioAccountLabel: 'Conta Nuvio',
    premiumUntil: 'Premium até {0}',
    settingsHint: 'Pressione OK para editar · esquerda volta ao menu',
    settingsEditing: 'Esquerda/direita altera · OK confirma · Voltar cancela',
    syncing: 'Sincronizando…',
    addonsUpdated: 'Addons atualizados',
    addonsCurrent: 'Addons já estão atualizados',
    signingOut: 'Saindo…',
    phoneSignIn: 'Entrar pelo celular',
    scanCode: 'Escaneie o código com a câmera',
    generatingCode: 'Gerando código',
    emailSignIn: 'Ou use seu e-mail',
    email: 'Email',
    password: 'Senha',
    signIn: 'Entrar',
    qrUnavailable: 'QR indisponível — use o e-mail',
    waitingPhone: 'Aguardando seu celular',
    usePhoneCode: 'Use o código de acesso pelo celular',
    enterCredentials: 'Digite e-mail e senha',
    signingIn: 'Entrando',
    signInFailed: 'Não foi possível entrar',
    accountNote: 'Não tem conta? Crie grátis em stremio.com/register ou nuvio.tv',
    unofficialNote: 'Cliente não oficial. Sem vínculo com o Stremio, o Nuvio ou a LG.',
    accountConnected: 'Conta conectada! Carregando',
    genreAction: 'Ação',
    genreComedy: 'Comédia',
    genreSciFi: 'Ficção científica',
    genreDrama: 'Drama',
    genreHorror: 'Terror',
    player: {
      paused: 'Pausado',
      nextEpisode: 'Próximo episódio',
      playNext: 'Reproduzir próximo',
      playNextIn: 'Próximo episódio em {0}',
      sourceFailed: 'Não foi possível reproduzir esta fonte',
      tryAnother: 'Tentar outra fonte',
      failHint: 'OK: tentar outra · Voltar: sair',
      countdownHint: 'OK: assistir agora · Voltar: cancelar',
      stillWatching: 'Você ainda está assistindo?',
      keepWatching: 'Continuar assistindo',
      dismissHint: 'Cima: selecionar · Voltar: fechar',
      liked: 'Gostou?',
      similar: 'Ver algo parecido',
      findSimilar: 'Encontrar parecidos',
      playbackError: 'Erro de reprodução',
      retrying: 'Tentando iniciar a fonte novamente…',
      resuming: 'Continuando de ',
      restartHint: 'OK: recomeçar',
      fromStart: 'Reproduzindo do início',
      nextLoading: 'Próximo episódio…',
      moreLanguages: 'Mais idiomas',
      higher: 'Mais para cima',
      lower: 'Mais para baixo',
      opacity: 'Opacidade',
      episodes: 'Episódios',
      chapters: 'Capítulos',
      files: 'Arquivos deste torrent',
      picture: 'Imagem',
      pictureFit: 'Imagem inteira',
      pictureZoom: 'Preencher a tela',
      audioSubs: 'Áudio e legendas',
      sources: 'Fontes',
      speed: 'Velocidade',
      speedRefused: 'Esta TV não muda a velocidade deste vídeo',
      subtitlesReady: 'Legendas prontas',
      subtitleFailed: 'Falha ao extrair legendas',
      nativeSubs: 'Legendas nativas ativadas',
      noNative: 'Faixa nativa indisponível — extraindo…',
      preparingSubs: 'Preparando legendas…',
      loadingSubtitle: 'Carregando legenda…',
      noHistoryOn: 'O histórico não está sendo salvo',
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
      tracksStillLoading: 'O arquivo ainda está carregando. Tente de novo em alguns segundos.',
      tryAgain: 'Tentar de novo',
      style: 'Estilo',
      delay: 'Atraso',
      later: 'Mais tarde (+0,1s)',
      earlier: 'Mais cedo (-0,1s)',
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
  }
};
/* in the language itself, whichever one the interface is in */
var UI_LANGUAGES = {
  'en-US': 'English',
  'pt-BR': 'Português (Brasil)',
  es: 'Español (España)',
  'es-419': 'Español (Latinoamérica)',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  ru: 'Русский',
  ko: '한국어'
};
function normalizeUILanguage(value) {
  return Object.prototype.hasOwnProperty.call(UI_LANGUAGES, value) ? value : 'en-US';
}
/* the TV's language, when the app has it */
function tvLanguage() {
  var full = String((typeof navigator !== 'undefined' && navigator.language) || '').toLowerCase(),
    base = full.split('-')[0];
  if (base === 'pt') return 'pt-BR';
  /* Spanish outside Spain is the Latin American one */
  if (base === 'es') return full === 'es' || full === 'es-es' ? 'es' : 'es-419';
  return base;
}
/* what the file does not have, or a file that cannot be read, falls back to English */
function loadUILanguage(code) {
  if (UI_TEXT[code]) return;
  try {
    var request = new XMLHttpRequest();
    request.open('GET', '/lang/' + code + '.json', false);
    request.send();
    if (request.status === 200) UI_TEXT[code] = JSON.parse(request.responseText);
  } catch (e) {}
}
var UI_LANG = normalizeUILanguage(
  (function () {
    try {
      return localStorage.getItem(UI_LANG_KEY) || tvLanguage();
    } catch (e) {
      return tvLanguage();
    }
  })()
);
loadUILanguage(UI_LANG);
/* the language of audio and subtitles until the viewer picks one */
function defaultMediaLanguage() {
  return (
    { 'pt-BR': 'por', es: 'spa', 'es-419': 'spa', fr: 'fre', de: 'ger', it: 'ita', ru: 'rus', ko: 'kor' }[
      UI_LANG
    ] || 'eng'
  );
}
function tx(key) {
  var args = arguments,
    text = (UI_TEXT[UI_LANG] && UI_TEXT[UI_LANG][key]) || UI_TEXT['en-US'][key] || key;
  return String(text).replace(/\{(\d+)\}/g, function (all, index) {
    var at = parseInt(index, 10) + 1;
    return args[at] == null ? '' : String(args[at]);
  });
}
// When a title counts as finished, shared by the interface and the player.
/* As the official Stremio apps (stremio-core): finished once the position passes 90 %,
   where credits usually start. Continue Watching, the resume offer and the next episode
   all use this rule; the player marks a video watched at 70 % really played. */
var CREDITS_THRESHOLD = 0.9;
function watchFinished(offsetMs, durationMs) {
  return durationMs > 0 && offsetMs > durationMs * CREDITS_THRESHOLD;
}
// Which installed addons answer stream requests; shared by the interface and the player.
function addonBase(a) {
  return String(a.transportUrl || '').replace(/\/manifest\.json.*$/, '');
}
/* Whatever follows /manifest.json in the installed link (a ?key=... some addons give each
   user). Official Stremio replaces only /manifest.json when it builds a request, so the
   query string reaches every catalog, meta and stream request (stremio-core
   http_transport.rs); dropping it made such addons answer nothing here. */
function addonQuery(a) {
  var m = String((a && a.transportUrl) || '').match(/\/manifest\.json(\?[^#]*)/);
  return m ? m[1] : '';
}
/* The installed addons that answer `resource` ('stream', 'subtitles') for `type`, as Stremio
   picks them: the resource may be a name (manifest types apply) or an object with its own
   types and idPrefixes. With an `id`, idPrefixes are checked too (a subtitle addon for IMDb
   ids is not asked about a Kitsu episode). */
function addonsFor(a, resource, type, id) {
  var out = [];
  a = a || [];
  for (var i = 0; i < a.length; i++) {
    var m = a[i] && a[i].manifest;
    if (!m) continue;
    var res = m.resources || [],
      entry = null;
    for (var r = 0; r < res.length; r++) {
      var rr = res[r];
      if (rr === resource || (rr && rr.name === resource)) entry = rr;
    }
    if (!entry) continue;
    var types = m.types || [],
      own = typeof entry === 'object' ? entry.types || [] : null;
    /* the manifest types, or the resource object's own types; an object with no types
       means "any type" */
    if (types.length && types.indexOf(type) < 0 && !(own && (!own.length || own.indexOf(type) >= 0)))
      continue;
    var prefixes = (typeof entry === 'object' && entry.idPrefixes) || m.idPrefixes;
    if (id && prefixes && prefixes.length) {
      var okId = false;
      for (var p = 0; p < prefixes.length; p++) if (String(id).indexOf(prefixes[p]) === 0) okId = true;
      if (!okId) continue;
    }
    out.push({ name: m.name || 'Addon', base: addonBase(a[i]), query: addonQuery(a[i]) });
  }
  return out;
}
function streamAddonsIn(a, type) {
  return addonsFor(a, 'stream', type);
}
/* <base>/<resource>/<type>/<id>[/<extra>].json<query>, extra as Stremio encodes it:
   videoHash=..&videoSize=..&filename=.. */
function addonResourceUrl(ad, resource, type, id, extra) {
  var parts = [];
  for (var k in extra || {})
    if (Object.prototype.hasOwnProperty.call(extra, k) && extra[k] !== '' && extra[k] != null)
      parts.push(k + '=' + encodeURIComponent(extra[k]));
  return (
    ad.base +
    '/' +
    resource +
    '/' +
    type +
    '/' +
    encodeURIComponent(id) +
    (parts.length ? '/' + parts.join('&') : '') +
    '.json' +
    (ad.query || '')
  );
}
function streamUrl(ad, type, vid) {
  return addonResourceUrl(ad, 'stream', type, vid);
}
// Reading a source from an addon's answer and matching it across episodes; shared by the
// interface (source list) and the player (next episode).
function streamText(s) {
  return String(
    (s.name || '') +
      ' ' +
      (s.title || '') +
      ' ' +
      (s.description || '') +
      ' ' +
      ((s.behaviorHints && s.behaviorHints.filename) || '')
  );
}
function streamQuality(s) {
  var t = streamText(s).toLowerCase();
  if (/\b(2160p?|4k|uhd)\b/.test(t)) return '4K';
  if (/\b(1440p?|2k|qhd)\b/.test(t)) return '1440p';
  if (/\b(1080p?|fhd)\b/.test(t)) return '1080p';
  if (/\b720p?\b/.test(t)) return '720p';
  if (/\b(576p?|540p?|480p?|360p?|sd)\b/.test(t)) return 'SD';
  return 'Other';
}
function streamSeeders(s) {
  var t = streamText(s),
    m;
  m = t.match(/(?:seeders?|seeds?)\s*[:\-]?\s*(\d+)/i);
  if (m) return parseInt(m[1], 10) || 0;
  m = t.match(/(\d+)\s*(?:seeders?|seeds?)/i);
  if (m) return parseInt(m[1], 10) || 0;
  m = t.match(/(?:\uD83D\uDC65|\uD83D\uDC64)\s*(\d+)/);
  if (m) return parseInt(m[1], 10) || 0;
  return -1;
}
/* Filename/title hints are advisory: addons do not expose a reliable codec schema.
   Only AV1 and Dolby Vision without an advertised HDR fallback affect ordering;
   audio and 10-bit hints remain visible without hiding a potentially playable source. */
function streamCompatibility(s) {
  var t = streamText(s).toLowerCase(),
    labels = [],
    rank = 0;
  function add(label) {
    for (var i = 0; i < labels.length; i++) if (labels[i] === label) return;
    labels.push(label);
  }
  if (/\b(av1|av01)\b/.test(t)) {
    add('AV1');
    rank = 3;
  }
  var dv = /(dolby[ ._-]?vision|\bdovi\b|\bdv\b)/.test(t);
  if (dv) {
    add('Dolby Vision');
    if (!/(hdr10\+?|\bhdr\b)/.test(t)) rank = Math.max(rank, 2);
  }
  if (/\b(hevc|h[ ._-]?265|x265)\b/.test(t) && /\b(10[ ._-]?bit|main[ ._-]?10)\b/.test(t)) add('HEVC 10-bit');
  if (/\b(true[ ._-]?hd)\b/.test(t)) add('TrueHD');
  else if (/\b(dts[ ._-]?hd|dts)\b/.test(t)) add('DTS');
  if (/\b(e[ ._-]?ac[ ._-]?3|eac3|ddp|dd\+)\b/.test(t)) add('E-AC-3');
  /* A link or torrent file that is a .rar/.zip/.7z archive cannot play: the TV would have to
     unpack it. Only a real file extension counts ("RARBG" is a release group), and such a
     source is moved to the end and never recommended rather than hidden. */
  var file = (
      String(s.filename || '') +
      ' ' +
      String(s.url || '').replace(/[?#].*$/, '') +
      ' ' +
      t
    ).toLowerCase(),
    archive = file.match(/\.(rar|zip|7z)(?![a-z0-9])/);
  if (archive) {
    add(archive[1].toUpperCase());
    rank = Math.max(rank, 4);
  }
  return { labels: labels, rank: rank };
}
/* ---- audio languages of a source, read once when the addon answers (fetchStreams) ----
   From country flags (addons such as Torrentio list them) and the usual release words.
   Codes are pt-BR, pt, es-419 (Latin American Spanish), es, en, fr, it, de, ja, ko, ru,
   hi, plus 'multi' for multi or dual audio. */
var FLAG_LANG = {
  BR: 'pt-BR',
  PT: 'pt',
  ES: 'es',
  MX: 'es-419',
  AR: 'es-419',
  CO: 'es-419',
  CL: 'es-419',
  PE: 'es-419',
  VE: 'es-419',
  UY: 'es-419',
  US: 'en',
  GB: 'en',
  FR: 'fr',
  IT: 'it',
  DE: 'de',
  JP: 'ja',
  KR: 'ko',
  RU: 'ru',
  IN: 'hi'
};
var WORD_LANG = [
  ['pt-BR', /\b(dublado|pt[ ._-]?br|brazilian)\b/],
  ['pt', /\b(portugu[eê]se?|portugu[eê]s)\b/],
  ['es-419', /\b(latino|latam)\b/],
  ['es', /\b(castellano|spanish|espa[nñ]ol)\b/],
  ['en', /\b(english|eng)\b/],
  ['fr', /\b(french|truefrench|vff|vf2?)\b/],
  ['it', /\b(ita|italian|italiano)\b/],
  ['de', /\b(german|deutsch)\b/],
  ['ja', /\b(japanese|jpn)\b/],
  ['ko', /\b(korean)\b/],
  ['ru', /\b(russian|rus)\b/],
  ['hi', /\b(hindi)\b/],
  ['multi', /\b(multi|dual)\b/]
];
function streamLanguages(s) {
  var t = streamText(s),
    low = t.toLowerCase(),
    out = [],
    flag = /\uD83C([\uDDE6-\uDDFF])\uD83C([\uDDE6-\uDDFF])/g,
    m,
    i;
  function add(code) {
    if (out.indexOf(code) < 0) out.push(code);
  }
  while ((m = flag.exec(t))) {
    var cc = String.fromCharCode(m[1].charCodeAt(0) - 0xdde6 + 65, m[2].charCodeAt(0) - 0xdde6 + 65);
    if (FLAG_LANG[cc]) add(FLAG_LANG[cc]);
  }
  for (i = 0; i < WORD_LANG.length; i++) if (WORD_LANG[i][1].test(low)) add(WORD_LANG[i][0]);
  /* "dublado" or a Brazilian flag says more than a plain "portuguese" */
  if (out.indexOf('pt-BR') >= 0 && out.indexOf('pt') >= 0) out.splice(out.indexOf('pt'), 1);
  if (out.indexOf('es-419') >= 0 && out.indexOf('es') >= 0) out.splice(out.indexOf('es'), 1);
  return out;
}
/* "Multi Subs" releases (anime above all) list their SUBTITLE languages with flags. The
   detected languages stay the same for the filter and the preferred-language order; only
   the tag says they are subtitles. */
function subtitleLanguagesOnly(s) {
  var low = streamText(s).toLowerCase();
  return /\bmulti[ ._-]?subs?\b/.test(low) && !/\b(multi[ ._-]?audio|dual|dublado|dubbed|dub)\b/.test(low);
}
function langBase(code) {
  return String(code).split('-')[0];
}
/* the trackers an addon names go along with the address, for the engine to find peers */
function torrentTrackers(s) {
  var out = [];
  for (var i = 0; s.sources && i < s.sources.length && out.length < 12; i++) {
    var m = /^tracker:(.+)$/.exec(s.sources[i]);
    if (m) out.push('tr=' + encodeURIComponent(m[1]));
  }
  return out.length ? '?' + out.join('&') : '';
}
/* the addon's stream as the interface and the player use it; null when it cannot be played */
/* addonBase tells apart two installations of an addon with the same name */
function sourceItem(s, addonName, addonBase) {
  var url = s.url,
    h = s.behaviorHints || {};
  if (!url && s.infoHash)
    url = 'http://127.0.0.1:11470/' + s.infoHash + '/' + (s.fileIdx || 0) + torrentTrackers(s);
  if (!url) return null;
  var item = {
    addon: addonName,
    addonBase: addonBase || '',
    name: s.name || '',
    title: s.title || s.description || '',
    url: url,
    quality: streamQuality(s),
    seeders: streamSeeders(s),
    filename: h.filename || '',
    bingeGroup: h.bingeGroup || '',
    notWebReady: !!h.notWebReady,
    headers: (h.proxyHeaders && h.proxyHeaders.request) || null
  };
  item.langs = streamLanguages(s);
  item.subLangsOnly = item.langs.length > 0 && subtitleLanguagesOnly(s);
  var compat = streamCompatibility(item);
  item.compatLabels = compat.labels;
  item.compatRank = compat.rank;
  return item;
}
/* what the local server keeps for a source it is about to play (server/stream-refs.js) */
function streamRefBody(s) {
  return {
    url: s.url,
    addon: s.addon || '',
    addonBase: s.addonBase || '',
    name: s.name || '',
    title: s.title || '',
    filename: s.filename || '',
    bingeGroup: s.bingeGroup || '',
    quality: s.quality || '',
    compat: (s.compatLabels || []).join(','),
    notWebReady: !!s.notWebReady,
    headers: s.headers || null,
    meta: s.meta || null
  };
}
function sourceTraits(value) {
  var t = String(value || '').toLowerCase(),
    out = [];
  var tests = [
    ['hevc', /\b(hevc|x265|h[ ._-]?265)\b/],
    ['h264', /\b(x264|h[ ._-]?264|avc)\b/],
    ['dv', /(dolby[ ._-]?vision|\bdovi\b|\bdv\b)/],
    ['hdr10p', /hdr10\+/],
    ['hdr', /\bhdr\b/],
    ['10bit', /\b(10[ ._-]?bit|main[ ._-]?10)\b/],
    ['eac3', /\b(eac3|e[ ._-]?ac[ ._-]?3|ddp|dd\+)\b/],
    ['ac3', /\b(ac3|dolby[ ._-]?digital)\b/],
    ['aac', /\baac\b/],
    ['dts', /\bdts\b/],
    ['atmos', /\batmos\b/],
    ['webdl', /web[ ._-]?dl/],
    ['bluray', /blu[ ._-]?ray|bdrip/]
  ];
  for (var i = 0; i < tests.length; i++) if (tests[i][1].test(t)) out.push(tests[i][0]);
  return out;
}
/* How well a source keeps the audio language being watched; -1000 rules it out. A release
   with a named language must not become another one, and an unnamed one may be the original
   audio, so changing a dub for it is left to the viewer. Older saved preferences have no
   language and are not judged. */
function nextLanguageFit(wanted, s) {
  if (!wanted) return 0;
  var have = s.subLangsOnly ? [] : s.langs || [],
    named = [],
    score = 0,
    i;
  for (i = 0; i < wanted.length; i++) if (wanted[i] !== 'multi') named.push(wanted[i]);
  if (!named.length) {
    if (wanted.length) return have.indexOf('multi') >= 0 ? 40 : 0;
    /* nothing named in the episode being watched: prefer sources that name nothing either */
    return have.length ? -15 : 0;
  }
  for (i = 0; i < named.length; i++) {
    if (have.indexOf(named[i]) >= 0) score += 40;
    else
      for (var h = 0; h < have.length; h++)
        if (langBase(have[h]) === langBase(named[i])) {
          score += 25;
          break;
        }
  }
  if (score) return score;
  return have.indexOf('multi') >= 0 ? 5 : -1000;
}
/* The source to carry on with: the addon's own marker for "same release" (bingeGroup, as the
   official apps use it) settles it; without one, the same addon and quality, then the closest
   release. Null when nothing fits, so the viewer chooses from the list. */
function matchingNextSource(items, pref) {
  if (!pref || !pref.addon) return null;
  var wanted = sourceTraits((pref.text || '') + ' ' + (pref.compat || '')),
    best = null,
    bestScore = -9999,
    i,
    s;
  if (pref.binge)
    for (i = 0; i < items.length; i++)
      if (!items[i].stored && items[i].addon === pref.addon && items[i].bingeGroup === pref.binge)
        return items[i];
  if (!pref.quality) return null;
  for (i = 0; i < items.length; i++) {
    s = items[i];
    /* an archive cannot play (streamCompatibility) */
    if (s.stored || s.addon !== pref.addon || s.quality !== pref.quality || s.compatRank >= 4) continue;
    var fit = nextLanguageFit(pref.langs, s);
    if (fit <= -1000) continue;
    var traits = sourceTraits(streamText(s) + ' ' + (s.compatLabels || []).join(' ')),
      score = fit;
    for (var w = 0; w < wanted.length; w++) if (traits.indexOf(wanted[w]) >= 0) score += 12;
    score -= (s.compatRank || 0) * 20;
    if (s.seeders > 0) score += Math.min(15, Math.floor(Math.log(s.seeders + 1) / Math.LN2));
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}
// Applying the interface language to the static markup and switching it.
function applyTextSize() {
  if (lsRaw('uiTextSize', 'normal') === 'large') bodyAdd('bigtext');
  else bodyRemove('bigtext');
}
/* drawn before the icon set (artwork.js) is loaded */
var GLOBE_ICON =
  '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm6.9 6h-2.9a15.7 15.7 0 00-1.4-3.6A8 8 0 0118.9 8zM12 4c.8 1.2 1.5 2.5 1.9 4h-3.8c.4-1.5 1.1-2.8 1.9-4zM4.3 14a8.2 8.2 0 010-4h3.4a16.5 16.5 0 000 4H4.3zm.8 2h2.9c.3 1.3.8 2.5 1.4 3.6A8 8 0 015.1 16zM8 8H5.1a8 8 0 014.3-3.6C8.8 5.5 8.4 6.7 8 8zm4 12c-.8-1.2-1.5-2.5-1.9-4h3.8c-.4 1.5-1.1 2.8-1.9 4zm2.3-6H9.7a14.7 14.7 0 010-4h4.6a14.7 14.7 0 010 4zm.3 5.6c.6-1.1 1.1-2.3 1.4-3.6h2.9a8 8 0 01-4.3 3.6zm1.7-5.6a16.5 16.5 0 000-4h3.4a8.2 8.2 0 010 4h-3.4z"/></svg>';
function uiLanguageLabel(code) {
  return UI_LANGUAGES[code];
}
function applyStaticLanguage() {
  var navPairs = {
    chipSearch: 'navSearch',
    chipHome: 'navHome',
    chipDisc: 'navDiscover',
    chipLib: 'navLibrary',
    chipAddons: 'navAddons',
    chipSet: 'navSettings',
    chipUpdate: 'updateNav',
    chipExit: 'exitLeave'
  };
  for (var nid in navPairs)
    if (Object.prototype.hasOwnProperty.call(navPairs, nid) && $(nid)) {
      var labels = $(nid).getElementsByClassName('navlabel');
      if (labels.length) labels[0].textContent = tx(navPairs[nid]);
    }
  var pairs = {
    sHint: 'searchHint',
    setHint: 'settingsHint',
    setTitle: 'navSettings',
    discTitle: 'discoverTitle',
    lgAccount: 'accountNote',
    lgNote: 'unofficialNote',
    lgSync: 'syncSiteNote',
    lgQrTitle: 'phoneSignIn',
    lgQrHelp: 'scanCode',
    lgEmailTitle: 'emailSignIn',
    lgBtn: 'signIn',
    streamsTitle: 'sources',
    aTitle: 'addonsGroup',
    aHelp: 'addonsHelp',
    aSync: 'syncShort'
  };
  for (var id in pairs)
    if (Object.prototype.hasOwnProperty.call(pairs, id) && $(id)) $(id).textContent = tx(pairs[id]);
  if ($('sBox')) $('sBox').setAttribute('placeholder', tx('searchPlaceholder'));
  if ($('lgEmail')) $('lgEmail').setAttribute('placeholder', tx('email'));
  if ($('lgPass')) $('lgPass').setAttribute('placeholder', tx('password'));
  if ($('lgLang')) $('lgLang').innerHTML = GLOBE_ICON + '<span>' + esc(uiLanguageLabel(UI_LANG)) + '</span>';
}
function setUILanguage(value) {
  var next = normalizeUILanguage(value);
  loadUILanguage(next);
  UI_LANG = next;
  lsRawSet(UI_LANG_KEY, next);
  applyStaticLanguage();
  try {
    invalidateBoards();
  } catch (e) {}
  return next;
}
window.__SC_UI_LANGUAGE__ = function () {
  return UI_LANG;
};
window.__SC_SET_UI_LANGUAGE__ = setUILanguage;
applyStaticLanguage();
if ($('lgStat')) $('lgStat').textContent = tx('generatingCode');
// HTML escaping, time formatting and the toast notification.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
var toastT = null;
function toast(m, ms) {
  var t = $('toast');
  t.textContent = m;
  t.style.opacity = '1';
  if (toastT) clearTimeout(toastT);
  toastT = setTimeout(function () {
    t.style.opacity = '0';
  }, ms || 2800);
}
// Client diagnostics (/log) and recovery of the local Node service after Quick Start+.
function clientDiag(event, data) {
  try {
    var q = [
      'ev=' + encodeURIComponent(String(event || 'shell')),
      'screen=' + encodeURIComponent(String(SCR || ''))
    ];
    data = data || {};
    for (var k in data)
      if (Object.prototype.hasOwnProperty.call(data, k) && data[k] != null)
        q.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(data[k]).slice(0, 160)));
    var im = new Image();
    im.src = '/log?' + q.join('&') + '&_=' + Date.now();
  } catch (e) {}
}
var runtimeRecovering = false;
function runtimePing(cb) {
  var done = false;
  function finish(ok) {
    if (done) return;
    done = true;
    cb(ok);
  }
  try {
    var x = new XMLHttpRequest();
    x.open('GET', '/health?resume=' + Date.now(), true);
    x.onreadystatechange = function () {
      if (x.readyState === 4) finish(x.status >= 200 && x.status < 300);
    };
    x.timeout = 900;
    x.ontimeout = function () {
      finish(false);
    };
    x.onerror = function () {
      finish(false);
    };
    x.send();
    setTimeout(function () {
      finish(false);
    }, 1100);
  } catch (e) {
    finish(false);
  }
}
function runtimeStart(cb) {
  startService(TV_PROFILE.serviceId, cb);
}
function runtimeRecover() {
  if (runtimeRecovering) return;
  runtimeRecovering = true;
  runtimePing(function (up) {
    if (up) {
      runtimeRecovering = false;
      clientDiag('resume_ok', {});
      return;
    }
    toast(tx('runtimeRestoring'));
    clientDiag('resume_restart', {});
    runtimeStart(function () {
      var tries = 0;
      function check() {
        runtimePing(function (ok) {
          if (ok) {
            clientDiag('resume_recovered', { tries: tries });
            location.reload();
            return;
          }
          tries++;
          if (tries < 20) {
            setTimeout(check, 500);
            return;
          }
          runtimeRecovering = false;
          toast(tx('runtimeUnavailable'));
          clientDiag('resume_failed', { tries: tries });
        });
      }
      check();
    });
  });
}
window.__SC_RESUME_CHECK__ = runtimeRecover;
function reloadUi() {
  var url = appUrl('/beta?recover=' + Date.now());
  try {
    location.replace(url);
  } catch (e) {
    try {
      location.reload();
    } catch (ignore) {
      runtimeRecovering = false;
    }
  }
}
function clearTemporaryUiState() {
  var keys = storageKeys(),
    kill = [],
    i;
  stopIdleTrailer();
  try {
    if (disc && disc.request && disc.request.abort) disc.request.abort();
    if (disc) {
      disc.gen++;
      disc.request = null;
      disc.loading = false;
    }
  } catch (e) {}
  try {
    if (search && search.requests) {
      for (i = 0; i < search.requests.length; i++)
        if (search.requests[i] && search.requests[i].abort) search.requests[i].abort();
      search.requests = [];
      search.gen++;
    }
  } catch (e) {}
  metaMem = {};
  metaMemOrder = [];
  warmed = {};
  warmedN = 0;
  for (i = 0; i < keys.length; i++)
    if (
      keys[i].indexOf('beta_cat_') === 0 ||
      keys[i].indexOf('beta_meta_') === 0 ||
      keys[i].indexOf('beta_discover_v3_') === 0
    )
      kill.push(keys[i]);
  for (i = 0; i < kill.length; i++)
    try {
      localStorage.removeItem(kill[i]);
    } catch (ignore) {}
}
function manualRecover() {
  if (runtimeRecovering) return;
  runtimeRecovering = true;
  toast(tx('reloadingApp'));
  clientDiag('manual_reload', { reason: 'settings' });
  clearTemporaryUiState();
  runtimePing(function (up) {
    if (up) {
      setTimeout(reloadUi, 80);
      return;
    }
    clientDiag('manual_restart', {});
    runtimeStart(function () {
      var tries = 0;
      function check() {
        runtimePing(function (ok) {
          if (ok) {
            clientDiag('manual_recovered', { tries: tries });
            reloadUi();
            return;
          }
          tries++;
          if (tries < 20) {
            setTimeout(check, 500);
            return;
          }
          runtimeRecovering = false;
          toast(tx('runtimeUnavailable'));
          clientDiag('manual_failed', { tries: tries });
        });
      }
      check();
    });
  });
}
window.__SC_MANUAL_RECOVER__ = manualRecover;
// How fast the screen answers the remote, measured on the TV itself for Diagnostics: the time
// from a key to the frame that shows its result, and frames that came late while keys arrived.
var smooth = { waits: [], late: 0, frames: 0 };
function keyAnswered(started) {
  if (!window.requestAnimationFrame) return;
  /* the frame after the next one is the first that can show what the key changed */
  requestAnimationFrame(function () {
    requestAnimationFrame(function (now) {
      var wait = Math.round((now || Date.now()) - started);
      if (wait < 0 || wait > 5000) return;
      smooth.waits.push(wait);
      if (smooth.waits.length > 60) smooth.waits.shift();
    });
  });
}
/* frames are watched only for a moment after each key, so an idle TV does no work */
var frameWatchUntil = 0,
  frameWatching = false;
function watchFrames() {
  frameWatchUntil = Date.now() + 1500;
  if (frameWatching || !window.requestAnimationFrame) return;
  frameWatching = true;
  var last = 0;
  function tick(now) {
    now = now || Date.now();
    if (last) {
      smooth.frames++;
      if (now - last > 50) smooth.late += Math.min(10, Math.round((now - last) / 16.7) - 1);
    }
    last = now;
    if (Date.now() < frameWatchUntil) requestAnimationFrame(tick);
    else frameWatching = false;
  }
  requestAnimationFrame(tick);
}
function noteKey() {
  keyAnswered(window.performance && performance.now ? performance.now() : Date.now());
  watchFrames();
}
/* '42 ms typical · 180 ms slowest · 3 % of frames late', or '' before any key */
function smoothnessLine() {
  var w = smooth.waits.slice().sort(function (a, b) {
    return a - b;
  });
  if (!w.length) return '';
  var late = smooth.frames ? Math.round((smooth.late / (smooth.frames + smooth.late)) * 100) : 0;
  return tx('diagRemote', w[Math.floor(w.length / 2)], w[w.length - 1], late);
}
// Poster, backdrop and icon URLs.
function isImdb(id) {
  return String(id || '').indexOf('tt') === 0;
}
function posterOf(it) {
  if (it.poster) return it.poster;
  return isImdb(it.id) ? 'https://images.metahub.space/poster/small/' + it.id + '/img' : '';
}
var ICON = {
  exit: '<svg viewBox="0 0 24 24"><path d="M10 17l1.4-1.4L8.8 13H20v-2H8.8l2.6-2.6L10 7l-5 5zM4 3h8v2H4v14h8v2H4a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  info: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
  similar: '<svg viewBox="0 0 24 24"><path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"/></svg>',
  trailer:
    '<svg viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M9 16.17l-3.88-3.88L3.7 13.7 9 19 21 7l-1.41-1.42z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>',
  close:
    '<svg viewBox="0 0 24 24"><path d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>'
};
function bgOf(it) {
  if (it.background) return it.background;
  if (isImdb(it.id)) return 'https://images.metahub.space/background/medium/' + it.id + '/img';
  return it.poster || '';
}
function bgSmall(it) {
  var u = String(bgOf(it) || '');
  return u.replace(/(images\.metahub\.space\/background\/)[a-z]+\//, '$1small/');
}
/* The width the local server reduces a background to: smaller in the light look, the
   package's own otherwise. */
function bgWidth() {
  return uiLook() === 'light' ? 640 : 0;
}
/* sharp: the featured titles' wider background, 1280 px, except on small TVs and in the light look */
function bgMid(it, sharp) {
  var u = String(bgOf(it) || '');
  if (!u) return u;
  /* reducing the image takes FFmpeg: without it, the smaller version from the artwork server */
  if (!HAS_MEDIA_TOOLS) return bgSmall(it);
  var width = sharp && !TV_PROFILE.lowMemory && uiLook() !== 'light' ? 1280 : bgWidth(),
    size = width >= 1280 ? 'large' : 'medium';
  return (
    '/artwork?u=' +
    encodeURIComponent(u.replace(/(images\.metahub\.space\/background\/)[a-z]+\//, '$1' + size + '/')) +
    (width ? '&w=' + width : '')
  );
}
// Stremio account session and library synchronization.
/* ================= account / library ================= */
function user() {
  return lsJson('user');
}
function authKey() {
  return lsJson('authKey');
}
/* signed in with a Nuvio account (experimental): the local server answers its calls */
function isNuvioAccount() {
  return /^nuvio:/.test(String(authKey() || ''));
}
/* Library / Continue Watching / watched all sync to the Stremio account, exactly like
   the official apps: items live under lib_<first4 of user._id>_<id> (shared with the
   classic shell on this origin), pulled on boot and pushed on every change. */
function libPrefix() {
  var u = user();
  if (u && u._id) return 'lib_' + u._id.slice(0, 4) + '_';
  var keys = storageKeys();
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k.indexOf('lib_') === 0) {
      var j = k.indexOf('_', 4);
      if (j > 0) return k.slice(0, j + 1);
    }
  }
  return 'lib_local_';
}
var PRE = libPrefix();
window.__SC_PHASE__('M1');
function allLib() {
  var out = [],
    keys = storageKeys();
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k.indexOf(PRE) !== 0) continue;
    var it = lsJson(k);
    if (it && it._id) out.push(it);
  }
  return out;
}
/* whole minutes left, or 0 when the numbers cannot be trusted */
function watchMinutesLeft(offsetMs, durationMs) {
  if (!(durationMs > 0) || !(offsetMs > 60000) || offsetMs >= durationMs) return 0;
  return Math.max(1, Math.round((durationMs - offsetMs) / 60000));
}
/* the episode the player recorded as next when this one finished */
function upNextOf(id, vid) {
  var next = lsRaw('tvnext_' + id + '_' + vid, '');
  return next && next !== vid ? next : '';
}
/* A series item whose position sits at the very start points at its next episode: the
   official apps move it there (position 1 ms) once an episode is finished. */
function upNextPointer(it) {
  var s = it.state || {};
  return it.type === 'series' && s.video_id && s.timeOffset > 0 && s.timeOffset < 60000 ? s.video_id : '';
}
/* Continue Watching card data: a finished episode becomes its next episode, and the
   minutes left are only shown when the saved numbers can be trusted. */
function cwCard(it) {
  var s = it.state || {},
    next = upNextPointer(it) || (watchFinished(s.timeOffset, s.duration) ? upNextOf(it._id, s.video_id) : '');
  return {
    id: it._id,
    type: it.type || 'movie',
    name: it.name,
    poster: it.poster,
    background: it.background,
    videoId: next || s.video_id || it._id,
    progress: next ? 0 : s.duration > 0 ? s.timeOffset / s.duration : 0,
    minutesLeft: next ? 0 : watchMinutesLeft(s.timeOffset, s.duration),
    upNext: !!next,
    cw: true
  };
}
window.__SC_CW_CARD__ = cwCard;
/* As in Stremio, an item removed from the library stays only while it is temporary */
function cwItems(limit) {
  var out = [],
    lib = allLib();
  for (var i = 0; i < lib.length; i++) {
    var it = lib[i],
      s = it.state || {};
    if (it.removed && !it.temp) continue;
    if (!upNextPointer(it)) {
      if (!s.timeOffset || s.timeOffset < 60000) continue;
      /* a finished episode stays only when its next episode is known (cwCard) */
      if (watchFinished(s.timeOffset, s.duration) && !(it.type === 'series' && upNextOf(it._id, s.video_id)))
        continue;
    }
    if (!it.name) continue;
    out.push(it);
  }
  out.sort(function (a, b) {
    return String(b._mtime || '').localeCompare(String(a._mtime || ''));
  });
  return out.slice(0, limit || 12);
}
window.__SC_CW_ITEMS__ = cwItems;
function libGridItems() {
  var out = [],
    lib = allLib();
  for (var i = 0; i < lib.length; i++) {
    var it = lib[i];
    if (it.removed) continue;
    if (!it.name) continue;
    out.push(it);
  }
  out.sort(function (a, b) {
    return String(b._mtime || '').localeCompare(String(a._mtime || ''));
  });
  return out.slice(0, TV_PROFILE.libraryCap);
}
/* pull the account library on boot: newest-mtime-wins, then rebuild the boards */
/* a modification time as milliseconds, from a number or an ISO string */
function mtimeMs(v) {
  if (typeof v === 'number') return v;
  var t = Date.parse(v || '');
  return isNaN(t) ? 0 : t;
}
window.__SC_MTIME_MS__ = mtimeMs;
function pullLib(cb) {
  var ak = authKey();
  if (!ak) {
    if (cb) cb();
    return;
  }
  postJson(API + '/api/datastoreMeta', { authKey: ak, collection: 'libraryItem' }, function (r) {
    var rows = r && r.result;
    if (!rows || !rows.length) {
      if (cb) cb();
      return;
    }
    /* datastoreMeta returns modification times in milliseconds while items carry ISO
       strings, so both are compared as times (a text comparison never pulled anything
       that already existed here). Items newer here than on the account, or missing
       there, are pushed back: a push lost when the player closed is not lost for good. */
    var want = [],
      onServer = {},
      push = [];
    for (var i = 0; i < rows.length; i++) {
      var id = rows[i][0],
        mt = mtimeMs(rows[i][1]),
        loc = lsJson(PRE + id);
      onServer[id] = 1;
      if (!loc || mtimeMs(loc._mtime) < mt) {
        if (want.length < 150) want.push(id);
      } else if (mtimeMs(loc._mtime) > mt + 1000 && push.length < 50) push.push(loc);
    }
    var local = allLib();
    for (var l = 0; l < local.length && push.length < 50; l++) {
      var li = local[l],
        ls = li.state || {};
      if (li._id && !onServer[li._id] && (li.removed === false || ls.timeOffset > 0)) push.push(li);
    }
    pushLibItems(push);
    if (!want.length) {
      if (cb) cb();
      return;
    }
    postJson(
      API + '/api/datastoreGet',
      { authKey: ak, collection: 'libraryItem', ids: want, all: false },
      function (g) {
        var items = g && g.result;
        if (items && items.length)
          for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it && it._id) lsSet(PRE + it._id, it);
          }
        if (cb) cb();
      }
    );
  });
}
/* push one library item up to the account (datastorePut = how Stremio persists it) */
function pushLib(item) {
  if (item && item._id) pushLibItems([item]);
}
function pushLibItems(items) {
  var ak = authKey();
  if (!ak || !items || !items.length) return;
  postJson(
    API + '/api/datastorePut',
    { authKey: ak, collection: 'libraryItem', changes: items },
    function () {},
    9000
  );
}
// Account addon collection.
/* addons: silent pull from the account at every boot (no buttons needed) */
function addons() {
  return lsJson('addons') || [];
}
/* The addons asked for catalogs, metadata and sources: all but Local files, which the
   streaming server serves for a computer's own video folders. The TV has none, so asking
   it only costs requests and "did not answer" entries in Diagnostics. */
function remoteAddons() {
  var all = addons(),
    out = [];
  for (var i = 0; i < all.length; i++)
    if (
      !/^https?:\/\/(?:127\.0\.0\.1|localhost):11470\//i.test(String((all[i] && all[i].transportUrl) || ''))
    )
      out.push(all[i]);
  return out;
}
/* Nuvio Collections of the profile (folders of catalogs), kept for the Home rows */
function nuvioCollections() {
  return isNuvioAccount() ? lsJson('nuvioCollections') || [] : [];
}
function syncCollections(cb) {
  var ak = authKey();
  if (!ak || !isNuvioAccount()) {
    if (cb) cb(false);
    return;
  }
  postJson(API + '/api/collectionsGet', { authKey: ak }, function (r) {
    var got = r && r.result;
    if (!got || typeof got.length !== 'number') {
      if (cb) cb(false);
      return;
    }
    var cur = '';
    try {
      cur = localStorage.getItem('nuvioCollections') || '';
    } catch (e) {}
    var next = JSON.stringify(got);
    if (next !== cur) {
      lsRawSet('nuvioCollections', next);
      if (cb) cb(true);
    } else if (cb) cb(false);
  });
}
function syncAddons(cb) {
  var ak = authKey();
  if (!ak) {
    if (cb) cb(false);
    return;
  }
  postJson(API + '/api/addonCollectionGet', { authKey: ak, update: true }, function (r) {
    var got = r && r.result && r.result.addons;
    if (!got || !got.length) {
      if (cb) cb(false);
      return;
    }
    var cur = '';
    try {
      cur = localStorage.getItem('addons') || '';
    } catch (e) {}
    var next = JSON.stringify(got);
    if (next !== cur) {
      lsRawSet('addons', next);
      lsRawSet('addonsLastModified', String(Date.now()));
      if (cb) cb(true);
    } else if (cb) cb(false);
  });
}
// Catalog discovery from installed addons (Home rows, Discover filters).
/* ================= addon-driven catalogs ================= */
/* the query string of the installed addon whose base is `base` ('' for Cinemeta or none) */
function addonQueryFor(list, base) {
  for (var i = 0; i < (list || []).length; i++)
    if (list[i] && addonBase(list[i]) === base) return addonQuery(list[i]);
  return '';
}
function typeLabel(t) {
  var value = String(t || '');
  if (value === 'movie') return tx('movies');
  if (value === 'series') return tx('series');
  if (value === 'anime') return tx('anime');
  value = value.replace(/[_-]+/g, ' ');
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : tx('other');
}
function discoverCatalogInfo(cat) {
  var ex = (cat && cat.extra) || [],
    blocked = false,
    genreOptions = [],
    genreRequired = false;
  for (var e = 0; e < ex.length; e++) {
    var x = ex[e] || {},
      name = String(x.name || '');
    if (x.isRequired && name !== 'genre') blocked = true;
    if (name === 'genre') {
      genreRequired = !!x.isRequired;
      if (x.options && x.options.length) genreOptions = x.options.slice(0);
    }
  }
  if (cat && cat.extraRequired && cat.extraRequired.length)
    for (var er = 0; er < cat.extraRequired.length; er++)
      if (cat.extraRequired[er] !== 'genre') blocked = true;
  return { blocked: blocked, genreOptions: genreOptions, genreRequired: genreRequired };
}
function discoverTypes() {
  var values = ['movie', 'series'],
    seen = { movie: true, series: true },
    a = remoteAddons();
  for (var i = 0; i < a.length; i++) {
    var man = a[i] && a[i].manifest;
    if (!man || !man.catalogs) continue;
    for (var c = 0; c < man.catalogs.length; c++) {
      var cat = man.catalogs[c],
        type = String((cat && cat.type) || '');
      if (!type || cat.id == null || seen[type] || discoverCatalogInfo(cat).blocked) continue;
      seen[type] = true;
      values.push(type);
    }
  }
  var out = [];
  for (var n = 0; n < values.length; n++) out.push({ value: values[n], label: typeLabel(values[n]) });
  return out;
}
window.__SC_DISCOVER_TYPES__ = discoverTypes;
function stableHash(value) {
  var s = String(value || ''),
    h = 2166136261;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0).toString(36);
}
function catalogCacheKey(addon, cat) {
  var m = (addon && addon.manifest) || {};
  return (
    'v2_' +
    stableHash([m.id || '', addonBase(addon || {}), (cat && cat.type) || '', (cat && cat.id) || ''].join('|'))
  );
}
var CATALOG_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
/* Nuvio Collections of the profile, pinned ones first, in the order Nuvio keeps them */
function orderedCollections() {
  var cols = nuvioCollections(),
    out = [],
    i;
  for (i = 0; i < cols.length; i++) if (cols[i] && cols[i].pinToTop) out.push(cols[i]);
  for (i = 0; i < cols.length; i++) if (cols[i] && !cols[i].pinToTop) out.push(cols[i]);
  return out;
}
/* The rows a Collections folder opens to: one per source that points at an installed addon
   catalog. TMDB and Trakt sources need Nuvio's own feeds and are left out. */
function folderRowDefs(folder) {
  var a = remoteAddons(),
    byId = {},
    out = [],
    i;
  for (i = 0; i < a.length; i++) {
    var man = a[i] && a[i].manifest;
    if (man && man.id && !byId[man.id]) byId[man.id] = a[i];
  }
  var sources = folder.sources && folder.sources.length ? folder.sources : folder.catalogSources || [];
  for (var s = 0; s < sources.length && out.length < (TV_PROFILE.catalogRowsCap || 16); s++) {
    var src = sources[s] || {};
    if (src.provider && src.provider !== 'addon') continue;
    var addon = byId[src.addonId],
      cats = (addon && addon.manifest.catalogs) || [],
      cat = null;
    for (var k = 0; k < cats.length; k++)
      if (cats[k] && cats[k].type === src.type && String(cats[k].id) === String(src.catalogId)) cat = cats[k];
    if (!cat) continue;
    /* Nuvio stores "no genre" as the text None (or null) */
    var genre = src.genre ? String(src.genre).trim() : '';
    if (/^(none|null|undefined)$/i.test(genre)) genre = '';
    out.push({
      title:
        (cat.name ? cat.name : folder.title || '') +
        (genre ? ' · ' + genre : '') +
        ' · ' +
        typeLabel(cat.type),
      type: cat.type,
      url:
        addonBase(addon) +
        '/catalog/' +
        cat.type +
        '/' +
        encodeURIComponent(cat.id) +
        (genre ? '/genre=' + encodeURIComponent(genre) : '') +
        '.json' +
        addonQuery(addon),
      key: catalogCacheKey(addon, cat) + (genre ? '_' + stableHash(genre) : '')
    });
  }
  return out;
}
/* Home rows for the Collections: one row of folder tiles per collection (no requests until a
   folder is opened), only folders that have something to show. */
function collectionTileDefs() {
  var cols = orderedCollections(),
    out = [];
  for (var c = 0; c < cols.length; c++) {
    var tiles = [],
      folders = cols[c].folders || [];
    for (var f = 0; f < folders.length; f++) {
      var folder = folders[f];
      if (!folder || !folderRowDefs(folder).length) continue;
      tiles.push({
        folder: folder,
        id: 'folder:' + (folder.id || cols[c].title + '/' + folder.title),
        type: 'folder',
        name: folder.hideTitle ? '' : folder.title || '',
        background: folder.coverImageUrl || ''
      });
    }
    if (tiles.length) out.push({ title: cols[c].title || '', tiles: tiles });
  }
  return out;
}
function homeCatalogs() {
  var out = [],
    a = remoteAddons(),
    maxRows = TV_PROFILE.catalogRowsCap || 16;
  for (var i = 0; i < a.length; i++) {
    var man = a[i] && a[i].manifest;
    if (!man || !man.catalogs) continue;
    var base = addonBase(a[i]);
    for (var c = 0; c < man.catalogs.length; c++) {
      var cat = man.catalogs[c];
      if (!cat || !cat.type || cat.id == null) continue;
      var req = false,
        ex = cat.extra || [];
      for (var e = 0; e < ex.length; e++) if (ex[e] && ex[e].isRequired) req = true;
      if (cat.extraRequired && cat.extraRequired.length) req = true;
      if (req) continue; /* search/genre-required catalogs are not board rows (og rule) */
      out.push({
        title: (cat.name ? cat.name + ' · ' : '') + typeLabel(cat.type),
        type: cat.type,
        url: base + '/catalog/' + cat.type + '/' + encodeURIComponent(cat.id) + '.json' + addonQuery(a[i]),
        key: catalogCacheKey(a[i], cat)
      });
      if (out.length >= maxRows) return out;
    }
  }
  return out;
}
function discoverCatalogs(type) {
  var out = [],
    seen = {},
    a = remoteAddons();
  for (var i = 0; i < a.length; i++) {
    var man = a[i] && a[i].manifest;
    if (!man || !man.catalogs) continue;
    var base = addonBase(a[i]);
    for (var c = 0; c < man.catalogs.length; c++) {
      var cat = man.catalogs[c];
      if (!cat || cat.type !== type || cat.id == null) continue;
      var info = discoverCatalogInfo(cat);
      if (info.blocked) continue;
      var key = [base, type, cat.id].join('|');
      if (seen[key]) continue;
      seen[key] = true;
      out.push({
        label: cat.name || man.name || String(cat.id),
        type: type,
        id: String(cat.id),
        base: base,
        query: addonQuery(a[i]),
        key: catalogCacheKey(a[i], cat),
        genres: info.genreOptions,
        genreRequired: info.genreRequired
      });
    }
  }
  if (!out.length && (type === 'movie' || type === 'series')) {
    out.push({
      label: tx('popular'),
      type: type,
      id: 'top',
      base: CIN,
      key: 'fallback_top',
      genres: [],
      genreRequired: false
    });
    out.push({
      label: tx('topRated'),
      type: type,
      id: 'imdbRating',
      base: CIN,
      key: 'fallback_rating',
      genres: [],
      genreRequired: false
    });
  }
  return out;
}
function discoverGenres(cat) {
  var out = [],
    values = cat && cat.genres && cat.genres.length ? cat.genres : null;
  if (!cat || !cat.genreRequired) out.push({ value: '', label: tx('allGenres') });
  if (values) {
    for (var i = 0; i < values.length; i++) out.push({ value: String(values[i]), label: String(values[i]) });
  } else if (cat && (cat.genreRequired || cat.base === CIN))
    for (var n = 0; n < DGEN.length; n++) out.push({ value: DGEN[n][0], label: tx(DGEN[n][1]) });
  return out;
}
function getCatalogUrl(url, key, type, cb) {
  var ck = 'beta_cat_' + key,
    cached = lsJson(ck);
  if (
    cached &&
    cached.v === 2 &&
    cached.t &&
    Date.now() - cached.t < CATALOG_CACHE_TTL &&
    cached.items &&
    cached.items.length
  )
    cb(cached.items, true);
  else cached = null;
  xhrJson(url, function (j) {
    var metas = (j && j.metas) || [];
    if (!metas.length) {
      if (!cached) cb([], false);
      return;
    }
    var slim = [];
    for (var i = 0; i < Math.min(metas.length, TV_PROFILE.catalogCap); i++) {
      var m = metas[i];
      slim.push({ id: m.id, type: m.type || type, name: m.name, poster: m.poster, background: m.background });
    }
    var same = cached && cached.items && JSON.stringify(cached.items) === JSON.stringify(slim);
    lsSet(ck, { v: 2, t: Date.now(), items: slim });
    if (!same) cb(slim, false); /* identical to cache -> skip the double row rebuild at boot */
  });
}
// Source discovery, quality/seeder/codec classification and per-profile source budget.
/* ================= streams (generic: any addon that declares them) ================= */
function streamAddons(type) {
  return streamAddonsIn(remoteAddons(), type);
}
function qualityLabel(value) {
  return value === 'All'
    ? tx('all')
    : value === 'Other'
      ? tx('other')
      : value === 'Recent'
        ? tx('recent')
        : value;
}
window.__SC_STREAM_COMPAT__ = streamCompatibility;
/* Short tags for the source list, read from the same advisory text: quality, language, HDR,
   size and seeders. A codec or audio format only shows when it is a compatibility warning. */
function sourceTags(s) {
  var t = streamText(s),
    low = t.toLowerCase(),
    out = [],
    m;
  if (s.quality && s.quality !== 'Other' && s.quality !== 'Recent') out.push({ t: s.quality, c: 'q' });
  if (/hdr10\+/.test(low)) out.push({ t: 'HDR10+' });
  else if (/\bhdr(10)?\b/.test(low)) out.push({ t: 'HDR' });
  if (/(dolby[ ._-]?vision|\bdovi\b|\bdv\b)/.test(low)) out.push({ t: 'DV' });
  m = t.match(/(\d+(?:[.,]\d+)?)\s*(gb|gib|mb|mib)\b/i);
  if (m) out.push({ t: m[1].replace(',', '.') + ' ' + m[2].charAt(0).toUpperCase() + 'B', c: 'size' });
  if (s.seeders >= 0) out.push({ t: tx('seedsTag', s.seeders), c: 'seed' });
  /* the language goes right after the quality */
  if (s.langs && s.langs.length)
    out.splice(
      out.length && out[0].c === 'q' ? 1 : 0,
      0,
      s.subLangsOnly ? subTag(s.langs) : { t: langTagText(s.langs), c: 'lang' }
    );
  return out;
}
window.__SC_SOURCE_TAGS__ = sourceTags;
window.__SC_STREAM_LANGUAGES__ = streamLanguages;
window.__SC_SUBTITLE_LANGUAGES_ONLY__ = subtitleLanguagesOnly;
/* 'PT-BR', 'ES-LA · EN', 'MULTI', or the first two and '+2' when there are more */
function langTagText(langs) {
  var names = [];
  for (var i = 0; i < langs.length; i++)
    names.push(langs[i] === 'es-419' ? 'ES-LA' : langs[i] === 'multi' ? 'MULTI' : langs[i].toUpperCase());
  return names.length > 2 ? names.slice(0, 2).join(' · ') + ' +' + (names.length - 2) : names.join(' · ');
}
/* 'LEG EN · PT +4' (subtitles), without the multi marker the words already imply */
function subTag(langs) {
  var named = [];
  for (var i = 0; i < langs.length; i++) if (langs[i] !== 'multi') named.push(langs[i]);
  return { t: tx('subsTag') + ' ' + (named.length ? langTagText(named) : 'MULTI'), c: 'sublang' };
}
/* filter groups of a source: language bases, 'multi', or 'none' when nothing was detected */
function langGroups(s) {
  var langs = s.langs || [],
    out = [];
  for (var i = 0; i < langs.length; i++) {
    var g = langBase(langs[i]);
    if (out.indexOf(g) < 0) out.push(g);
  }
  if (!out.length) out.push('none');
  return out;
}
/* the languages a source can be chosen in, by their own names (Settings, Best source) */
var SOURCE_LANGUAGES = [
  ['pt', 'Português'],
  ['es', 'Español'],
  ['en', 'English'],
  ['fr', 'Français'],
  ['it', 'Italiano'],
  ['de', 'Deutsch'],
  ['ko', '한국어']
];
function sourceLanguageName(code) {
  for (var i = 0; i < SOURCE_LANGUAGES.length; i++)
    if (SOURCE_LANGUAGES[i][0] === code) return SOURCE_LANGUAGES[i][1];
  return tx('anyLanguage');
}
/* the language the source list is ordered by: only one fixed in Settings, so the one chosen in
   Best source does not reorder the whole list */
function fixedSourceLanguage() {
  var set = lsRaw('preferredSourceLanguage', 'Ask');
  return set === 'Ask' ? 'Auto' : set;
}
/* the language Best source looks for: the one in Settings, or with Ask the last one chosen */
function preferredSourceLanguage() {
  var set = lsRaw('preferredSourceLanguage', 'Ask');
  return set === 'Ask' ? lsRaw('bestLanguage', 'Auto') : set;
}
/* 0 when the source has the preferred audio language, 1 for multi audio, 2 otherwise. A source
   whose flags name only its subtitles ("Multi Subs") counts as otherwise, and so does a torrent
   with almost no seeders: the language does not put one that would hardly load above the rest. */
var LANGUAGE_MIN_SEEDERS = 5;
function langRank(s, pref) {
  if (!pref || pref === 'Auto') return 0;
  if (s.subLangsOnly || (s.seeders != null && s.seeders < LANGUAGE_MIN_SEEDERS)) return 2;
  var g = langGroups(s);
  return g.indexOf(pref) >= 0 ? 0 : g.indexOf('multi') >= 0 ? 1 : 2;
}
/* What to play without choosing from the list, whose order already puts compatibility and seeders
   first: in the language asked for when there is one, the first without a warning in the quality
   asked for, or else in any known quality, and a low or unknown quality only when nothing better
   has none. */
function bestSource(items, quality, language) {
  var playable = items.filter(function (s) {
    return !s.stored && !(s.compatRank > 0) && !(s.compatLabels || []).length;
  });
  if (!playable.length)
    playable = items.filter(function (s) {
      return !s.stored && s.compatRank < 4;
    });
  /* the language asked for first, then multi-audio, keeping the list's order within each */
  if (language && language !== 'Auto')
    playable = playable
      .map(function (s, i) {
        return { s: s, i: i, r: langRank(s, language) };
      })
      .sort(function (a, b) {
        return a.r - b.r || a.i - b.i;
      })
      .map(function (x) {
        return x.s;
      });
  var asked = playable.filter(function (s) {
    return s.quality === quality;
  });
  var known = playable.filter(function (s) {
    return s.quality !== 'Other' && s.quality !== 'SD';
  });
  return asked[0] || known[0] || playable[0] || null;
}
window.__SC_BEST_SOURCE__ = bestSource;
function streamSourceKey(s) {
  if (s.stored) return 'stored';
  var u = String(s.url || '').replace(/#.*$/, '');
  var m = u.match(/127\.0\.0\.1:11470\/([0-9a-f]{32,64})\/(\d+)/i);
  return m
    ? 'torrent:' + m[1].toLowerCase() + ':' + m[2]
    : 'url:' + u + '|' + JSON.stringify(s.headers || {}) + '|' + (s.notWebReady ? '1' : '0');
}
function sourceOrder(a, b) {
  if (a.stored && !b.stored) return -1;
  if (b.stored && !a.stored) return 1;
  var ar = a.compatRank || 0,
    br = b.compatRank || 0;
  if (ar !== br) return ar - br;
  var as = a.seeders == null ? -1 : a.seeders,
    bs = b.seeders == null ? -1 : b.seeders;
  if (as !== bs) return bs - as;
  return (a._seq || 0) - (b._seq || 0);
}
function compactSourcePool(input, cap) {
  var best = {},
    unique = [],
    i,
    s,
    k,
    old,
    buckets = {},
    order = ['Recent', '4K', '1440p', '1080p', '720p', 'SD', 'Other'],
    selected = [],
    kept = {},
    trimmed = {},
    rest = [];
  cap = Math.max(1, cap || 60);
  for (i = 0; i < input.length; i++) {
    s = input[i];
    k = streamSourceKey(s);
    old = best[k];
    if (!old) {
      best[k] = s;
      unique.push(s);
    } else if (sourceOrder(s, old) < 0) {
      for (var u = 0; u < unique.length; u++)
        if (unique[u] === old) {
          unique[u] = s;
          break;
        }
      best[k] = s;
    }
  }
  for (i = 0; i < unique.length; i++) {
    s = unique[i];
    k = s.quality || 'Other';
    if (!buckets[k]) {
      buckets[k] = [];
      if (order.indexOf(k) < 0) order.push(k);
    }
    buckets[k].push(s);
  }
  for (i = 0; i < order.length; i++) {
    k = order[i];
    if (buckets[k]) buckets[k].sort(sourceOrder);
  }
  /* Keep one representative of every available quality, then fill the remaining
     global budget by compatibility and reliable seeder metadata. */
  for (i = 0; i < order.length && selected.length < cap; i++) {
    k = order[i];
    if (buckets[k] && buckets[k].length) {
      selected.push(buckets[k][0]);
      kept[k] = 1;
    }
  }
  for (i = 0; i < order.length; i++) {
    k = order[i];
    if (!buckets[k]) continue;
    for (var r = kept[k] || 0; r < buckets[k].length; r++) rest.push(buckets[k][r]);
  }
  rest.sort(sourceOrder);
  /* Debrid and direct links carry no seeder count, so by seeders a torrent addon filled the whole
     list ahead of them. Each addon whose sources have none keeps a share (half of the list, split
     evenly among all addons); addons with seeders compete by rank as before. */
  var share = {},
    seeded = {},
    addons = 0,
    left = [];
  for (i = 0; i < unique.length; i++) {
    k = unique[i].addon || '';
    if (share[k] === undefined) {
      share[k] = 0;
      addons++;
    }
    if (unique[i].seeders != null) seeded[k] = true;
  }
  for (i = 0; i < selected.length; i++)
    share[selected[i].addon || ''] = (share[selected[i].addon || ''] || 0) + 1;
  var floor = Math.floor(cap / (2 * Math.max(1, addons)));
  for (i = 0; i < rest.length; i++) {
    s = rest[i];
    k = s.addon || '';
    if (selected.length < cap && !seeded[k] && share[k] < floor) {
      share[k]++;
      selected.push(s);
      kept[s.quality || 'Other'] = (kept[s.quality || 'Other'] || 0) + 1;
    } else left.push(s);
  }
  rest = left;
  for (i = 0; i < rest.length && selected.length < cap; i++) {
    s = rest[i];
    selected.push(s);
    k = s.quality || 'Other';
    kept[k] = (kept[k] || 0) + 1;
  }
  for (k in buckets)
    if (Object.prototype.hasOwnProperty.call(buckets, k) && buckets[k].length > (kept[k] || 0))
      trimmed[k] = true;
  return { items: selected, trimmed: trimmed };
}
window.__SC_COMPACT_SOURCES__ = compactSourcePool;
/* onDone(total, failed): failed lists the addons that did not answer, so the picker can
   tell "nothing found" apart from "the addon is down". */
function fetchStreams(type, vid, onPart, onDone) {
  var list = streamAddons(type);
  var pending = list.length;
  var total = 0;
  var failed = [];
  if (!pending) {
    onDone(0, failed);
    return;
  }
  for (var i = 0; i < list.length; i++)
    (function (ad, idx) {
      /* an addon that fails at once (a server error from a busy host, or no answer) is asked once
         more; not one that has no such title, nor one that timed out, which would double the wait */
      function ask(again) {
        xhrJson(
          streamUrl(ad, type, vid),
          function (j, failure, status) {
            if ((failure === 'offline' || status >= 500) && !again)
              return setTimeout(function () {
                ask(true);
              }, 1200);
            if (failure) failed.push(ad.name);
            var st = (j && j.streams) || [];
            var out = [];
            for (var k = 0; k < st.length; k++) {
              var item = sourceItem(st[k], ad.name, ad.base);
              if (item) out.push(item);
            }
            total += out.length;
            if (out.length) onPart(out, idx, ad.name);
            pending--;
            if (pending <= 0) onDone(total, failed);
          },
          45000
        ); /* slow debrid addons can take 20-30s; phone/PC wait too — 15s was dropping them */
      }
      ask(false);
    })(list[i], i);
}
// Opening the player and remembering source preferences for the next episode.
/* ================= playback ================= */
function playUrl(source, type, id, vid, backHash) {
  var s = typeof source === 'string' ? { url: source } : source;
  if (!s || !s.url) return;
  clientDiag('source_selected', {
    quality: s.quality || '',
    compat: (s.compatLabels || []).join(','),
    seeders: s.seeders == null ? '' : s.seeders
  });
  var tail =
    '&type=' +
    encodeURIComponent(type) +
    '&id=' +
    encodeURIComponent(id) +
    '&vid=' +
    encodeURIComponent(vid) +
    '&back=' +
    encodeURIComponent(backHash);
  /* Keep signed cookies/authorization out of browser history and localStorage. The
     Node service stores a small, sanitized stream reference and returns only its id. */
  var body = streamRefBody(s);
  body.meta = s.meta || knownArtwork(type, id);
  function prepare(attempt) {
    postJson(
      '/streamref',
      body,
      function (j) {
        if (j && j.ref) {
          location.assign(appUrl('/play?ref=' + encodeURIComponent(j.ref) + tail));
          return;
        }
        if (attempt < 2) {
          setTimeout(function () {
            prepare(attempt + 1);
          }, 180);
          return;
        }
        clientDiag('streamref_failed', { quality: s.quality || '' });
        toast(tx('sourcePrepareFailed'));
      },
      attempt === 1 ? 2500 : 4500
    );
  }
  /* a torrent needs the engine on this TV, or a streaming server on another computer */
  if (/^https?:\/\/(?:127\.0\.0\.1|localhost):11470\//i.test(s.url))
    xhrJson(
      '/streamfile',
      function (j) {
        if (j && j.state === 'needs-server') toast(tx('torrentsNeedServer'), 6000);
        else if (j && j.state === 'failed') toast(tx('torrentsUnavailable'));
        else if (j && j.state === 'no-room') toast(tx('torrentsNoRoom'), 6000);
        if (!HAS_MEDIA_TOOLS && !(j && j.state === 'needs-server')) prepare(1);
      },
      2000
    );
  if (HAS_MEDIA_TOOLS || !/^https?:\/\/(?:127\.0\.0\.1|localhost):11470\//i.test(s.url)) prepare(1);
}
function resumeSearch(id, vid) {
  var q = null;
  try {
    q = localStorage.getItem('tvstream_' + id + '_' + vid);
  } catch (e) {}
  return q;
}
function playStored(q, backHash) {
  q = q.replace(/&back=[^&]*/, '');
  location.assign(appUrl('/play' + q + '&back=' + encodeURIComponent(backHash)));
}
/* Left by the player when a source would not play (player controls.js): the title page
   reopens the sources and plays the next one, skipping the failed source. */
function retryKey(id, vid) {
  return 'tvretry_' + id + '_' + vid;
}
function hasRetryRequest(id, vid) {
  return !!lsRaw(retryKey(id, vid), '');
}
function takeRetryRequest(id, vid) {
  var pref = lsJson(retryKey(id, vid));
  try {
    localStorage.removeItem(retryKey(id, vid));
  } catch (e) {}
  return pref && pref.at && Date.now() - pref.at < 10 * 60 * 1000 ? pref : null;
}
/* the first source in list order that is not the one that failed */
function nextSourceAfterFailure(items, pref) {
  for (var i = 0; i < items.length; i++) {
    var s = items[i];
    if (s.stored) continue;
    /* the player knows this text after the server took its line breaks out */
    var text = String((s.name || '') + ' ' + (s.title || s.description || ''))
      .replace(/[\r\n\0]/g, ' ')
      .slice(0, 400);
    if (s.addon === pref.addon && text === pref.text) continue;
    return s;
  }
  return null;
}
window.__SC_NEXT_AFTER_FAILURE__ = nextSourceAfterFailure;
function hasNextSourcePreference(id, vid) {
  try {
    return !!localStorage.getItem('tvnextpref_' + id + '_' + vid);
  } catch (e) {
    return false;
  }
}
function takeNextSourcePreference(id, vid) {
  var key = 'tvnextpref_' + id + '_' + vid,
    raw = null,
    pref = null;
  try {
    raw = localStorage.getItem(key);
    localStorage.removeItem(key);
  } catch (e) {}
  if (!raw) return null;
  try {
    pref = JSON.parse(raw);
  } catch (e2) {
    return null;
  }
  if (!pref || !pref.at || Date.now() - pref.at > 10 * 60 * 1000) return null;
  return pref;
}
window.__SC_MATCH_NEXT_SOURCE__ = matchingNextSource;
// Remote focus class helpers and key-repeat acceleration.
/* ================= focus/visual helpers ================= */
function setF(list, idx) {
  for (var i = 0; i < list.length; i++)
    list[i].className = list[i].className.replace(/ ?\bf\b/, '') + (i === idx ? ' f' : '');
}
function setFRow(row, idx) {
  /* O(1): touch only the card losing focus + the one gaining it */
  if (row._f != null && row.cardEls[row._f])
    row.cardEls[row._f].className = row.cardEls[row._f].className.replace(/ ?\bf\b/, '');
  if (idx >= 0 && row.cardEls[idx])
    row.cardEls[idx].className = row.cardEls[idx].className.replace(/ ?\bf\b/, '') + ' f';
  row._f = idx >= 0 ? idx : null;
}
function setF1(list, oldIdx, newIdx) {
  /* O(1) repaint for held scrolling */
  if (list[oldIdx]) list[oldIdx].className = list[oldIdx].className.replace(/ ?\bf\b/, '');
  if (list[newIdx]) list[newIdx].className = list[newIdx].className.replace(/ ?\bf\b/, '') + ' f';
}
var accel = { dir: 0, cnt: 0, last: 0, snapT: null };
function hstep(dir, cardsEl) {
  var n = Date.now();
  if (dir === accel.dir && n - accel.last < 300) accel.cnt++;
  else accel.cnt = 1;
  accel.dir = dir;
  accel.last = n;
  if (cardsEl) {
    /* holding: snap steps (no transition) so animation can't lag behind key-repeat */
    if (accel.cnt >= 3) cardsEl.className = cardsEl.className.replace(/ ?\bsnap\b/, '') + ' snap';
    if (accel.snapT) clearTimeout(accel.snapT);
    accel.snapT = setTimeout(function () {
      cardsEl.className = cardsEl.className.replace(/ ?\bsnap\b/, '');
    }, 240);
  }
  return accel.cnt >= 6 ? 2 : 1;
}
// Hero backdrop: one decoded texture, debounced while the remote is scrolling.
var bgCur = '',
  bgT = null,
  bgDipT = null,
  BG_DIP_MS = 200;
/* A new title fades through the dark background instead of popping in: the old image goes
   out first, so only one image is on screen and no second layer has to be blended. */
function showBg(u) {
  var bg = $('bg');
  function swap() {
    bgDipT = null;
    if (bgCur !== u) return;
    bg.style.backgroundImage = 'url("' + u + '")';
    bg.className = 'on';
    $('bg2').className = '';
    $('bg2').style.backgroundImage = 'none';
  }
  if (bgDipT) clearTimeout(bgDipT);
  if (bg.className === 'on') {
    bg.className = '';
    bgDipT = setTimeout(swap, BG_DIP_MS);
  } else swap();
}
/* The local server answers "busy" while it reduces another image, and the title gets the
   480 px version meanwhile. Ask again, so it does not stay on the blurry one. */
function retryBgz(u, raw, left) {
  setTimeout(function () {
    if (bgCur !== raw) return;
    var im = new Image();
    im.onload = function () {
      if (bgCur !== raw || !im.naturalWidth) return;
      bgCur = u;
      $('bg').style.backgroundImage = 'url("' + u + '")';
    };
    im.onerror = function () {
      if (left > 1) retryBgz(u, raw, left - 1);
    };
    im.src = u;
  }, 1500);
}
/* This TV has ~38MB free RAM + a weak GPU, so large backdrop textures are the
   scroll-jank/"black blockiness" culprit. Keep one cropped texture, swap only after the
   replacement decodes, and debounce hard so rapid scrolling never thrashes the decoder. */
function setBg(u) {
  if (u === bgCur) return;
  bgCur = u;
  if (bgT) clearTimeout(bgT);
  bgT = setTimeout(function bgGo() {
    if (Date.now() - accel.last < 300) {
      bgT = setTimeout(bgGo, 220);
      return;
    } /* still scrolling: wait */
    if (!u) {
      $('bg').className = '';
      $('bg2').className = '';
      setTimeout(function () {
        if (!bgCur) {
          $('bg').style.backgroundImage = 'none';
          $('bg2').style.backgroundImage = 'none';
        }
      }, 560);
      return;
    }
    var img = new Image();
    img.onload = function () {
      if (bgCur !== u || !img.naturalWidth) return;
      showBg(u);
    };
    img.onerror = function () {
      if (bgCur !== u) return;
      var m = u.match(/^\/artwork\?u=([^&]*)/);
      if (m) {
        var raw = decodeURIComponent(m[1]).replace(
          /(images\.metahub\.space\/background\/)[a-z]+\//,
          '$1small/'
        );
        bgCur = raw;
        var im2 = new Image();
        im2.onload = function () {
          if (bgCur !== raw) return;
          showBg(raw);
          retryBgz(u, raw, 3);
        };
        im2.src = raw;
      }
    };
    img.src = u;
  }, 280);
}
// Title metadata cache (memory + localStorage) and artwork prewarming.
/* ================= meta (cached; resolves via addons for non-imdb ids) ================= */
var metaMem = {},
  metaMemOrder = [];
function putMetaMem(k, m) {
  var at = metaMemOrder.indexOf(k);
  if (at >= 0) metaMemOrder.splice(at, 1);
  metaMem[k] = m;
  metaMemOrder.push(k);
  while (metaMemOrder.length > (TV_PROFILE.lowMemory ? 12 : 24)) {
    var old = metaMemOrder.shift();
    delete metaMem[old];
  }
}
function metaAddonsFor(type, id) {
  var out = [],
    a = remoteAddons();
  for (var i = 0; i < a.length; i++) {
    var m = a[i] && a[i].manifest;
    if (!m) continue;
    var res = m.resources || [],
      has = false;
    for (var r = 0; r < res.length; r++) {
      var rr = res[r];
      if (rr === 'meta' || (rr && rr.name === 'meta')) has = true;
    }
    if (!has) continue;
    var types = m.types || [];
    if (types.length && types.indexOf(type) < 0) continue;
    var ok = !m.idPrefixes || !m.idPrefixes.length;
    if (m.idPrefixes)
      for (var p = 0; p < m.idPrefixes.length; p++) if (String(id).indexOf(m.idPrefixes[p]) === 0) ok = true;
    if (!ok) {
      for (var r2 = 0; r2 < res.length; r2++) {
        var rr2 = res[r2];
        if (rr2 && rr2.name === 'meta' && rr2.idPrefixes)
          for (var p2 = 0; p2 < rr2.idPrefixes.length; p2++)
            if (String(id).indexOf(rr2.idPrefixes[p2]) === 0) ok = true;
      }
    }
    if (ok) out.push(addonBase(a[i]));
  }
  return out;
}
function capMetaCache(k) {
  var keys = lsJson('beta_meta_keys') || [];
  var i = keys.indexOf(k);
  if (i >= 0) keys.splice(i, 1);
  keys.push(k);
  while (keys.length > 12) {
    var old = keys.shift();
    try {
      localStorage.removeItem('beta_meta_' + old);
    } catch (e) {}
  }
  lsSet('beta_meta_keys', keys);
}
/* What is already known about a title, at once: its name and artwork for the player (playback.js).
   Kitsu anime and long series such as One Piece answer the player's own lookup too late or not
   at all, and the player then had only the torrent's name and no picture. */
function knownArtwork(type, id) {
  var k = type + '_' + id,
    kept = lsJson('beta_meta_' + k),
    m = metaMem[k] || (kept && kept.meta);
  if (!m) return null;
  return { name: m.name || '', logo: m.logo || '', background: m.background || '', poster: m.poster || '' };
}
/* An addon besides Cinemeta that describes IMDb titles, such as TMDB set to Italian: the one the
   viewer installed to read titles in their language. The first in the addon order is used; the
   TMDB addon names only tmdb: ids in its manifest but answers IMDb ones too. */
var LOCAL_META_TIMEOUT_MS = 5000;
function localMetaBase(type, id) {
  var bases = metaAddonsFor(type, id).concat(metaAddonsFor(type, 'tmdb:'));
  for (var i = 0; i < bases.length; i++) if (bases[i] && bases[i].indexOf('cinemeta') < 0) return bases[i];
  return '';
}
/* Cinemeta keeps the structure (ids, episodes, ratings, genres for its own catalogs); the name,
   the synopsis and the episode titles and summaries come from that addon */
function overlayLocalText(meta, local) {
  if (!meta || !local) return;
  if (local.name) meta.name = local.name;
  if (local.description) meta.description = local.description;
  if (!meta.videos || !local.videos) return;
  var byNum = {},
    i,
    v,
    x;
  for (i = 0; i < local.videos.length; i++) {
    x = local.videos[i];
    byNum[x.season + ':' + x.episode] = x;
  }
  for (i = 0; i < meta.videos.length; i++) {
    v = meta.videos[i];
    x = byNum[v.season + ':' + v.episode];
    if (!x) continue;
    if (x.name || x.title) v.name = v.title = x.name || x.title;
    if (x.overview || x.description) v.overview = v.description = x.overview || x.description;
  }
}
window.__SC_OVERLAY_LOCAL__ = overlayLocalText;
function getMeta(type, id, cb) {
  var k = type + '_' + id;
  if (metaMem[k]) {
    cb(metaMem[k]);
    return;
  }
  var ls = lsJson('beta_meta_' + k);
  var fresh = ls && ls.t && Date.now() - ls.t < 43200000 && ls.meta;
  if (fresh) {
    putMetaMem(k, ls.meta);
    cb(ls.meta);
  }
  var bases = isImdb(id) ? [CIN] : metaAddonsFor(type, id);
  if (!bases.length && !fresh) {
    cb(null);
    return;
  }
  /* the text in the viewer's language is asked at the same time, and waited for up to 5 s */
  var local = isImdb(id) ? localMetaBase(type, id) : '',
    localMeta = null,
    localDone = !local,
    whenLocal = null;
  if (local)
    xhrJson(
      local + '/meta/' + type + '/' + encodeURIComponent(id) + '.json' + addonQueryFor(addons(), local),
      function (j) {
        localMeta = j && j.meta;
        localDone = true;
        if (whenLocal) whenLocal();
      },
      LOCAL_META_TIMEOUT_MS
    );
  var bi = 0;
  function tryNext() {
    if (bi >= bases.length) {
      if (!fresh) cb(null);
      return;
    }
    var b = bases[bi++];
    xhrJson(
      b + '/meta/' + type + '/' + encodeURIComponent(id) + '.json' + addonQueryFor(addons(), b),
      function (j) {
        var m = j && j.meta;
        if (!m) {
          tryNext();
          return;
        }
        function keep() {
          whenLocal = null;
          overlayLocalText(m, localMeta);
          putMetaMem(k, m);
          lsSet('beta_meta_' + k, { t: Date.now(), meta: m });
          capMetaCache(k);
          if (!fresh) cb(m);
        }
        if (localDone) keep();
        else whenLocal = keep;
      }
    );
  }
  tryNext();
}
var warmed = {},
  warmedN = 0;
function prewarm(u) {
  if (!u || warmed[u]) return;
  if (warmedN > (TV_PROFILE.lowMemory ? 48 : 140)) {
    warmed = {};
    warmedN = 0;
  } /* keep the book-keeping map tiny */
  warmed[u] = 1;
  warmedN++;
  var im = new Image();
  im.src = u;
}
function prewarmNeighbors(row) {
  if (!row || !row.items) return;
  if (accel.cnt >= 2) return; /* moving at all: no precache — every large texture costs us on this GPU */
  /* warm ONLY the focused item's backdrop + logo (what the hero shows next); neighbours'
     full-screen backdrops were the RAM/GPU hog that made scrolling sluggish. */
  var it = row.items[row.col];
  if (!it) return;
  prewarm(bgMid(it));
  if (!TV_PROFILE.lowMemory && isImdb(it.id))
    prewarm('https://images.metahub.space/logo/medium/' + it.id + '/img');
}
// Screen switching and the Back stack.
/* ================= screen manager ================= */
var SCR = 'home';
/* Each Back entry keeps the screen, the parameters it was opened with and where the
   focus was, so Back returns to the same title and the same card. */
var backStack = [];
var BACK_LIMIT = 20;
var scrParams = null;
var BOARD_SCR = { home: 1, lib: 1, fold: 1 };
function showScr(name) {
  var el = BOARD_SCR[name]
    ? 'scrBoard'
    : {
        detail: 'scrDetail',
        disc: 'scrDisc',
        search: 'scrSearch',
        addons: 'scrAddons',
        set: 'scrSet',
        login: 'scrLogin',
        sim: 'scrSim'
      }[name];
  var all = ['scrBoard', 'scrDetail', 'scrDisc', 'scrSearch', 'scrAddons', 'scrSet', 'scrLogin', 'scrSim'];
  for (var i = 0; i < all.length; i++) $(all[i]).className = 'scr' + (all[i] === el ? ' on' : '');
  SCR = name;
  /* the side menu follows the section on screen, also when Back returns to it */
  var section = chipTarget.indexOf(name);
  if (section >= 0) topNav.idx = section;
  if (name !== 'home') bodyRemove('featured');
  if (name === 'login') bodyAdd('login');
  else bodyRemove('login');
  paintChips();
  updateLogoBg();
  if (name === 'detail') bodyAdd('detail');
  else {
    bodyRemove('detail');
    bodyRemove('series-episode');
  }
}
function animIn(el) {
  if (!el) return;
  el.className = el.className.replace(/ ?\banim-in\b/, '');
  void el.offsetHeight;
  el.className = (el.className + ' anim-in').replace(/^ /, '');
}
/* faded Stremio logo where cover art would be: Settings, and Search until you browse results */
function updateLogoBg() {
  var show = SCR === 'set' || (SCR === 'search' && search.zone !== 'rows');
  $('logobg').className = show ? 'on' : '';
  if (show || SCR === 'login') setBg('');
}
function screenFocus() {
  if (SCR === 'search') return { zone: search.zone, rowIdx: search.rowIdx };
  if (SCR === 'sim') return { idx: similar.idx };
  if (SCR === 'detail' && detail.type === 'series') {
    var ep = detail.currentEpisode();
    return ep ? { vid: ep.id } : null;
  }
  return null;
}
function backParams(entry) {
  var p = {},
    k;
  for (k in entry.params) if (Object.prototype.hasOwnProperty.call(entry.params, k)) p[k] = entry.params[k];
  for (k in entry.focus) if (Object.prototype.hasOwnProperty.call(entry.focus, k)) p[k] = entry.focus[k];
  p.restored = true;
  return p;
}
function goScr(name, params, noStack) {
  try {
    idleTouch();
  } catch (e) {}
  if (!noStack && SCR !== name) {
    backStack.push({ name: SCR, params: scrParams, focus: screenFocus() });
    if (backStack.length > BACK_LIMIT) backStack.shift();
  }
  scrParams = params || null;
  topNav.active = false;
  if (name === 'home') {
    showScr('home');
    home.enter();
  } else if (name === 'detail') {
    showScr('detail');
    detail.enter(params);
  } else if (name === 'disc') {
    showScr('disc');
    disc.enter();
  } else if (name === 'search') {
    showScr('search');
    search.enter(params);
  } else if (name === 'lib') {
    showScr('lib');
    lib.enter();
  } else if (name === 'fold') {
    showScr('fold');
    fold.built = false;
    fold.enter();
  } else if (name === 'addons') {
    showScr('addons');
    addonPanel.enter();
  } else if (name === 'set') {
    showScr('set');
    settings.enter();
  } else if (name === 'sim') {
    showScr('sim');
    similar.enter(params);
  }
}
function goBackScr() {
  if (cwMenu.open) {
    cwMenu.back();
    return;
  }
  if (SCR === 'login') {
    cwMenu.confirmExit();
    return;
  }
  if (streamsUI.open) {
    streamsUI.close();
    return;
  }
  if (SCR === 'set' && settings.closeDiag()) return;
  if (SCR === 'set' && settings.editing) {
    settings.cancelEdit();
    return;
  }
  if (SCR === 'detail' && detail.zone === 'eps') {
    detail.zone = 'seasons';
    detail.paint();
    return;
  }
  if (topNav.active) {
    if (SCR !== 'home') {
      topNav.idx = chipTarget.indexOf('home');
      search.reset();
      goScr('home', null, true);
      topNav.active = false;
    } else cwMenu.confirmExit();
    return;
  }
  var prev = backStack.pop();
  if (prev) {
    goScr(prev.name, backParams(prev), true);
    return;
  }
  if (SCR === 'home') {
    topNav.idx = chipTarget.indexOf('home');
    topNav.focus();
    return;
  }
  if (SCR !== 'home') {
    topNav.idx = chipTarget.indexOf('home');
    goScr('home', null, true);
    return;
  }
  cwMenu.confirmExit();
}

var chips = [
  $('chipProfile'),
  $('chipSearch'),
  $('chipHome'),
  $('chipDisc'),
  $('chipLib'),
  $('chipAddons'),
  $('chipSet'),
  $('chipUpdate'),
  $('chipExit')
];
var chipTarget = ['profile', 'search', 'home', 'disc', 'lib', 'addons', 'set', 'update', 'exit'];
window.__SC_PHASE__('M2');
function paintChips() {
  if (topNav.active) bodyAdd('navopen');
  else bodyRemove('navopen');
  for (var i = 0; i < chips.length; i++) {
    var t = chipTarget[i];
    var cur = t === SCR || (t === 'home' && (SCR === 'detail' || SCR === 'sim'));
    var f = topNav.active && i === topNav.idx;
    chips[i].className = 'chip' + (cur ? ' cur' : '') + (f ? ' f' : '');
  }
}
// Sidebar navigation.
/* ================= top nav — centered; moving Left/Right auto-loads each page ================= */
function curBoard() {
  return SCR === 'home' ? home : SCR === 'lib' ? lib : SCR === 'fold' ? fold : null;
}
function resetBoardPosition(board) {
  board.rowIdx = 0;
  board.top = true;
  for (var i = 0; i < board.rows.length; i++) board.rows[i].col = 0;
  board._act = null;
}
/* side menu items that open something with OK instead of being a section */
function menuItemOnly(item) {
  return item === 'profile' || item === 'update' || item === 'exit';
}
var topNav = {
  idx: 2,
  active: false,
  paint: function () {
    paintChips();
  },
  focus: function () {
    this.active = true;
    var b = curBoard();
    if (b) b.paint();
    if (SCR === 'disc') disc.paint();
    else if (SCR === 'addons') addonPanel.paint();
    else if (SCR === 'set') settings.paint();
    else if (SCR === 'detail') {
      setF(detail.btnEls, -1);
      setF(detail.seasonEls, -1);
      setF(detail.epEls, -1);
    }
    this.paint();
  },
  switchTo: function (i) {
    i = Math.max(0, Math.min(chips.length - 1, i));
    /* the profile, update and leave items only take the focus: OK opens them */
    if (menuItemOnly(chipTarget[i])) {
      this.idx = i;
      this.active = true;
      this.paint();
      return;
    }
    if (
      i === this.idx &&
      (BOARD_SCR[SCR] || SCR === 'disc' || SCR === 'search' || SCR === 'addons' || SCR === 'set')
    )
      return;
    this.idx = i;
    var t = chipTarget[i];
    if (t === 'home') resetBoardPosition(home);
    else if (t === 'lib') resetBoardPosition(lib);
    backStack = [];
    scrParams = null;
    if (t !== 'search') search.reset();
    this.active = true;
    if (t === 'home') {
      showScr('home');
      home.enter();
    } else if (t === 'disc') {
      showScr('disc');
      disc.enter();
    } else if (t === 'lib') {
      showScr('lib');
      lib.enter();
    } else if (t === 'search') {
      showScr('search');
      search.enterNav();
    } else if (t === 'addons') {
      showScr('addons');
      addonPanel.enter();
    } else if (t === 'set') {
      showScr('set');
      settings.enter();
    }
    this.active = true;
    this.paint();
  },
  enterContent: function () {
    this.active = false;
    var t = chipTarget[this.idx];
    if (t === 'search') {
      search.enterInput();
    } else if (t === 'disc') {
      disc.focusTop();
    } else if (t === 'addons') {
      addonPanel.focusTop();
    } else if (t === 'set') {
      settings.focusTop();
    } else {
      var b = curBoard();
      if (b) {
        b.paint();
        b.hero();
      }
    }
    this.paint();
  },
  /* Choosing the section already on screen (OK or a click) goes back to its start; Right
     from the sidebar returns to the row and card that had the focus. */
  chooseSection: function (i) {
    if (chipTarget[i] === 'profile') return openProfile();
    if (chipTarget[i] === 'update') return offerUpdate();
    if (chipTarget[i] === 'exit') return cwMenu.confirmExit();
    if (i === this.idx && curBoard()) {
      resetBoardPosition(curBoard());
      this.enterContent();
    } else this.switchTo(i);
  },
  /* OK on a section while a title page is open goes to that section, e.g. Home from a
     series opened on Home, instead of staying on the series */
  key: function (k) {
    var item = chipTarget[this.idx];
    if (menuItemOnly(item) && (k === 13 || k === 39)) {
      if (k === 13) return this.chooseSection(this.idx) || true;
      this.idx = Math.max(0, chipTarget.indexOf(SCR === 'detail' || SCR === 'sim' ? 'home' : SCR));
    }
    if (k === 38 || k === 40) {
      var step = k === 38 ? -1 : 1,
        to = this.idx + step;
      /* Update is there only when a newer version is */
      if (chipTarget[to] === 'update' && !pendingUpdate) to += step;
      if (to >= 0 && to < chips.length) this.switchTo(to);
    } else if (k === 13 && (SCR === 'detail' || SCR === 'sim')) this.switchTo(this.idx);
    else if (k === 13 && curBoard()) this.chooseSection(this.idx);
    else if (k === 39 || k === 13) this.enterContent();
    return true;
  }
};
// Board engine shared by Home and Library: hero plus horizontally scrolling rows.
/* titles too long for two lines at the hero size use a smaller one (board.css) */
function heroTitleClass(name) {
  return String(name || '').length > 32 ? 'long' : '';
}
/* the hero's info line: 109 min   2026   7.8 [IMDb] */
/* A description longer than its two lines rolls up slowly once the focus has rested for three
   seconds, waits at the end and goes back, instead of staying cut off. Any new focus restarts it. */
var heroRoll = { wait: null, step: null };
function setHeroDesc(text) {
  var el = $('heroDesc');
  if (heroRoll.wait) clearTimeout(heroRoll.wait);
  if (heroRoll.step) clearInterval(heroRoll.step);
  heroRoll.wait = heroRoll.step = null;
  el.className = '';
  el.scrollTop = 0;
  el.textContent = text || '';
  if (!text) return;
  heroRoll.wait = setTimeout(function () {
    /* the featured titles pass by themselves: two lines and an ellipsis, without rolling */
    if (bodyHas('featured')) return;
    el.className = 'roll';
    var end = el.scrollHeight - el.clientHeight;
    if (end <= 2) {
      el.className = '';
      return;
    }
    heroRoll.step = setInterval(function () {
      if (el.scrollTop < end) return (el.scrollTop += 1);
      clearInterval(heroRoll.step);
      heroRoll.wait = setTimeout(function () {
        el.scrollTop = 0;
        el.className = '';
      }, 2500);
    }, 60);
  }, 3000);
}
function heroMetaHtml(m) {
  var html = '';
  function add(text) {
    if (text) html += '<span>' + esc(text) + '</span>';
  }
  add(m.runtime);
  add(m.releaseInfo || m.year);
  if (m.imdbRating) html += '<span>' + esc(m.imdbRating) + '<b class="imdb">IMDb</b></span>';
  return html;
}
window.__SC_HERO_META__ = heroMetaHtml;
/* Action • Crime • Drama, shown with the featured titles */
function heroGenres(genres) {
  return (genres || []).slice(0, 3).join('  •  ');
}
/* a title in progress starts with where the viewer stopped */
function heroMetaOf(it) {
  var where = it.cw ? cwSubtitle(it) : '';
  return (where ? '<span class="where">' + esc(where) + '</span>' : '') + (it.metaHtml || '');
}
/* ================= board engine (Home / Discover / Library share one hero+rows) ================= */
function makeBoard(loader) {
  return {
    rows: [],
    rowIdx: 0,
    /* Home's focus on the featured titles above the rows (spotlight.js) */
    top: true,
    built: false,
    heroT: null,
    loader: loader,
    enter: function () {
      var fresh = !this.built;
      if (fresh) {
        this.built = true;
        this.loader(this, false);
      }
      this.mount();
      if (home !== this) unloadBoard(home);
      if (disc !== this) unloadBoard(disc);
      if (lib !== this) unloadBoard(lib);
      if (fold !== this) unloadBoard(fold);
      this._act = null;
      if (!fresh) this.reveal();
      this.paint(true);
      this.hero();
    },
    rebuild: function () {
      this.built = true;
      this.loader(this, true);
      this.mount();
      this._act = null;
      if (curBoard() === this) {
        this.paint(true);
        this.hero();
      }
    },
    mount: function () {
      var host = $('rows');
      host.innerHTML = '';
      for (var i = 0; i < this.rows.length; i++) host.appendChild(this.rows[i].el);
      paintBoardMessage(this);
    },
    /* replay the staggered entrance every time the board is (re)shown, not just first build */
    reveal: function () {
      var rows = this.rows,
        i;
      for (i = 0; i < rows.length; i++) {
        if (rows[i].el.style.display !== 'none') rows[i].el.className = 'row';
      }
      void $('rows').offsetHeight;
      var d = 0;
      for (i = 0; i < rows.length; i++) {
        if (rows[i].el.style.display === 'none') continue;
        (function (el, delay) {
          setTimeout(function () {
            el.className = 'row in';
          }, delay);
        })(rows[i].el, d);
        d += 70;
      }
    },
    paintRow: function (r, active) {
      var row = this.rows[r];
      if (!row || !row.cardEls) return;
      setFRow(row, active ? row.col : -1);
      this.slideRow(row);
    },
    rowReady: function (row) {
      return !!(row && row.items && row.items.length && row.el.style.display !== 'none');
    },
    findRow: function (from, dir) {
      for (var i = from; i >= 0 && i < this.rows.length; i += dir) if (this.rowReady(this.rows[i])) return i;
      return -1;
    },
    settleRow: function () {
      if (this.rowReady(this.rows[this.rowIdx])) return this.rowIdx;
      var next = this.findRow(this.rowIdx, 1);
      if (next < 0) next = this.findRow(this.rowIdx - 1, -1);
      if (next >= 0) this.rowIdx = next;
      return next;
    },
    paint: function (all) {
      /* O(2 rows) per move — full repaint only when asked */
      if (this.rowIdx >= this.rows.length) this.rowIdx = Math.max(0, this.rows.length - 1);
      var atFeatured = this === home && featuredShown();
      paintFeatured();
      var focusOn = curBoard() === this && !topNav.active && !atFeatured;
      var settled = this.settleRow();
      var act = focusOn && settled >= 0 ? this.rowIdx : -1;
      if (all || this._act == null) {
        for (var r = 0; r < this.rows.length; r++) this.paintRow(r, r === act);
      } else if (this._act !== act) {
        this.paintRow(this._act, false);
        if (act >= 0) this.paintRow(act, true);
      } else if (act >= 0) this.slideRow(this.rows[act]);
      this._act = act;
      /* rows are the only children of #rows and hidden rows take no space, so the
         focused row's offsetTop equals the height of the rows above it */
      var cur = this.rows[this.rowIdx];
      /* the sidebar taking the focus keeps the rows where they are */
      var t = curBoard() === this && cur && !atFeatured ? cur.el.offsetTop : 0;
      $('rows').style.transform = 'translateY(-' + t + 'px)';
      $('rows').style.webkitTransform = 'translateY(-' + t + 'px)';
      virtualizeBoard(this, this.rowIdx, true);
      var self = this;
      if (this._vt) clearTimeout(this._vt);
      this._vt = setTimeout(function () {
        virtualizeBoard(self, self.rowIdx, false);
      }, 260);
    },
    slideRow: function (row) {
      /* the card step is fixed per row: measure it once instead of on every key press */
      var w = row._step || (row.wide ? 454 : 288);
      if (!row._step && row.cardEls && row.cardEls.length > 1) {
        var measured = row.cardEls[1].offsetLeft - row.cardEls[0].offsetLeft;
        if (measured > 0) w = row._step = measured;
      }
      var vis = Math.max(2, Math.floor(contentWidth() / w));
      var off = Math.max(0, row.col - (vis - 2)) * w;
      if (row.col <= 0) off = 0;
      row.cardsEl.style.transform = 'translateX(-' + off + 'px)';
      row.cardsEl.style.webkitTransform = 'translateX(-' + off + 'px)';
    },
    moveH: function (dir) {
      var row = this.rows[this.rowIdx];
      if (!row) return;
      var st = hstep(dir, row.cardsEl);
      var old = row.col;
      row.col = dir > 0 ? Math.min(row.items.length - 1, row.col + st) : Math.max(0, row.col - st);
      if (row.col === old) return;
      setFRow(row, row.col);
      this.slideRow(row);
      this.hero();
    },
    hero: function () {
      var self = this;
      if (this.heroT) clearTimeout(this.heroT);
      this.heroT = setTimeout(function () {
        if (self === home && featuredShown()) showFeatured();
        else self.heroApply();
      }, 260);
      prewarmNeighbors(this.rows[this.rowIdx]);
    },
    /* the title under the focus, or another one given (spotlight.js) */
    heroApply: function (item) {
      if (curBoard() !== this) return; /* a debounced hero must not paint after we left this board */
      var it = item || this.focusedItem();
      if (!it) {
        return;
      }
      this.heroItem = it;
      var lg = $('heroLogo'),
        tt = $('heroTitle');
      var self = this;
      /* NEVER flash plain text: keep the previous title until the new item's logo either loads
       (show logo) or fails (only then show text). Logos are prewarmed so this is instant. */
      if (isImdb(it.id)) {
        var lu = 'https://images.metahub.space/logo/medium/' + it.id + '/img';
        var im = new Image();
        im.onload = function () {
          if (self.heroItem === it) {
            lg.src = lu;
            lg.style.display = 'block';
            tt.style.display = 'none';
          }
        };
        im.onerror = function () {
          if (self.heroItem === it) {
            tt.textContent = it.name || '';
            tt.className = heroTitleClass(it.name);
            tt.style.display = '';
            lg.style.display = 'none';
          }
        };
        im.src = lu;
      } else {
        tt.textContent = it.name || '';
        tt.className = heroTitleClass(it.name);
        tt.style.display = '';
        lg.style.display = 'none';
      }
      $('heroMeta').innerHTML = heroMetaOf(it);
      $('heroGenres').textContent = heroGenres(it.genres);
      setHeroDesc(it.description);
      $('heroCast').textContent = it.cast || '';
      setBg(bgMid(it, this === home && featuredShown()));
      if ((!it.description || it.cast === undefined) && it.id) {
        getMeta(it.type, it.id, function (m) {
          if (!m) return;
          it.description = m.description || '';
          it.metaHtml = heroMetaHtml(m);
          it.cast = (m.cast || []).slice(0, 3).join(', ');
          if (m.genres && m.genres.length) it.genres = m.genres;
          if (self.heroItem === it) {
            setHeroDesc(it.description);
            $('heroMeta').innerHTML = heroMetaOf(it);
            $('heroGenres').textContent = heroGenres(it.genres);
            $('heroCast').textContent = it.cast;
          }
        });
      }
    },
    focusedItem: function () {
      if (this === home && featuredShown()) return featuredItem();
      if (this.settleRow() < 0) return null;
      var row = this.rows[this.rowIdx];
      return row.items[row.col] || null;
    },
    key: function (k) {
      if (this === home && featuredShown()) return featuredKey(k);
      this.top = false;
      if (this.settleRow() < 0) {
        if (k === 37) topNav.focus();
        else if (k === 13 && this.empty) refreshCurBoard();
        return true;
      }
      var row = this.rows[this.rowIdx];
      if (k === 39) this.moveH(1);
      else if (k === 37) {
        if (row.col === 0) topNav.focus();
        else this.moveH(-1);
      } else if (k === 40) {
        var next = this.findRow(this.rowIdx + 1, 1);
        if (next >= 0) {
          this.rowIdx = next;
          this.paint();
          this.hero();
        }
      } else if (k === 38) {
        var prev = this.findRow(this.rowIdx - 1, -1);
        /* Up from the first row goes back to the featured titles */
        if (prev >= 0) this.rowIdx = prev;
        else this.top = this === home;
        if (prev >= 0 || featuredShown()) {
          this.paint();
          this.hero();
        }
      } else if (k === 13) {
        var it = this.focusedItem();
        if (it) openItem(it);
      }
      return true;
    }
  };
}
// Home, Discover and Library screens.
var home = makeBoard(function (b, keep) {
  var defs = homeDefs(),
    because = becauseYouWatchedDef();
  /* a Home made of Nuvio Collections stays only those, as in Nuvio's apps */
  if (because && !(defs[0] && defs[0].tiles)) defs.splice(Math.min(1, defs.length), 0, because);
  loadCatalogRows(b, defs, true, keep);
});
/* Discover intentionally differs from Home: three compact filters feed one virtualized
   poster grid. This keeps the DOM small while making the section useful on a TV remote. */
var disc = {
  rows: [],
  items: [],
  els: [],
  filterEls: [],
  optionEls: [],
  types: [],
  catalogs: [],
  genres: [],
  menuEl: null,
  typeIdx: 0,
  catalogIdx: 0,
  genreIdx: 0,
  filterIdx: 0,
  optionIdx: 0,
  filterOpen: false,
  idx: 0,
  cols: 6,
  zone: 'filters',
  built: false,
  gen: 0,
  loading: false,
  ended: false,
  skip: 0,
  request: null,
  cacheKey: '',
  enter: function () {
    unloadBoard(home);
    unloadBoard(lib);
    this.zone = 'filters';
    this.filterIdx = 0;
    this.filterOpen = false;
    this.refreshChoices();
    this.renderFilters();
    if (!this.built) {
      this.built = true;
      this.load();
    } else this.paint();
    animIn($('discWrap'));
  },
  /* from a Home row's See all card: the same catalog, all genres */
  openCatalog: function (def) {
    var m = String((def && def.url) || '').match(/^(.*)\/catalog\/([^\/]+)\/([^\/]+)\.json$/);
    this.types = discoverTypes();
    for (var t = 0; t < this.types.length; t++) if (this.types[t].value === def.type) this.typeIdx = t;
    this.catalogs = discoverCatalogs(def.type);
    this.catalogIdx = 0;
    if (m)
      for (var c = 0; c < this.catalogs.length; c++)
        if (
          this.catalogs[c].id === decodeURIComponent(m[3]) &&
          (this.catalogs[c].base === m[1] || this.catalogs[c].base === CIN)
        )
          this.catalogIdx = c;
    this.genreIdx = 0;
    this.idx = 0;
    this.built = false;
    topNav.idx = chipTarget.indexOf('disc');
    goScr('disc');
  },
  focusTop: function () {
    this.zone = 'filters';
    this.filterIdx = 0;
    this.filterOpen = false;
    this.renderFilters();
    this.paint();
  },
  refreshChoices: function () {
    this.types = discoverTypes();
    if (this.typeIdx >= this.types.length) this.typeIdx = 0;
    var type = this.selectedType();
    this.catalogs = discoverCatalogs(type);
    if (this.catalogIdx >= this.catalogs.length) this.catalogIdx = 0;
    this.genres = discoverGenres(this.catalogs[this.catalogIdx]);
    if (this.genreIdx >= this.genres.length) this.genreIdx = 0;
  },
  selectedType: function () {
    return this.types[this.typeIdx] ? this.types[this.typeIdx].value : 'movie';
  },
  currentCatalog: function () {
    return this.catalogs[this.catalogIdx] || null;
  },
  currentGenre: function () {
    return this.genres[this.genreIdx] || { value: '', label: tx('allGenres') };
  },
  filterOptions: function (i) {
    var out = [],
      n;
    if (i === 0) {
      for (n = 0; n < this.types.length; n++) out.push(this.types[n].label);
      return out;
    }
    if (i === 1) {
      for (n = 0; n < this.catalogs.length; n++) out.push(this.catalogs[n].label);
      return out;
    }
    for (n = 0; n < this.genres.length; n++) out.push(this.genres[n].label);
    return out;
  },
  filterValue: function (i) {
    return i === 0 ? this.typeIdx : i === 1 ? this.catalogIdx : this.genreIdx;
  },
  renderFilters: function () {
    this.refreshChoices();
    var cat = this.currentCatalog(),
      genre = this.currentGenre();
    var hosts = [$('discType'), $('discCatalog'), $('discGenre')],
      labels = [
        this.types[this.typeIdx] ? this.types[this.typeIdx].label : tx('movies'),
        cat ? cat.label : tx('popular'),
        genre.label
      ];
    this.filterEls = [];
    this.optionEls = [];
    this.menuEl = null;
    for (var i = 0; i < hosts.length; i++) {
      hosts[i].innerHTML = '';
      var chip = document.createElement('div');
      chip.className = 'fchip' + (this.filterOpen && i === this.filterIdx ? ' open' : '');
      chip.textContent = labels[i];
      hosts[i].appendChild(chip);
      this.filterEls.push(chip);
      if (this.filterOpen && i === this.filterIdx) {
        var menu = document.createElement('div');
        menu.className = 'fmenu';
        this.menuEl = menu;
        var opts = this.filterOptions(i),
          cur = this.filterValue(i);
        for (var n = 0; n < opts.length; n++) {
          var op = document.createElement('div');
          op.className = 'fopt' + (n === cur ? ' cur' : '');
          op.textContent = opts[n];
          menu.appendChild(op);
          this.optionEls.push(op);
        }
        hosts[i].appendChild(menu);
      }
    }
  },
  openFilter: function () {
    this.filterOpen = true;
    this.optionIdx = this.filterValue(this.filterIdx);
    this.renderFilters();
    this.paint();
  },
  closeFilter: function () {
    if (!this.filterOpen) return false;
    this.filterOpen = false;
    this.renderFilters();
    this.paint();
    return true;
  },
  selectFilter: function () {
    if (this.filterIdx === 0) {
      this.typeIdx = this.optionIdx;
      this.catalogIdx = 0;
      this.genreIdx = 0;
    } else if (this.filterIdx === 1) {
      this.catalogIdx = this.optionIdx;
      this.genreIdx = 0;
    } else this.genreIdx = this.optionIdx;
    this.filterOpen = false;
    this.refreshChoices();
    this.renderFilters();
    this.idx = 0;
    this.load();
  },
  pageUrl: function (offset) {
    var cat = this.currentCatalog(),
      genre = this.currentGenre(),
      extra = [];
    if (!cat) return '';
    if (genre.value) extra.push('genre=' + encodeURIComponent(genre.value));
    if (offset > 0) extra.push('skip=' + offset);
    return (
      cat.base +
      '/catalog/' +
      cat.type +
      '/' +
      encodeURIComponent(cat.id) +
      (extra.length ? '/' + extra.join('&') : '') +
      '.json' +
      (cat.query || '')
    );
  },
  load: function () {
    var cat = this.currentCatalog(),
      genre = this.currentGenre(),
      gen = ++this.gen;
    if (this.request && this.request.abort)
      try {
        this.request.abort();
      } catch (e) {}
    this.request = null;
    this.loading = false;
    this.ended = false;
    this.skip = 0;
    this.items = [];
    this.cacheKey =
      'beta_discover_v3_' + stableHash([(cat && cat.key) || '', genre.value || 'all'].join('|'));
    var cached = lsJson(this.cacheKey);
    if (cached && cached.v === 3 && cached.items && cached.items.length) {
      this.items = cached.items.slice(0, TV_PROFILE.discoverCap || 40);
      this.skip = cached.skip || this.items.length;
      this.ended = !!cached.ended;
      this.renderGrid();
    } else $('discGrid').innerHTML = '<div class="stmsg">' + tx('searching') + '</div>';
    this.requestPage(0, true, gen);
  },
  requestPage: function (offset, refresh, expectedGen) {
    if (this.loading || (this.ended && !refresh)) return;
    var self = this,
      gen = expectedGen == null ? this.gen : expectedGen,
      url = this.pageUrl(offset),
      cap = TV_PROFILE.discoverCap || 40;
    if (!url) return;
    this.loading = true;
    this.request = xhrJson(url, function (j) {
      if (self.gen !== gen) return;
      self.loading = false;
      self.request = null;
      var metas = (j && j.metas) || [],
        incoming = [],
        seen = {},
        i;
      if (refresh) self.ended = false;
      for (i = 0; i < self.items.length; i++) seen[self.items[i].type + ':' + self.items[i].id] = true;
      for (i = 0; i < metas.length; i++) {
        var m = metas[i],
          type = m.type || self.selectedType(),
          id = type + ':' + m.id;
        if (!m.id || seen[id]) continue;
        seen[id] = true;
        incoming.push({
          id: m.id,
          type: type,
          name: m.name,
          poster: m.poster,
          background: m.background,
          logo: m.logo,
          description: m.description,
          releaseInfo: m.releaseInfo,
          year: m.year,
          runtime: m.runtime,
          imdbRating: m.imdbRating
        });
      }
      if (refresh && offset === 0 && self.items.length) {
        var first = incoming,
          merged = [],
          all = first.concat(self.items),
          dedupe = {};
        for (i = 0; i < all.length && merged.length < cap; i++) {
          var dk = all[i].type + ':' + all[i].id;
          if (!dedupe[dk]) {
            dedupe[dk] = true;
            merged.push(all[i]);
          }
        }
        self.items = merged;
      } else for (i = 0; i < incoming.length && self.items.length < cap; i++) self.items.push(incoming[i]);
      self.skip = Math.max(self.skip, offset + metas.length);
      if (!metas.length || (!incoming.length && offset > 0) || self.items.length >= cap) self.ended = true;
      lsSet(self.cacheKey, { v: 3, t: Date.now(), items: self.items, skip: self.skip, ended: self.ended });
      self.renderGrid();
    });
  },
  maybeLoadMore: function () {
    if (this.zone === 'grid' && !this.loading && !this.ended && this.items.length - this.idx <= this.cols * 2)
      this.requestPage(this.skip, false, this.gen);
  },
  renderGrid: function () {
    var host = $('discGrid');
    host.innerHTML = '';
    this.els = [];
    for (var i = 0; i < this.items.length; i++) {
      var c = makeCard(this.items[i], false, true, false);
      host.appendChild(c);
      this.els.push(c);
    }
    if (!this.items.length && !this.loading)
      host.innerHTML = emptyState(tx('nothingFound'), tx('nothingFoundHint'));
    this.idx = Math.min(this.idx, Math.max(0, this.items.length - 1));
    this.paint();
  },
  focusedItem: function () {
    return this.items[this.idx] || null;
  },
  paint: function () {
    setF(this.filterEls, !topNav.active && this.zone === 'filters' ? this.filterIdx : -1);
    setF(this.els, !topNav.active && this.zone === 'grid' ? this.idx : -1);
    setF(this.optionEls, !topNav.active && this.zone === 'filters' && this.filterOpen ? this.optionIdx : -1);
    if (this.menuEl && this.optionEls[this.optionIdx]) {
      var option = this.optionEls[this.optionIdx],
        top = option.offsetTop,
        bottom = top + option.offsetHeight;
      if (top < this.menuEl.scrollTop) this.menuEl.scrollTop = top;
      else if (bottom > this.menuEl.scrollTop + this.menuEl.clientHeight)
        this.menuEl.scrollTop = bottom - this.menuEl.clientHeight;
    }
    var step = (document.documentElement.clientHeight || 1080) <= 800 ? 192 : 288,
      gridWidth = $('discGridClip').clientWidth || contentWidth();
    this.cols = Math.max(3, Math.floor((gridWidth - 14) / step));
    var row = Math.floor(this.idx / this.cols),
      rowH = (document.documentElement.clientHeight || 1080) <= 800 ? 288 : 420;
    for (var i = 0; i < this.els.length; i++) {
      var imgs = this.els[i].getElementsByTagName('img'),
        near = Math.abs(Math.floor(i / this.cols) - row) <= 1;
      for (var z = 0; z < imgs.length; z++) {
        var im = imgs[z];
        if (near && im._full) {
          im.src = im._full;
          im._full = null;
        } else if (!near && im.src && im.src !== BLANK_IMG) {
          im._full = im.src;
          im.src = BLANK_IMG;
        }
      }
    }
    var y = this.zone === 'grid' ? Math.max(0, row - 1) * rowH : 0;
    $('discGrid').style.transform = 'translateY(-' + y + 'px)';
    $('discGrid').style.webkitTransform = 'translateY(-' + y + 'px)';
    /* no backdrop here: the grid would cover nearly all of it, for the cost of one image */
    setBg('');
    this.maybeLoadMore();
  },
  key: function (k) {
    if (this.zone === 'filters') {
      if (this.filterOpen) {
        var last = this.filterOptions(this.filterIdx).length - 1;
        if (k === 38) this.optionIdx = Math.max(0, this.optionIdx - 1);
        else if (k === 40) this.optionIdx = Math.min(last, this.optionIdx + 1);
        else if (k === 13) this.selectFilter();
        else if (k === 37 || k === 39) {
          this.filterOpen = false;
          this.filterIdx = Math.max(0, Math.min(2, this.filterIdx + (k === 37 ? -1 : 1)));
          this.renderFilters();
        }
        this.paint();
        return true;
      }
      if (k === 37) {
        if (this.filterIdx === 0) {
          topNav.focus();
          return true;
        }
        this.filterIdx--;
      } else if (k === 39) this.filterIdx = Math.min(2, this.filterIdx + 1);
      else if (k === 40) {
        if (this.items.length) this.zone = 'grid';
      } else if (k === 13) {
        this.openFilter();
        return true;
      }
      this.paint();
      return true;
    }
    if (!this.items.length) {
      if (k === 38) this.zone = 'filters';
      this.paint();
      return true;
    }
    var col = this.idx % this.cols;
    if (k === 39) this.idx = Math.min(this.items.length - 1, this.idx + 1);
    else if (k === 37) {
      if (col === 0) {
        topNav.focus();
        return true;
      }
      this.idx--;
    } else if (k === 40) this.idx = Math.min(this.items.length - 1, this.idx + this.cols);
    else if (k === 38) {
      if (this.idx - this.cols >= 0) this.idx -= this.cols;
      else this.zone = 'filters';
    } else if (k === 13) {
      var it = this.focusedItem();
      if (it) openItem(it);
      return true;
    }
    this.paint();
    return true;
  }
};
var lib = makeBoard(function (b, keep) {
  loadLibraryRows(b);
});
/* A Nuvio Collections folder opened from Home: one row per catalog it holds */
var fold = makeBoard(function (b, keep) {
  var folder = (scrParams && scrParams.folder) || {};
  loadCatalogRows(b, folderRowDefs(folder), false, keep);
});
// Card and row construction, with texture virtualization for low-memory TVs.
/* ---- image virtualization: this TV has ~38MB free RAM; keeping EVERY row's decoded
   posters pinned (Discover = 200+) is what caused blockiness then OOM crashes. Only rows
   near the cursor keep real textures; far rows hold a 1px placeholder and reload from the
   HTTP cache when you scroll back. ---- */
var BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
function setRowLoaded(row, on) {
  if (!row || !row.cardsEl) return;
  if (row._loaded === on && on !== true) return;
  row._loaded = on;
  var imgs = row.cardsEl.getElementsByTagName('img');
  for (var i = imgs.length - 1; i >= 0; i--) {
    var im = imgs[i];
    if (!on) {
      if (im.src && im.src !== BLANK_IMG) {
        im._full = im.src;
        im.src = BLANK_IMG;
      }
    } else if (im._full) {
      im.src = im._full;
      im._full = null;
    }
  }
}
function virtualizeBoard(b, center, fast) {
  for (var r = 0; r < b.rows.length; r++) {
    var d = Math.abs(r - center);
    var radius = TV_PROFILE.lowMemory ? (fast ? 0 : 1) : fast ? 1 : 2;
    if (d <= radius) setRowLoaded(b.rows[r], true);
    else if (d > radius) setRowLoaded(b.rows[r], false);
  }
}
function unloadBoard(b) {
  if (!b) return;
  for (var r = 0; r < b.rows.length; r++) setRowLoaded(b.rows[r], false);
}
function makeCard(it, wide, label, eager) {
  var d = document.createElement('div');
  d.className = 'card' + (wide ? ' wide' : '') + (label && !wide ? ' labeled' : '');
  /* no artwork: drop the broken image and show the title on a gradient instead */
  function noArt(img) {
    if (img && img.parentNode) img.parentNode.removeChild(img);
    if (d.className.indexOf('noart') < 0) d.className += ' noart';
    nm.style.display = 'block';
  }
  /* dark placeholder only — the title text is HIDDEN until/unless the art fails to load,
     so scrolling never flashes text before the poster paints (that was the glitch) */
  var nm = document.createElement('div');
  nm.className = 'nm';
  nm.textContent = it.name || it.id;
  nm.style.display = 'none';
  d.appendChild(nm);
  var src = wide ? bgSmall(it) : posterOf(it);
  if (src) {
    var img = new Image();
    img.onload = function () {
      d.insertBefore(img, d.firstChild);
      img.onload = null;
    };
    img.onerror = function () {
      if (img.src !== BLANK_IMG) noArt(img);
    };
    /* LAZY by default: rows away from the cursor never even START their downloads/decodes
       (the boot flood of ~100 posters was part of the slow/unstable startup) */
    if (eager) img.src = src;
    else {
      img._full = src;
      img.src = BLANK_IMG;
      d.insertBefore(img, d.firstChild);
      img.onload = null;
    }
  } else noArt(null);
  if (label && !wide) {
    var tl = document.createElement('div');
    tl.className = 'titlelabel';
    tl.textContent = it.name || '';
    d.appendChild(tl);
  }
  if (!wide && itemWatched(it)) {
    var wb = document.createElement('div');
    wb.className = 'wbadge';
    wb.innerHTML = ICON.check;
    d.appendChild(wb);
  }
  if (wide) {
    var lb = document.createElement('div');
    lb.className = 'cwlabel';
    lb.textContent = it.name || '';
    var sub = cwSubtitle(it);
    if (sub) {
      var sl = document.createElement('div');
      sl.className = 'sub' + (it.upNext || it.fresh ? ' next' : '');
      sl.textContent = sub;
      lb.appendChild(sl);
    }
    d.appendChild(lb);
    if (it.progress > 0) {
      var pb = document.createElement('div');
      pb.className = 'pbar';
      var fill = document.createElement('div');
      fill.style.width = Math.min(100, Math.round(it.progress * 100)) + '%';
      pb.appendChild(fill);
      d.appendChild(pb);
    }
  }
  return d;
}

/* "Up next · S2 E6", "S2 E5 · 12 min left" or "48 min left" under a Continue Watching title */
function cwSubtitle(it) {
  var ep = '';
  if (it.videoId && it.videoId.indexOf(':') > 0) {
    var pp = it.videoId.split(':');
    if (pp.length >= 3) {
      if (it.upNext) return tx('cwUpNext', pp[pp.length - 2], pp[pp.length - 1]);
      if (it.fresh) return tx('newEpisodeTag', pp[pp.length - 2], pp[pp.length - 1]);
      ep = tx('cwEpisode', pp[pp.length - 2], pp[pp.length - 1]);
    }
  }
  var left = it.minutesLeft ? tx('cwLeft', it.minutesLeft) : '';
  return ep && left ? ep + '  ·  ' + left : ep || left;
}
/* An empty screen says what happened and what to do next. */
function emptyState(title, hint) {
  return (
    '<div class="empty"><div class="emptyic">' +
    ICON.info +
    '</div><div class="emptyt">' +
    esc(title) +
    '</div><div class="emptyh">' +
    esc(hint) +
    '</div></div>'
  );
}
/* Static grey cards the size of real ones while a catalog loads, so the board does not
   jump when it arrives. No images and no animation: nothing to decode or repaint. */
function placeholderCards(row) {
  var n = Math.min(8, Math.ceil(contentWidth() / (row.wide ? 454 : 288)) + 1);
  for (var i = 0; i < n; i++) {
    var c = document.createElement('div');
    c.className = 'card ph' + (row.wide ? ' wide' : '');
    row.cardsEl.appendChild(c);
  }
  row.el.className = 'row in';
}
function buildRow(title, items, wide, label, eager) {
  var row = { title: title, items: items, col: 0, wide: !!wide };
  var el = document.createElement('div');
  el.className = 'row';
  var tt = document.createElement('div');
  tt.className = 'rowtitle';
  tt.textContent = title;
  el.appendChild(tt);
  var cards = document.createElement('div');
  cards.className = 'cards';
  el.appendChild(cards);
  row.el = el;
  row.cardsEl = cards;
  row.cardEls = [];
  for (var i = 0; i < items.length; i++) {
    var c = makeCard(items[i], wide, label, eager);
    cards.appendChild(c);
    row.cardEls.push(c);
  }
  return row;
}
// Row loaders for Home, Discover and Library, and opening a focused item.
/* When every catalog answered and none has titles, Home says so instead of staying blank,
   and says the TV has no connection when Stremio itself cannot be reached. */
function paintBoardMessage(board) {
  var msg = $('boardMsg');
  if (curBoard() !== board) return;
  var text = board.netCode ? tx('noConnection', board.netCode) : tx('catalogsFailed');
  msg.innerHTML = board.empty ? esc(text) + '<br>' + tx('pressOkRetry') : '';
  msg.style.display = board.empty ? 'block' : 'none';
}
function settleBoardMessage(board) {
  var any = false;
  for (var i = 0; i < board.rows.length; i++) if (board.rows[i].items.length) any = true;
  board.empty = !any;
  board.netCode = '';
  paintBoardMessage(board);
  if (any) return;
  checkConnection(function (code) {
    if (!board.empty || !code) return;
    board.netCode = code;
    paintBoardMessage(board);
  });
}
/* The opening screen stays until Home has its first rows (boot.js), so Home appears once,
   filled, instead of empty rows that fill in and blink. */
var homeFilled = false,
  onHomeFilled = null;
function markHomeFilled() {
  if (homeFilled) return;
  homeFilled = true;
  if (onHomeFilled) onHomeFilled();
}
/* generic catalog-backed board loader (rows fill in asynchronously, cache-first) */
function loadCatalogRows(board, defs, includeCW, keepFocus) {
  var oldRow = board.rowIdx,
    oldCols = [],
    loadGen = (board._loadGen || 0) + 1;
  board._loadGen = loadGen;
  board.empty = false;
  var waiting = defs.length,
    firstRows = Math.min(3, defs.length),
    started = Date.now();
  if (board === home && !firstRows) markHomeFilled();
  if (keepFocus) for (var i0 = 0; i0 < board.rows.length; i0++) oldCols.push(board.rows[i0].col);
  board.rows = [];
  function reveal(row, delay) {
    if (keepFocus) {
      row.el.className = 'row in';
      return;
    }
    setTimeout(function () {
      row.el.className = 'row in';
    }, delay);
  }
  if (includeCW) {
    var cw = cwItems();
    if (cw.length) {
      var cwMapped = [];
      for (var c = 0; c < cw.length; c++) cwMapped.push(cwCard(cw[c]));
      var r0 = buildRow(tx('continueWatching'), cwMapped, true);
      board.rows.push(r0);
      reveal(r0, 70);
    }
    /* Home also surfaces new episodes of followed series and the titles added to the
       library, which otherwise only appear in the Library section */
    var fresh = newEpisodeItems();
    if (fresh.length) {
      var rn = buildRow(tx('newEpisodes'), fresh, true);
      board.rows.push(rn);
      reveal(rn, 90);
    }
    var mine = libGridItems().slice(0, 20),
      mineMapped = [];
    for (var mi = 0; mi < mine.length; mi++)
      mineMapped.push({
        id: mine[mi]._id,
        type: mine[mi].type,
        name: mine[mi].name,
        poster: mine[mi].poster,
        background: mine[mi].background
      });
    if (mineMapped.length) {
      var rm = buildRow(tx('myList'), mineMapped, false);
      board.rows.push(rm);
      reveal(rm, 110);
    }
  }
  for (var d = 0; d < defs.length; d++)
    (function (def, di) {
      /* a Collections row: folder tiles, already known, nothing to fetch */
      if (def.tiles) {
        var tileRow = buildRow(def.title, def.tiles, true, false, di < 3);
        board.rows.push(tileRow);
        reveal(tileRow, 120 + di * 80);
        waiting--;
        if (di < 3) firstRows--;
        if (board === home && (!firstRows || !waiting)) markHomeFilled();
        return;
      }
      var row = buildRow(def.title, [], false);
      row.catalog = def;
      board.rows.push(row);
      /* only the rows that start on screen get placeholders; a rebuild keeps its rows */
      if (!keepFocus && di < 3) placeholderCards(row);
      else row.el.style.display = 'none';
      getCatalogUrl(def.url, def.key, def.type, function (items, cached) {
        if (board._loadGen !== loadGen) return; /* ignore callbacks from a superseded rebuild */
        /* A row already shown from the cache keeps it once Home is on screen: the fresher
           list is saved for the next start instead of redrawing the row under the viewer. */
        if (!cached && row.fromCache && homeFilled && row.items.length) return;
        row.fromCache = !!cached;
        if (!row.answered) {
          row.answered = true;
          waiting--;
          if (di < 3) firstRows--;
          if (board === home && (!firstRows || !waiting)) markHomeFilled();
          /* shown by Settings > Diagnostics */
          if (!waiting && board === home) window.__SC_HOME_LOAD_MS__ = Date.now() - started;
        }
        if (def.skip)
          items = items.filter(function (x) {
            return x.id !== def.skip;
          });
        row.items = items.slice(0);
        row.cardsEl.innerHTML = '';
        row.cardEls = [];
        for (var i = 0; i < items.length; i++) {
          var cd = makeCard(items[i], false, false, false);
          /* the most popular catalog shows its first ten as a ranking */
          if (def.ranked && i < 10) {
            var rank = document.createElement('div');
            rank.className = 'rank';
            rank.textContent = String(i + 1);
            cd.appendChild(rank);
          }
          row.cardsEl.appendChild(cd);
          row.cardEls.push(cd);
        }
        if (items.length >= 6) addSeeAll(row, def);
        row.el.style.display = items.length ? '' : 'none';
        if (items.length) reveal(row, 180 + di * 120);
        if (row.col >= items.length) row.col = 0;
        if (curBoard() === board) {
          board.paint(true);
          board.hero();
        }
        if (!waiting || items.length) settleBoardMessage(board);
      });
    })(defs[d], d);
  if (!waiting) settleBoardMessage(board);
  if (keepFocus) {
    board.rowIdx = Math.min(oldRow, board.rows.length - 1);
    for (var j = 0; j < board.rows.length && j < oldCols.length; j++)
      board.rows[j].col = Math.min(oldCols[j] || 0, Math.max(0, board.rows[j].items.length - 1));
  } else board.rowIdx = 0;
}
/* the last card of a catalog row opens the whole catalog in Discover */
function addSeeAll(row, def) {
  var it = { more: true, catalog: def, type: def.type, name: def.title, description: tx('seeAllHint') };
  var cd = document.createElement('div');
  cd.className = 'card more';
  var lb = document.createElement('div');
  lb.className = 'morelbl';
  lb.textContent = tx('seeAll');
  cd.appendChild(lb);
  row.items.push(it);
  row.cardsEl.appendChild(cd);
  row.cardEls.push(cd);
}
/* "Because you watched X": the popular titles of the genre of what was watched last, from
   Cinemeta. Only when that title's details are already on the TV, so Home never waits for it. */
function becauseYouWatchedDef() {
  var last = cwItems(1)[0];
  if (!last || !last.id) return null;
  var kept = lsJson('beta_meta_' + last.type + '_' + last.id),
    meta = kept && kept.meta,
    genre = meta && meta.genres && meta.genres[0];
  if (!genre) return null;
  return {
    title: tx('becauseYouWatched', meta.name || last.name || ''),
    type: last.type,
    url: CIN + '/catalog/' + last.type + '/top/genre=' + encodeURIComponent(genre) + '.json',
    key: 'byw_' + last.type + '_' + genre,
    skip: last.id
  };
}
/* HOME rows = YOUR addon catalogs (in order); Cinemeta defaults if none configured */
function homeDefs() {
  var tiles = collectionTileDefs();
  /* with Nuvio Collections, Home is those collections only, as in Nuvio's own apps */
  if (tiles.length) return tiles;
  var cats = homeCatalogs();
  if (!cats.length)
    cats = [
      {
        title: tx('popularMovies'),
        type: 'movie',
        url: CIN + '/catalog/movie/top.json',
        key: 'cin_m_top',
        ranked: true
      },
      { title: tx('popularSeries'), type: 'series', url: CIN + '/catalog/series/top.json', key: 'cin_s_top' },
      { title: tx('topMovies'), type: 'movie', url: CIN + '/catalog/movie/imdbRating.json', key: 'cin_m_ir' },
      {
        title: tx('topSeries'),
        type: 'series',
        url: CIN + '/catalog/series/imdbRating.json',
        key: 'cin_s_ir'
      }
    ];
  /* an addon's own "popular" catalog ranks its first ten too */
  for (var i = 0; i < cats.length; i++)
    if (/\/catalog\/[^\/]+\/top\.json$/.test(cats[i].url || '')) {
      cats[i].ranked = true;
      break;
    }
  return cats;
}
/* DISCOVER rows = trending + top + a spread of genres */
var DGEN = [
  ['Action', 'genreAction'],
  ['Comedy', 'genreComedy'],
  ['Sci-Fi', 'genreSciFi'],
  ['Drama', 'genreDrama'],
  ['Horror', 'genreHorror']
];
/* LIBRARY rows = Continue Watching + your added Movies + Series (all local) */
/* Continue Watching lives on Home only, as in the Stremio apps */
function loadLibraryRows(board) {
  board.rows = [];
  var all = libGridItems(),
    mv = [],
    sr = [];
  for (var i = 0; i < all.length; i++) {
    var l = all[i];
    var o = { id: l._id, type: l.type, name: l.name, poster: l.poster, background: l.background };
    if (l.type === 'series') sr.push(o);
    else mv.push(o);
  }
  if (mv.length) {
    var rm = buildRow(tx('movies'), mv, false, true);
    rm.el.className = 'row in';
    board.rows.push(rm);
  }
  if (sr.length) {
    var rs = buildRow(tx('series'), sr, false, true);
    rs.el.className = 'row in';
    board.rows.push(rs);
  }
  if (!board.rows.length) {
    var e = document.createElement('div');
    e.className = 'row in';
    e.innerHTML = emptyState(tx('emptyLibraryTitle'), tx('emptyLibraryHint'));
    board.rows.push({ el: e, items: [], cardEls: [], cardsEl: document.createElement('div'), col: 0 });
  }
  board.rowIdx = 0;
}
/* rebuild boards that surface library/CW state after a change */
function invalidateBoards() {
  home.built = false;
  disc.built = false;
  lib.built = false;
}
function refreshCurBoard() {
  var b = curBoard();
  if (b) {
    b.built = false;
    b.enter();
  }
}
/* back-compat shim (addon sync + boot) */
function buildHomeRows(keep) {
  home.built = false;
  if (SCR === 'home') home.enter();
}

function openItem(it) {
  if (it.folder) {
    goScr('fold', { folder: it.folder });
    return;
  }
  if (it.more) {
    disc.openCatalog(it.catalog);
    return;
  }
  if (it.cw) {
    var q = resumeSearch(it.id, it.videoId);
    var backHash =
      'beta#detail/' + it.type + '/' + it.id + (it.videoId && it.videoId !== it.id ? '/' + it.videoId : '');
    if (q) {
      playStored(q, backHash);
      return;
    }
  }
  goScr('detail', { type: it.type, id: it.id, vid: it.videoId || null });
}
// Trailer resolution (via /yt) and the trailer player.
/* ================= trailers (server /yt resolves a direct mp4) ================= */
function ytPlay(t, backHash) {
  toast(tx('loadingTrailer'));
  xhrJson(
    '/yt?v=' + encodeURIComponent(t),
    function (j) {
      if (j && j.url) playUrl(j.url, 'other', '', '', backHash);
      else toast(tx(openYoutubeApp(t) ? 'trailerInYoutube' : 'trailerUnavailable'));
    },
    14000
  );
}
function trailerIdOf(m) {
  var t = null;
  if (m) {
    if (m.trailers && m.trailers.length) t = m.trailers[0].source;
    if (!t && m.trailerStreams && m.trailerStreams.length) t = m.trailerStreams[0].ytId;
  }
  return t;
}
function trailerFor(type, id, backHash) {
  getMeta(type, id, function (m) {
    var t = trailerIdOf(m);
    if (!t) {
      toast(tx('noTrailer'));
      return;
    }
    ytPlay(t, backHash || 'beta');
  });
}
// Library add/remove and watched state.
/* ================= library helpers (explicit add only — watching never adds) ================= */
function libHas(id) {
  var it = lsJson(PRE + id);
  return !!(it && it.removed === false);
}
/* A film counts as watched when Stremio says so (times watched or the watched flag, also
   set by other devices, which reset the position to 0 once a film ends), when it is in the
   local watched list, or when it stopped in the credits (past 90 %). */
function itemWatched(it) {
  if (!it || !it.id || it.type === 'series') return false;
  var lib = lsJson(PRE + it.id);
  if (!lib || !lib.state) return false;
  var s = lib.state;
  var vid = it.videoId || it.id;
  if (s.timesWatched > 0 || s.flaggedWatched > 0) return true;
  if (s.watchedEpisodes)
    for (var i = 0; i < s.watchedEpisodes.length; i++) if (s.watchedEpisodes[i] === vid) return true;
  return watchFinished(s.timeOffset, s.duration);
}
function libToggle(item) {
  var now = new Date().toISOString();
  var it = lsJson(PRE + item.id);
  if (it && it.removed === false) {
    it.removed = true;
    it._mtime = now;
    lsSet(PRE + item.id, it);
    toast(tx('removedLibrary'));
  } else {
    if (!it)
      it = {
        state: {
          lastWatched: now,
          timeOffset: 0,
          timeWatched: 0,
          overallTimeWatched: 0,
          timesWatched: 0,
          flaggedWatched: 0,
          duration: 0,
          video_id: item.id,
          watched: '',
          noNotif: false,
          season: 0,
          episode: 0,
          watchedEpisodes: []
        },
        _id: item.id,
        _ctime: now
      };
    it.removed = false;
    it.temp = false;
    it._mtime = now;
    it.name = item.name || it.name || '';
    it.type = item.type;
    it.poster = item.poster || it.poster || '';
    it.posterShape = 'poster';
    it.background = item.background || it.background || '';
    lsSet(PRE + item.id, it);
    toast(tx('addedLibrary'));
  }
  pushLib(lsJson(PRE + item.id));
  invalidateBoards();
}
/* Leaves Continue Watching without marking anything watched, as Stremio dismisses an
   item: the saved position returns to the start. Synced like any library change. */
function dismissCw(id) {
  var lib = lsJson(PRE + id);
  if (!lib || !lib.state) return null;
  lib.state.timeOffset = 0;
  lib._mtime = new Date().toISOString();
  lsSet(PRE + id, lib);
  return lib;
}
function removeFromCw(it) {
  var lib = dismissCw(it.id);
  if (lib) pushLib(lib);
  invalidateBoards();
}
function clearContinueWatching() {
  var items = cwItems(1000),
    changed = [];
  for (var i = 0; i < items.length; i++) {
    var lib = dismissCw(items[i]._id);
    if (lib) changed.push(lib);
  }
  pushLibItems(changed);
  invalidateBoards();
  return changed.length;
}
function clearRecentSearches() {
  lsSet(RECENT_SEARCH_KEY, []);
  search.recentSig = null;
}
/* Marked watched as the official apps do: the watched flag, one more time watched and,
   for an episode, its bit in state.watched (written by the local server, which has the
   episode list), so other devices show it too. */
function markCwWatched(it) {
  var lib2 = lsJson(PRE + it.id);
  if (!lib2) return;
  var s2 = lib2.state || {};
  var vid = s2.video_id || it.videoId || it.id;
  if (!s2.watchedEpisodes) s2.watchedEpisodes = [];
  if (s2.watchedEpisodes.indexOf(vid) < 0) s2.watchedEpisodes.push(vid);
  if (!s2.flaggedWatched) s2.timesWatched = (s2.timesWatched || 0) + 1;
  s2.flaggedWatched = 1;
  s2.timeOffset = 0;
  lib2.state = s2;
  lib2._mtime = new Date().toISOString();
  lsSet(PRE + it.id, lib2);
  pushLib(lib2);
  invalidateBoards();
  if (lib2.type !== 'series' || vid === it.id) return;
  xhrJson(
    '/watchedset?id=' +
      encodeURIComponent(it.id) +
      '&vid=' +
      encodeURIComponent(vid) +
      '&f=' +
      encodeURIComponent(s2.watched || ''),
    function (j) {
      var cur = lsJson(PRE + it.id);
      if (!j || !j.watched || !cur || !cur.state) return;
      cur.state.watched = j.watched;
      cur._mtime = new Date().toISOString();
      lsSet(PRE + it.id, cur);
      pushLib(cur);
    }
  );
}
// Long-press OK side menu available on every card.
/* ================= unified long-press side menu (any card) ================= */
var cwMenu = {
  open: false,
  idx: 0,
  els: [],
  acts: [],
  it: null,
  /* the panel with a title, a subtitle and no entries yet (show, confirmExit) */
  begin: function (title, sub) {
    this.open = true;
    this.idx = 0;
    this.onBack = null;
    $('cwmItems').innerHTML = '';
    this.els = [];
    this.acts = [];
    $('cwmTitle').textContent = title || '';
    $('cwmSub').textContent = sub;
  },
  add: function (ic, lb, fn) {
    var d = document.createElement('div');
    d.className = 'cwmi';
    d.innerHTML = ic + '<span>' + esc(lb) + '</span>';
    $('cwmItems').appendChild(d);
    this.els.push(d);
    this.acts.push(fn);
  },
  /* Back on the last screen asks before leaving the app, so a few presses too many
     do not close Stremio by accident */
  confirmExit: function () {
    var self = this;
    this.it = null;
    this.begin(tx('exitTitle'), tx('exitSub'));
    this.add(ICON.check, tx('exitStay'), function () {
      self.close();
    });
    this.add(ICON.exit, tx('exitLeave'), function () {
      self.close();
      exitApp();
    });
    $('cwm').style.display = 'block';
    this.paint();
  },
  /* Left or Back: a list opened from another one goes back to it, anything else closes */
  back: function () {
    if (this.onBack) this.onBack();
    else this.close();
  },
  /* Best source asks the quality and the audio language, unless Settings names them. The first
     row, "Audio: Português ›", opens the list of languages (the choice is kept for the next
     time); the other rows start the film. then(quality, language) */
  withBestChoice: function (then) {
    var quality = lsRaw('preferredSourceQuality', 'Ask'),
      askLanguage = lsRaw('preferredSourceLanguage', 'Ask') === 'Ask',
      language = preferredSourceLanguage(),
      self = this;
    if (quality !== 'Ask' && !askLanguage) return then(quality, language);
    function languageName(code) {
      return code === 'Auto' ? tx('anyAudioLanguage') : sourceLanguageName(code);
    }
    function qualities() {
      self.begin(
        tx(quality === 'Ask' ? 'whichQuality' : 'playBest'),
        language === 'Auto' ? tx('bestAudioAny') : tx('bestAudioHint', sourceLanguageName(language))
      );
      if (askLanguage)
        self.add(GLOBE_ICON, tx('sourceLanguageRow', languageName(language)) + '  \u203a', languages);
      var options =
        quality === 'Ask'
          ? [
              ['1080p', '1080p'],
              ['720p', '720p'],
              ['4K', '4K'],
              ['Auto', tx('automatic')]
            ]
          : [[quality, tx('playBest')]];
      options.forEach(function (option) {
        self.add(ICON.bolt, option[1], function () {
          self.close();
          then(option[0], language);
        });
      });
      /* the focus starts on the first quality, the language row stays one step up */
      self.idx = askLanguage ? 1 : 0;
      self.paint();
    }
    function languages() {
      self.begin(tx('audioLanguageTitle'), tx('audioLanguageSub'));
      self.onBack = qualities;
      ['Auto']
        .concat(
          SOURCE_LANGUAGES.map(function (l) {
            return l[0];
          })
        )
        .forEach(function (code, i) {
          if (code === language) self.idx = i;
          self.add(
            code === language ? ICON.check : '<svg viewBox="0 0 24 24"></svg>',
            languageName(code),
            function () {
              language = code;
              lsRawSet('bestLanguage', code);
              qualities();
            }
          );
        });
      self.paint();
    }
    this.it = null;
    $('cwm').style.display = 'block';
    qualities();
  },
  show: function (it) {
    this.it = it;
    var self = this;
    var sub = it.type === 'series' ? tx('seriesOne') : tx('movie');
    if (it.cw && it.videoId && it.videoId.indexOf(':') > 0) {
      var pp = it.videoId.split(':');
      sub = tx('seasonEpisode', pp[pp.length - 2], pp[pp.length - 1]);
    }
    this.begin(it.name, sub);
    function add(ic, lb, fn) {
      self.add(ic, lb, fn);
    }
    add(ICON.play, it.cw ? tx('continueLabel') : tx('watch'), function () {
      self.close();
      openItem(it);
    });
    add(ICON.info, tx('details'), function () {
      self.close();
      goScr('detail', { type: it.type, id: it.id, vid: it.videoId || null });
    });
    add(ICON.similar, tx('similarTitles'), function () {
      self.close();
      goScr('sim', { type: it.type, id: it.id, name: it.name });
    });
    add(ICON.trailer, tx('trailer'), function () {
      self.close();
      trailerFor(it.type, it.id, 'beta');
    });
    if (it.cw)
      add(ICON.check, tx('markWatched'), function () {
        markCwWatched(it);
        self.close();
        refreshCurBoard();
        toast(tx('markedWatched'));
      });
    if (it.cw)
      add(ICON.close, tx('removeFromCw'), function () {
        removeFromCw(it);
        self.close();
        refreshCurBoard();
        toast(tx('removedFromCw'));
      });
    if (it.fresh)
      add(ICON.close, tx('hideNewEpisodes'), function () {
        hideNewEpisodes(it.id);
        self.close();
        buildHomeRows(true);
        toast(tx('newEpisodesHidden'));
      });
    add(
      libHas(it.id) ? ICON.check : ICON.plus,
      libHas(it.id) ? tx('removeLibrary') : tx('addLibrary'),
      function () {
        libToggle(it);
        self.close();
        refreshCurBoard();
      }
    );
    $('cwm').style.display = 'block';
    this.paint();
  },
  paint: function () {
    setF(this.els, this.idx);
  },
  close: function () {
    this.open = false;
    $('cwm').style.display = 'none';
  },
  key: function (k) {
    if (k === 40) this.idx = Math.min(this.els.length - 1, this.idx + 1);
    else if (k === 38) this.idx = Math.max(0, this.idx - 1);
    else if (k === 13) {
      var a = this.acts[this.idx];
      if (a) a();
      return true;
    } else if (k === 37) {
      this.back();
      return true;
    }
    this.paint();
    return true;
  }
};
/* ---- a newer version, from the side menu's Update item ----
   On LG the Homebrew Channel installs it from here; elsewhere, or when the TV refuses, the
   Homebrew Channel opens (or the viewer is told where to update). */
var pendingUpdate = null;
function offerUpdate() {
  var info = pendingUpdate;
  if (!info) return;
  cwMenu.it = null;
  cwMenu.begin(tx('updateTitle', info.version), tx('updateSub'));
  cwMenu.add(ICON.check, tx('updateNow'), function () {
    cwMenu.close();
    toast(tx('updateStarting'), 60000);
    installUpdate(
      info,
      function (text, percent) {
        toast(percent != null ? tx('updateProgress', percent) : tx('updateInstalling'), 60000);
      },
      function (ok) {
        if (ok) return toast(tx('updateInstalling'), 60000);
        toast(tx('updateElsewhere'), 9000);
        openUpdater();
      }
    );
  });
  cwMenu.add(ICON.close, tx('updateLater'), function () {
    cwMenu.close();
  });
  $('cwm').style.display = 'block';
  cwMenu.paint();
}
// Grid of similar titles.
/* ================= SIMILAR (grid of same-genre titles) ================= */
var similar = {
  items: [],
  els: [],
  idx: 0,
  cols: 6,
  gen: 0,
  enter: function (p) {
    p = p || { type: detail.type, id: detail.id };
    var self = this,
      gen = ++this.gen;
    this.items = [];
    this.els = [];
    this.idx = 0;
    $('simTitle').textContent = tx('similar');
    var host = $('simGrid');
    host.innerHTML =
      '<div style="font-size:27px;color:rgba(255,255,255,.55);padding:40px">' +
      tx('findingSimilar') +
      '</div>';
    getMeta(p.type, p.id, function (m) {
      if (SCR !== 'sim' || self.gen !== gen) return;
      var nm = (m && m.name) || p.name || '';
      if (nm) $('simTitle').textContent = tx('similarTo', nm);
      var g = m && m.genres && m.genres.length ? m.genres[0] : '';
      var u = CIN + '/catalog/' + p.type + '/top' + (g ? '/genre=' + encodeURIComponent(g) : '') + '.json';
      xhrJson(u, function (j) {
        if (SCR !== 'sim' || self.gen !== gen) return;
        var metas = (j && j.metas) || [];
        host.innerHTML = '';
        for (var i = 0; i < metas.length && self.items.length < 30; i++) {
          var mm = metas[i];
          if (mm.id === p.id) continue;
          var it = {
            id: mm.id,
            type: mm.type || p.type,
            name: mm.name,
            poster: mm.poster,
            background: mm.background
          };
          self.items.push(it);
          var cd = makeCard(it, false, true, false);
          host.appendChild(cd);
          self.els.push(cd);
        }
        if (!self.items.length) host.innerHTML = emptyState(tx('nothingFound'), tx('similarEmptyHint'));
        self.idx = Math.max(0, Math.min(p.idx || 0, self.items.length - 1));
        self.paint();
      });
    });
  },
  paint: function () {
    setF(this.els, topNav.active ? -1 : this.idx);
    var rowH = this.els[0] ? this.els[0].offsetHeight + 26 : 470;
    var row = Math.floor(this.idx / this.cols);
    for (var i = 0; i < this.els.length; i++) {
      var imgs = this.els[i].getElementsByTagName('img'),
        near = Math.abs(Math.floor(i / this.cols) - row) <= 1;
      for (var z = 0; z < imgs.length; z++) {
        var im = imgs[z];
        if (near && im._full) {
          im.src = im._full;
          im._full = null;
        } else if (!near && im.src && im.src !== BLANK_IMG) {
          im._full = im.src;
          im.src = BLANK_IMG;
        }
      }
    }
    var y = Math.max(0, row - 1) * rowH;
    if (row <= 0) y = 0;
    $('simGrid').style.transform = 'translateY(-' + y + 'px)';
    $('simGrid').style.webkitTransform = 'translateY(-' + y + 'px)';
  },
  key: function (k) {
    if (!this.els.length) return true;
    if (k === 39) this.idx = Math.min(this.els.length - 1, this.idx + 1);
    else if (k === 37) {
      if (this.idx > 0) this.idx--;
    } else if (k === 40) this.idx = Math.min(this.els.length - 1, this.idx + this.cols);
    else if (k === 38) {
      if (this.idx - this.cols >= 0) this.idx -= this.cols;
    } else if (k === 13) {
      var it = this.items[this.idx];
      if (it) goScr('detail', { type: it.type, id: it.id, vid: null });
      return true;
    }
    this.paint();
    return true;
  }
};
// Series episode model: season order, continuous numbering and metadata enrichment.
function episodeNumber(v, fallback) {
  var n = parseInt(v && (v.episode != null ? v.episode : v.number), 10);
  return n > 0 ? n : fallback;
}
function explicitAbsoluteEpisode(v) {
  var keys = ['absoluteEpisode', 'absolute_episode', 'absoluteNumber', 'absolute_number', 'episodeAbsolute'];
  for (var i = 0; i < keys.length; i++) {
    var n = parseInt(v && v[keys[i]], 10);
    if (n > 0) return n;
  }
  return 0;
}
function releasedTime(v) {
  var t = Date.parse((v && (v.released || v.firstAired)) || '');
  return isNaN(t) ? 0 : t;
}
/* an episode without a date counts as released: addons often omit it */
function episodeReleased(v, now) {
  var t = releasedTime(v);
  return !t || t <= (now || Date.now());
}
/* Episodes sort by number. Chromium 38/53 sort is not stable beyond 10 items, so ties
   (missing or repeated numbers) fall back to the release date and then to the order
   the addon sent, which keeps the list and the overall numbering identical on every
   opening. Unnumbered episodes go after the numbered ones of their season. */
function episodeOrder(a, b) {
  var na = episodeNumber(a, 0),
    nb = episodeNumber(b, 0);
  if (na && nb && na !== nb) return na - nb;
  if (!na !== !nb) return na ? -1 : 1;
  var ra = releasedTime(a),
    rb = releasedTime(b);
  if (ra && rb && ra !== rb) return ra - rb;
  return a._stremOrder - b._stremOrder;
}
function buildEpisodeModel(videos) {
  var bySeason = {},
    order = [],
    seen = {},
    hasSeasons = false,
    i,
    s,
    v,
    eps,
    o,
    sn,
    last,
    cursor = 0,
    seasons = [],
    linear = [];
  videos = videos || [];
  for (i = 0; i < videos.length; i++) if (videos[i] && videos[i].season != null) hasSeasons = true;
  for (i = 0; i < videos.length; i++) {
    v = videos[i];
    if (!v || (v.id && seen[v.id])) continue; /* an addon listing the same video twice */
    if (v.id) seen[v.id] = 1;
    v._stremOrder = i;
    /* without any season field (channel-like series) the videos are one regular
       season, not specials, so they still get an overall numbering */
    s = v.season != null ? parseInt(v.season, 10) : hasSeasons ? 0 : 1;
    if (isNaN(s)) s = 0;
    if (!bySeason[s]) {
      bySeason[s] = [];
      order.push(s);
    }
    bySeason[s].push(v);
  }
  order.sort(function (a, b) {
    if (a === 0) return 1;
    if (b === 0) return -1;
    return a - b;
  });
  for (o = 0; o < order.length; o++) {
    sn = order[o];
    eps = bySeason[sn];
    eps.sort(episodeOrder);
    last = 0;
    for (i = 0; i < eps.length; i++) {
      v = eps[i];
      v._stremSeason = sn;
      /* an unnumbered episode continues after the highest number seen, never reusing one */
      v._stremSeasonEpisode = episodeNumber(v, last + 1);
      last = Math.max(last, v._stremSeasonEpisode);
      if (sn === 0) v._stremAbsolute = 0;
      else {
        var ex = explicitAbsoluteEpisode(v);
        cursor = ex > 0 ? Math.max(cursor + 1, ex) : cursor + 1;
        v._stremAbsolute = cursor;
        linear.push(v);
      }
    }
    seasons.push({ n: sn, eps: eps });
  }
  return { seasons: seasons, linear: linear };
}
/* Episodes watched on any Stremio app, from the library item's `watched` field decoded by
   the local server (/watchedbits). Same rule as stremio-watched-bitfield: video ids ordered
   by season then episode (season 0 first, ties keep the addon order), and the stored bits
   shifted so that the anchor video keeps its position. An unknown anchor means none. */
function watchedFromBits(res, videos) {
  var list = [],
    out = {},
    i;
  for (i = 0; i < (videos || []).length; i++)
    if (videos[i] && videos[i].id) list.push({ v: videos[i], i: i });
  function num(x) {
    var n = parseInt(x, 10);
    return isNaN(n) ? -Infinity : n;
  }
  list.sort(function (a, b) {
    var sa = num(a.v.season),
      sb = num(b.v.season),
      ea = num(a.v.episode != null ? a.v.episode : a.v.number),
      eb = num(b.v.episode != null ? b.v.episode : b.v.number);
    if (sa !== sb) return sa < sb ? -1 : 1;
    if (ea !== eb) return ea < eb ? -1 : 1;
    return a.i - b.i;
  });
  var at = -1;
  for (i = 0; i < list.length; i++) if (list[i].v.id === res.anchor) at = i;
  if (at < 0 || !res.bits) return out;
  var offset = (parseInt(res.alen, 10) || 0) - at - 1;
  for (i = 0; i < list.length; i++) {
    var j = i + offset;
    if (j >= 0 && j < res.bits.length && res.bits[j]) out[list[i].v.id] = 1;
  }
  return out;
}
window.__SC_WATCHED_FROM_BITS__ = watchedFromBits;
function episodeImage(v, meta) {
  var u = (v && (v.thumbnail || v.still || v.stillPath || v.still_path)) || '';
  if (u && String(u).charAt(0) === '/') u = 'https://image.tmdb.org/t/p/w500' + u;
  return u;
}
function episodeIndexByNumber(items, n) {
  for (var i = 0; i < (items || []).length; i++) if (items[i]._stremAbsolute === n) return i;
  return -1;
}
window.__SC_EPISODE_INDEX__ = episodeIndexByNumber;
function episodeFallback(meta, small) {
  if (!meta) return '';
  return small ? bgSmall(meta) || posterOf(meta) : meta.background || bgOf(meta) || meta.poster || '';
}
function mergeEpisodeDetails(base, extra) {
  if (!base || !extra || !base.videos || !extra.videos) return false;
  var byId = {},
    byNum = {},
    i,
    v,
    x,
    k,
    changed = false,
    fields = [
      'thumbnail',
      'still',
      'stillPath',
      'still_path',
      'overview',
      'description',
      'name',
      'title',
      'absoluteEpisode',
      'absolute_episode',
      'absoluteNumber',
      'absolute_number'
    ];
  for (i = 0; i < extra.videos.length; i++) {
    x = extra.videos[i];
    if (x.id) byId[x.id] = x;
    k = String(x.season == null ? 0 : x.season) + ':' + String(episodeNumber(x, i + 1));
    byNum[k] = x;
  }
  for (i = 0; i < base.videos.length; i++) {
    v = base.videos[i];
    x =
      (v.id && byId[v.id]) ||
      byNum[String(v.season == null ? 0 : v.season) + ':' + String(episodeNumber(v, i + 1))];
    if (!x) continue;
    for (var f = 0; f < fields.length; f++) {
      k = fields[f];
      if (!v[k] && x[k]) {
        v[k] = x[k];
        changed = true;
      }
    }
  }
  return changed;
}
function enrichEpisodeMetadata(type, id, meta, cb) {
  if (type !== 'series' || !meta || !meta.videos || !meta.videos.length) {
    cb(false);
    return;
  }
  var bases = metaAddonsFor(type, id),
    seen = {},
    queue = [];
  for (var i = 0; i < bases.length; i++) {
    var b = bases[i];
    if (b && b !== CIN && !seen[b]) {
      seen[b] = 1;
      queue.push(b);
    }
  }
  var at = 0,
    changed = false;
  function next() {
    if (at >= queue.length) {
      cb(changed);
      return;
    }
    var b = queue[at++];
    xhrJson(
      b + '/meta/' + type + '/' + encodeURIComponent(id) + '.json' + addonQueryFor(addons(), b),
      function (j) {
        if (j && j.meta) changed = mergeEpisodeDetails(meta, j.meta) || changed;
        next();
      },
      4500
    );
  }
  next();
}
window.__SC_EPISODE_MODEL__ = buildEpisodeModel;
window.__SC_MERGE_EPISODES__ = mergeEpisodeDetails;
// Series that gained episodes since they were last watched, for the Home row.
/* Checked at most once a day, for the few series watched most recently, one metadata
   request at a time in the background after Home is up. The result is stored and shown
   the next time Home is built, so a row never appears under the viewer's focus. */
var NEW_EPISODES_KEY = 'newEpisodes',
  NEW_EPISODES_HIDDEN = 'newEpisodesHidden',
  NEW_EPISODES_EVERY = 24 * 60 * 60 * 1000;
/* the series the viewer took out of the row (card menu) */
function hiddenNewEpisodes() {
  return lsJson(NEW_EPISODES_HIDDEN) || [];
}
function newEpisodeItems() {
  var c = lsJson(NEW_EPISODES_KEY),
    hidden = hiddenNewEpisodes();
  return ((c && c.items) || []).filter(function (it) {
    return hidden.indexOf(it.id) < 0;
  });
}
function hideNewEpisodes(id) {
  var hidden = hiddenNewEpisodes();
  if (hidden.indexOf(id) < 0) hidden.push(id);
  lsSet(NEW_EPISODES_HIDDEN, hidden);
}
/* the first aired, unwatched regular episode released after the series was last watched */
function firstNewEpisode(meta, state) {
  var since = Date.parse(state.lastWatched || '') || 0,
    now = Date.now(),
    seen = {},
    best = null,
    bestAt = 0,
    count = 0,
    we = state.watchedEpisodes || [];
  for (var w = 0; w < we.length; w++) seen[we[w]] = 1;
  var videos = (meta && meta.videos) || [];
  for (var i = 0; i < videos.length; i++) {
    var v = videos[i],
      at = releasedTime(v);
    if (!v || !v.id || !(parseInt(v.season, 10) > 0) || seen[v.id]) continue;
    if (!at || at <= since || at > now) continue;
    count++;
    if (!best || at < bestAt) {
      best = v;
      bestAt = at;
    }
  }
  return best ? { id: best.id, count: count } : null;
}
window.__SC_FIRST_NEW_EPISODE__ = firstNewEpisode;
function checkNewEpisodes(done) {
  var cached = lsJson(NEW_EPISODES_KEY);
  if (cached && cached.at && Date.now() - cached.at < NEW_EPISODES_EVERY) {
    done(false);
    return;
  }
  var lib = allLib(),
    series = [];
  for (var i = 0; i < lib.length; i++) {
    var it = lib[i],
      s = it.state || {};
    if (it.type !== 'series' || !it._id || hiddenNewEpisodes().indexOf(it._id) >= 0) continue;
    if (it.removed && !(s.timeOffset > 0) && !(s.watchedEpisodes && s.watchedEpisodes.length)) continue;
    series.push(it);
  }
  series.sort(function (a, b) {
    return String(b._mtime || '').localeCompare(String(a._mtime || ''));
  });
  series = series.slice(0, TV_PROFILE.lowMemory ? 3 : 6);
  var found = [],
    at = 0;
  function next() {
    if (at >= series.length) {
      var before = JSON.stringify(newEpisodeItems());
      lsSet(NEW_EPISODES_KEY, { at: Date.now(), items: found });
      done(JSON.stringify(found) !== before);
      return;
    }
    var it = series[at++];
    getMeta('series', it._id, function (m) {
      var ep = m && firstNewEpisode(m, it.state || {});
      if (ep)
        found.push({
          id: it._id,
          type: 'series',
          name: (m && m.name) || it.name || '',
          poster: it.poster || (m && m.poster) || '',
          background: it.background || (m && m.background) || '',
          videoId: ep.id,
          fresh: true
        });
      next();
    });
  }
  next();
}
// Title detail screen: actions, seasons, episode ranges and episode list.
/* The title's details on one line: who directed it (when the line above names the cast), the
   country and the release date, as Cinemeta gives them. */
function titleFacts(m, castShown) {
  var parts = [];
  if (castShown && m.director && m.director.length)
    parts.push(tx('directedBy', m.director.slice(0, 2).join(', ')));
  if (m.country) parts.push(String(m.country).split(',')[0]);
  var released = m.released ? new Date(m.released) : null;
  if (released && !isNaN(released.getTime()))
    try {
      parts.push(released.toLocaleDateString(UI_LANG, { day: 'numeric', month: 'short', year: 'numeric' }));
    } catch (e) {
      parts.push(String(released.getFullYear()));
    }
  return parts.join('  ·  ');
}
var detail = {
  meta: null,
  type: '',
  id: '',
  vid: null,
  zone: 'btns',
  btnIdx: 0,
  btnEls: [],
  btnActs: [],
  baseMeta: '',
  baseDesc: '',
  baseInfo: '',
  seasons: [],
  linearEps: [],
  seasonIdx: 0,
  rangeIdx: 0,
  episodeMode: 'season',
  eps: [],
  epIdx: 0,
  epEls: [],
  seasonEls: [],
  seasonActs: [],
  seasonControlIdx: 0,
  watchedMap: {},
  enter: function (p) {
    p = p || { type: this.type, id: this.id };
    this.type = p.type;
    this.id = p.id;
    this.vid = p.vid || null;
    /* reached with Back: the viewer already saw (or dismissed) the sources */
    this.restored = !!p.restored;
    this.zone = 'btns';
    this.btnIdx = 0;
    this.meta = null;
    this.watchedMap = {};
    this.episodeMode = 'season';
    this.seasonIdx = 0;
    this.rangeIdx = 0;
    this.epIdx = 0;
    this.seasonControlIdx = 0;
    $('dTitle').textContent = '';
    $('dDesc').textContent = '';
    $('dMeta').textContent = '';
    $('dInfo').innerHTML = '';
    /* Reused image nodes must be cleared before the next metadata request. Otherwise
     paint() can reveal the previous title while the replacement is still loading. */
    $('dLogo').style.display = 'none';
    $('dLogo').src = BLANK_IMG;
    $('dBtns').innerHTML = '';
    $('dSeasons').style.display = 'none';
    $('dEps').style.display = 'none';
    var self = this;
    getMeta(this.type, this.id, function (m) {
      if (!m) {
        toast(tx('couldNotLoad'));
        return;
      }
      if (SCR !== 'detail' || detail.id !== p.id) return;
      self.meta = m;
      self.render();
      self.loadWatched();
      var keepId = self.currentEpisode() && self.currentEpisode().id;
      enrichEpisodeMetadata(self.type, self.id, m, function (changed) {
        if (!changed || SCR !== 'detail' || detail.id !== p.id) return;
        self.buildSeasons();
        if (keepId) self.selectEpisode(keepId, true);
        self.paint();
      });
    });
  },
  render: function () {
    var m = this.meta;
    $('dTitle').textContent = m.name || '';
    var lg = $('dLogo');
    var mediaId = this.id;
    if (m.logo) {
      /* the logo box is reserved at once (fixed size in detail.css), so the meta, buttons
         and episodes do not move when the logo arrives; the text title is the fallback */
      lg.style.display = 'block';
      $('dTitle').style.display = 'none';
      var im = new Image();
      im.onload = function () {
        if (detail.meta === m && detail.id === mediaId) lg.src = m.logo;
      };
      im.onerror = function () {
        if (detail.meta === m && detail.id === mediaId) {
          lg.style.display = 'none';
          $('dTitle').style.display = 'block';
        }
      };
      im.src = m.logo;
    } else {
      $('dTitle').style.display = 'block';
    }
    /* the same info line as the Home hero, followed by the genres */
    $('dMeta').innerHTML =
      heroMetaHtml(m) +
      (m.genres && m.genres.length ? '<span>' + esc(m.genres.slice(0, 3).join(' · ')) + '</span>' : '');
    var people = m.cast && m.cast.length ? m.cast : m.director || [];
    var info = people.length ? '<div>' + esc(people.slice(0, 4).join(', ')) + '</div>' : '';
    var facts = titleFacts(m, people === m.cast);
    if (facts) info += '<div class="facts">' + esc(facts) + '</div>';
    if (m.awards) info += '<div class="awards">' + esc(m.awards) + '</div>';
    $('dInfo').innerHTML = info;
    $('dDesc').textContent = m.description || '';
    this.baseMeta = $('dMeta').innerHTML;
    this.baseInfo = info;
    this.baseDesc = m.description || '';
    setBg(m.background || bgOf({ id: this.id, poster: m.poster }));
    var bt = $('dBtns');
    bt.innerHTML = '';
    this.btnEls = [];
    this.btnActs = [];
    var self = this;
    this.loadWatched();
    if (this.type === 'series') this.buildSeasons();
    /* Series: the episode to land on is the deep-linked one, then the one in progress,
       then the first released one not watched. */
    var av = null;
    if (this.type === 'series') {
      var lib = lsJson(PRE + this.id);
      av =
        this.vid ||
        (lib && lib.state && (upNextPointer(lib) || (lib.state.timeOffset > 60000 && lib.state.video_id))) ||
        this.firstUnwatched();
      this.vid = null;
    }
    /* The first button continues or starts what the viewer most likely wants, in one press:
       "Continue S2 E5 · 12 min left", "Play S1 E9" or, for a film, "Continue · 48 min left". */
    var resume = this.resumeInfo(),
      primary = resume && (this.type !== 'series' || !av || resume.videoId === av) ? resume : null;
    if (primary)
      this.addBtn(this.resumeLabel(primary), function () {
        self.playFrom(primary);
      });
    else if (this.type === 'series' && av) {
      var first = { videoId: av, upNext: true };
      this.addBtn(this.resumeLabel(first), function () {
        self.openStreams(av);
      });
    }
    var bestFirst = simpleMode() && !primary && this.type !== 'series';
    if (bestFirst) this.addBestBtn(this.id, m.name);
    /* the whole source list; in Simple it is the one way to it */
    if (this.type !== 'series')
      this.addBtn(
        tx(simpleMode() ? 'sourcesButton' : 'watch'),
        function () {
          self.openSourceList(self.id);
        },
        primary || simpleMode() ? ICON.similar : ''
      );
    /* straight to the best source, without the list */
    var bestVid = this.type === 'series' ? av : this.id;
    if (bestVid && !bestFirst) this.addBestBtn(bestVid, m.name);
    var hasTr = (m.trailers && m.trailers.length) || (m.trailerStreams && m.trailerStreams.length);
    if (hasTr)
      this.addBtn(
        tx('trailer'),
        function () {
          self.playTrailer();
        },
        ICON.trailer
      );
    this.addBtn(
      tx('similar'),
      function () {
        goScr('sim', { type: self.type, id: self.id, name: m.name });
      },
      ICON.grid
    );
    this.libBtn = this.addBtn(
      this.inLib() ? tx('inLibrary') : tx('libraryButton'),
      function () {
        self.toggleLib();
      },
      this.inLib() ? ICON.check : ICON.plus
    );
    this.paint();
    if (this.type === 'series') {
      if (av) {
        /* the list scrolls to that episode while the focus stays on the first button */
        this.selectEpisode(av, true);
        this.zone = 'btns';
        this.btnIdx = 0;
        this.paint();
        if (hasNextSourcePreference(this.id, av)) {
          var nextSelf = this;
          setTimeout(function () {
            if (SCR === 'detail' && !streamsUI.open) nextSelf.openStreams(av);
          }, 250);
        }
      }
    }
    /* the player asked for another source after this one failed */
    var retryVid = this.type === 'series' ? av : this.id;
    if (retryVid && hasRetryRequest(this.id, retryVid))
      setTimeout(function () {
        if (SCR === 'detail' && !streamsUI.open) self.openStreams(retryVid);
      }, 250);
    else if (this.type !== 'series' && !this.restored && !primary) {
      /* a new film opens its sources; one in progress, or one the viewer just came back
         from, waits on its Continue / Watch buttons instead */
      setTimeout(function () {
        if (SCR === 'detail' && detail.meta === m && !streamsUI.open) self.openStreams(self.id);
      }, 250);
    }
  },
  /* saved progress worth offering, in the Continue Watching card shape (account.js) */
  resumeInfo: function () {
    var lib = lsJson(PRE + this.id),
      s = lib && lib.state;
    if (!s) return null;
    var c = cwCard(lib);
    if (c.upNext) return c;
    if (!(s.timeOffset > 60000) || watchFinished(s.timeOffset, s.duration)) return null;
    return c;
  },
  resumeLabel: function (c) {
    var pp = String(c.videoId || '').split(':'),
      ep = pp.length >= 3 ? [pp[pp.length - 2], pp[pp.length - 1]] : null;
    if (c.upNext) return ep ? tx('playEpisode', ep[0], ep[1]) : tx('watch');
    var left = c.minutesLeft ? '  ·  ' + tx('cwLeft', c.minutesLeft) : '';
    return (ep ? tx('continueEpisode', ep[0], ep[1]) : tx('continueLabel')) + left;
  },
  /* the same source when it was remembered, otherwise the source list for that video */
  playFrom: function (c) {
    var q = resumeSearch(this.id, c.videoId);
    if (q && !c.upNext)
      playStored(
        q,
        'beta#detail/' + this.type + '/' + this.id + (c.videoId !== this.id ? '/' + c.videoId : '')
      );
    else this.openStreams(c.videoId);
  },
  /* With an icon it is a round button that shows its label while it has the focus; without
     one it is the main action, which always shows its label. */
  /* straight to the best source of `vid`, without the list */
  addBestBtn: function (vid, name) {
    var self = this;
    this.addBtn(
      tx('playBest'),
      function () {
        cwMenu.withBestChoice(function (quality, language) {
          streamsUI.show(self.type, self.id, vid, name, quality, language);
        });
      },
      ICON.bolt
    );
  },
  addBtn: function (label, act, icon) {
    var b = document.createElement('div');
    b.className = icon ? 'btn ico' : 'btn main';
    b.innerHTML = (icon || ICON.play) + '<span class="bl">' + esc(label) + '</span>';
    $('dBtns').appendChild(b);
    this.btnEls.push(b);
    this.btnActs.push(act);
    return b;
  },
  inLib: function () {
    var it = lsJson(PRE + this.id);
    return !!(it && it.removed === false);
  },
  toggleLib: function () {
    var m = this.meta || {};
    var now = new Date().toISOString();
    var it = lsJson(PRE + this.id);
    if (it && it.removed === false) {
      it.removed = true;
      it._mtime = now;
      lsSet(PRE + this.id, it);
      toast(tx('removedLibrary'));
    } else {
      if (!it)
        it = {
          state: {
            lastWatched: now,
            timeOffset: 0,
            timeWatched: 0,
            overallTimeWatched: 0,
            timesWatched: 0,
            flaggedWatched: 0,
            duration: 0,
            video_id: this.id,
            watched: '',
            noNotif: false,
            season: 0,
            episode: 0,
            watchedEpisodes: []
          },
          _id: this.id,
          _ctime: now
        };
      it.removed = false;
      it.temp = false;
      it._mtime = now;
      it.name = m.name || it.name || '';
      it.type = this.type;
      it.poster = m.poster || it.poster || '';
      it.posterShape = 'poster';
      it.background = m.background || it.background || '';
      it.logo = m.logo || it.logo || '';
      it.year = m.year || it.year || '';
      lsSet(PRE + this.id, it);
      toast(tx('addedLibrary'));
    }
    pushLib(lsJson(PRE + this.id));
    invalidateBoards();
    var inLib = this.inLib();
    this.libBtn.innerHTML =
      (inLib ? ICON.check : ICON.plus) +
      '<span class="bl">' +
      esc(inLib ? tx('inLibrary') : tx('libraryButton')) +
      '</span>';
  },
  playTrailer: function () {
    var t = trailerIdOf(this.meta);
    if (!t) {
      toast(tx('noTrailer'));
      return;
    }
    ytPlay(t, 'beta#detail/' + this.type + '/' + this.id);
  },
  paint: function () {
    setF(this.btnEls, this.zone === 'btns' ? this.btnIdx : -1);
    var isSeries = this.type === 'series';
    $('dSeasons').style.display = isSeries ? 'block' : 'none';
    $('dEps').style.display = isSeries ? 'block' : 'none';
    for (var i = 0; i < this.seasonEls.length; i++) {
      var base = this.seasonEls[i].className.replace(/ ?\bcur\b/g, '').replace(/ ?\bf\b/g, '');
      this.seasonEls[i].className =
        base + (i === 2 ? ' cur' : '') + (this.zone === 'seasons' && i === this.seasonControlIdx ? ' f' : '');
    }
    setF(this.epEls, this.zone === 'eps' ? this.epIdx : -1);
    for (var ii = 0; ii < this.epEls.length; ii++) {
      var ims = this.epEls[ii].getElementsByTagName('img'),
        /* one more ahead: the next card is already partly on screen */
        near = ii - this.epIdx >= -2 && ii - this.epIdx <= 3;
      for (var iz = 0; iz < ims.length; iz++) {
        var ei = ims[iz];
        if (near && ei._full) {
          ei.src = ei._full;
          ei._full = null;
        } else if (!near && ei.src && ei.src !== BLANK_IMG) {
          ei._full = ei.src;
          ei.src = BLANK_IMG;
        }
      }
    }
    var step = this.epEls.length > 1 ? this.epEls[1].offsetLeft - this.epEls[0].offsetLeft : 454;
    if (step <= 0) step = (document.documentElement.clientHeight || 1080) <= 800 ? 303 : 454;
    var vis = Math.max(2, Math.floor(contentWidth() / step)),
      x = Math.max(0, this.epIdx - (vis - 2)) * step;
    $('dEpsInner').style.transform = 'translateX(-' + x + 'px)';
    $('dEpsInner').style.webkitTransform = 'translateX(-' + x + 'px)';
    var episodeMode = this.zone === 'eps',
      cv = episodeMode ? this.eps[this.epIdx] : null;
    if (episodeMode) {
      bodyAdd('series-episode');
      $('dInfo').style.display = 'none';
      $('dBtns').style.display = 'none';
      $('dDesc').style.display = '';
      $('dMeta').textContent = cv ? episodeMetaLine(cv) : '';
      $('dDesc').textContent = (cv && (cv.overview || cv.description)) || '';
      if (cv) setBg(episodeImage(cv, this.meta) || episodeFallback(this.meta, false));
      else if (this.meta) setBg(this.meta.background || '');
    } else {
      bodyRemove('series-episode');
      $('dBtns').style.display = 'block';
      $('dDesc').style.display = '';
      $('dInfo').style.display = 'block';
      $('dMeta').innerHTML = this.baseMeta;
      $('dInfo').innerHTML = this.baseInfo;
      $('dDesc').textContent = this.baseDesc;
      if (this.meta) setBg(this.meta.background || bgOf({ id: this.id, poster: this.meta.poster }));
    }
  },
  /* Simple (Settings) goes straight to the best source; the list stays one button away */
  openStreams: function (vid) {
    if (!simpleMode()) return this.openSourceList(vid);
    var self = this;
    cwMenu.withBestChoice(function (quality, language) {
      streamsUI.show(self.type, self.id, vid, self.meta && self.meta.name, quality, language);
    });
  },
  openSourceList: function (vid) {
    streamsUI.show(this.type, this.id, vid, this.meta && this.meta.name);
  },
  key: function (k) {
    if (this.zone === 'btns') {
      if (k === 39) this.btnIdx = Math.min(this.btnEls.length - 1, this.btnIdx + 1);
      else if (k === 37) {
        if (this.btnIdx === 0) {
          topNav.focus();
          return true;
        }
        this.btnIdx--;
      } else if (k === 13) {
        var a = this.btnActs[this.btnIdx];
        if (a) a();
      } else if (k === 40) {
        if (this.type === 'series' && this.seasons.length) this.zone = 'seasons';
        else this.openStreams(this.id);
      } /* movie: Down re-opens the streams panel */
      this.paint();
      return true;
    }
    if (this.zone === 'seasons') {
      if (k === 39) this.seasonControlIdx = Math.min(this.seasonEls.length - 1, this.seasonControlIdx + 1);
      else if (k === 37) {
        if (this.seasonControlIdx > 0) this.seasonControlIdx--;
        else {
          topNav.focus();
          return true;
        }
      } else if (k === 38) {
        this.zone = 'btns';
      } else if (k === 40) {
        if (this.eps.length) this.zone = 'eps';
      } else if (k === 13) {
        var act = this.seasonActs[this.seasonControlIdx];
        if (act) act();
      }
      this.paint();
      return true;
    }
    if (this.zone === 'eps') {
      if (k === 39) this.epIdx = Math.min(this.epEls.length - 1, this.epIdx + 1);
      else if (k === 37) {
        if (this.epIdx > 0) this.epIdx--;
        else {
          topNav.focus();
          return true;
        }
      } else if (k === 38) this.zone = 'seasons';
      else if (k === 13) {
        var v = this.eps[this.epIdx];
        if (v) this.openStreams(v.id);
      }
      this.paint();
      return true;
    }
    return true;
  }
};
// Title detail screen: seasons, overall episode ranges, the episode list and watched marks.
detail.currentEpisode = function () {
  return (this.eps && this.eps[this.epIdx]) || null;
};
detail.loadWatched = function () {
  /* episodes watched here (state.watchedEpisodes) and, decoded from state.watched, on
     any other Stremio app */
  this.watchedMap = {};
  if (this.type !== 'series') return;
  var lib = lsJson(PRE + this.id),
    s = (lib && lib.state) || {};
  var we = s.watchedEpisodes || [];
  for (var i = 0; i < we.length; i++) this.watchedMap[we[i]] = 1;
  this.loadWatchedBits(s.watched);
};
var watchedBitsCache = {};
detail.loadWatchedBits = function (field) {
  if (!field || !this.meta || !this.meta.videos) return;
  var self = this,
    id = this.id,
    videos = this.meta.videos;
  function apply(res) {
    if (self.id !== id || !res || !res.bits) return;
    var w = watchedFromBits(res, videos);
    for (var k in w) if (Object.prototype.hasOwnProperty.call(w, k)) self.watchedMap[k] = 1;
    if (self.epEls && self.epEls.length) self.markWatched();
  }
  if (watchedBitsCache[field]) {
    apply(watchedBitsCache[field]);
    return;
  }
  xhrJson('/watchedbits?f=' + encodeURIComponent(field), function (j) {
    if (!j || !j.bits) return;
    if (Object.keys(watchedBitsCache).length > 20) watchedBitsCache = {};
    watchedBitsCache[field] = j;
    apply(j);
  });
};
detail.markWatched = function () {
  for (var i = 0; i < this.eps.length; i++) {
    var v = this.eps[i],
      el = this.epEls[i];
    if (!el) continue;
    var on = !!this.watchedMap[v.id];
    el.className = el.className.replace(/ ?\bw\b/, '') + (on ? ' w' : '');
    var th = el.getElementsByClassName('th')[0];
    if (th) {
      var ex = th.getElementsByClassName('wbadge')[0];
      if (on && !ex) {
        var wb = document.createElement('div');
        wb.className = 'wbadge';
        wb.innerHTML = ICON.check;
        th.appendChild(wb);
      } else if (!on && ex) th.removeChild(ex);
    }
  }
};
/* the first released episode not watched yet; once everything released was watched,
   the latest released one (not S1E1, and never an episode that has not aired) */
detail.firstUnwatched = function () {
  var now = Date.now(),
    latest = null;
  for (var s = 0; s < this.seasons.length; s++) {
    if (this.seasons[s].n === 0) continue;
    var eps = this.seasons[s].eps;
    for (var e = 0; e < eps.length; e++) {
      if (!episodeReleased(eps[e], now)) continue;
      if (!this.watchedMap[eps[e].id]) return eps[e].id;
      latest = eps[e].id;
    }
  }
  if (latest) return latest;
  return this.seasons[0] && this.seasons[0].eps[0] ? this.seasons[0].eps[0].id : null;
};
detail.buildSeasons = function () {
  var model = buildEpisodeModel((this.meta && this.meta.videos) || []);
  this.seasons = model.seasons;
  this.linearEps = model.linear;
  if (this.seasonIdx >= this.seasons.length) this.seasonIdx = Math.max(0, this.seasons.length - 1);
  if (this.rangeIdx * 50 >= this.linearEps.length)
    this.rangeIdx = Math.max(0, Math.ceil(this.linearEps.length / 50) - 1);
  this.epIdx = 0;
  this.buildEps();
};
/* The episode each season (or range) was left on, kept while the app is open, so going back
   to a season returns there instead of to its first episode. */
var episodeSpots = {};
function episodeSpotKey(d) {
  return d.id + ':' + (d.episodeMode === 'season' ? 's' + d.seasonIdx : 'r' + d.rangeIdx);
}
/* moves to another season or range with `change`, keeping the spot of the one left */
detail.switchEpisodeList = function (change) {
  episodeSpots[episodeSpotKey(this)] = this.epIdx;
  change();
  this.buildEps();
  var spot = episodeSpots[episodeSpotKey(this)] || 0;
  this.epIdx = Math.min(spot, Math.max(0, (this.eps || []).length - 1));
};
detail.addSeasonControl = function (label, act, kind) {
  var host = $('dSeasons'),
    ch = document.createElement('div');
  ch.className = 'schip ' + (kind || '');
  ch.textContent = label;
  host.appendChild(ch);
  this.seasonEls.push(ch);
  this.seasonActs.push(act);
};
detail.buildSeasonControls = function () {
  var self = this,
    host = $('dSeasons');
  host.innerHTML = '';
  this.seasonEls = [];
  this.seasonActs = [];
  this.addSeasonControl(
    this.episodeMode === 'season' ? tx('seasonOrder') : tx('continuousOrder'),
    function () {
      var keep = self.currentEpisode();
      self.episodeMode = self.episodeMode === 'season' ? 'continuous' : 'season';
      self.epIdx = 0;
      self.buildEps();
      if (keep) self.selectEpisode(keep.id, true);
    },
    'mode'
  );
  this.addSeasonControl(
    '‹',
    function () {
      self.switchEpisodeList(function () {
        if (self.episodeMode === 'season') {
          if (self.seasonIdx > 0) self.seasonIdx--;
        } else if (self.rangeIdx > 0) self.rangeIdx--;
      });
    },
    'arrow'
  );
  var label;
  if (this.episodeMode === 'season') {
    var se = this.seasons[this.seasonIdx];
    label = se ? (se.n === 0 ? tx('specials') : tx('season', se.n)) : tx('season', 1);
  } else {
    /* label the range with the overall numbers its cards show: provider absolute
       numbers can skip, so positions and numbers are not always the same */
    var slice = this.linearEps.slice(this.rangeIdx * 50, this.rangeIdx * 50 + 50);
    label = slice.length
      ? tx('episodeRange', slice[0]._stremAbsolute, slice[slice.length - 1]._stremAbsolute)
      : tx('episodeRange', 0, 0);
  }
  this.addSeasonControl(label, function () {}, 'selector');
  this.addSeasonControl(
    '›',
    function () {
      self.switchEpisodeList(function () {
        if (self.episodeMode === 'season') {
          if (self.seasonIdx < self.seasons.length - 1) self.seasonIdx++;
        } else if ((self.rangeIdx + 1) * 50 < self.linearEps.length) self.rangeIdx++;
      });
    },
    'arrow'
  );
  this.addSeasonControl(
    tx('goToEpisode'),
    function () {
      self.jumpEpisode();
    },
    'jump'
  );
  if (this.seasonControlIdx >= this.seasonEls.length) this.seasonControlIdx = 0;
};
/* the focused episode: numbering, air date, length and whether it has aired yet */
function episodeMetaLine(cv) {
  var bits = [
      cv._stremAbsolute
        ? tx('seasonAbsoluteEpisode', cv._stremSeason, cv._stremSeasonEpisode, cv._stremAbsolute)
        : tx('seasonEpisode', cv._stremSeason, cv._stremSeasonEpisode)
    ],
    at = releasedTime(cv);
  if (at) {
    var day = '';
    try {
      day = new Date(at).toLocaleDateString(UI_LANG, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) {
      day = new Date(at).toISOString().slice(0, 10);
    }
    bits.push(day);
  }
  if (cv.runtime) bits.push(cv.runtime);
  if (at > Date.now()) bits.push(tx('badgeSoon'));
  return bits.join('  ·  ');
}
/* Coming soon before release, New during the first week */
function episodeBadge(v, now) {
  var at = releasedTime(v);
  if (!at) return '';
  if (at > now) return tx('badgeSoon');
  return now - at < 7 * 86400000 ? tx('badgeNew') : '';
}
detail.buildEps = function () {
  var se = this.seasons[this.seasonIdx],
    start = this.rangeIdx * 50;
  var host = $('dEpsInner');
  host.innerHTML = '';
  this.epEls = [];
  this.eps = this.episodeMode === 'continuous' ? this.linearEps.slice(start, start + 50) : se ? se.eps : [];
  this.buildSeasonControls();
  /* progress of the episode being watched, and release badges */
  var lib = lsJson(PRE + this.id),
    st = (lib && lib.state) || {},
    now = Date.now();
  for (var i = 0; i < this.eps.length; i++) {
    var v = this.eps[i];
    var d = document.createElement('div');
    d.className = 'ep';
    var th = document.createElement('div');
    th.className = 'th';
    var actualThumb = episodeImage(v, this.meta),
      thumb = actualThumb || episodeFallback(this.meta, true);
    if (thumb) {
      var im = new Image();
      im._full = thumb;
      im._fallback = episodeFallback(this.meta, true);
      im.onerror = function () {
        if (this._fallback && this.src !== this._fallback) {
          this._full = null;
          this.src = this._fallback;
        }
        this.onerror = null;
      };
      im.src = BLANK_IMG;
      th.appendChild(im);
      if (!actualThumb) th.className += ' fallback';
    }
    var badge = episodeBadge(v, now);
    if (badge) {
      var bg = document.createElement('div');
      bg.className = 'epbadge';
      bg.textContent = badge;
      th.appendChild(bg);
    }
    if (
      v.id === st.video_id &&
      st.duration > 0 &&
      st.timeOffset > 60000 &&
      !watchFinished(st.timeOffset, st.duration)
    ) {
      var pb = document.createElement('div');
      pb.className = 'pbar';
      var pf = document.createElement('div');
      pf.style.width = Math.min(100, Math.round((st.timeOffset / st.duration) * 100)) + '%';
      pb.appendChild(pf);
      th.appendChild(pb);
    }
    d.appendChild(th);
    var bd = document.createElement('div');
    bd.className = 'bd';
    var t = document.createElement('div');
    t.className = 't';
    var epBase =
        this.episodeMode === 'continuous'
          ? tx('absoluteEpisode', v._stremAbsolute || start + i + 1)
          : tx('episode', v._stremSeasonEpisode || i + 1),
      epName = v.name || v.title || '';
    t.textContent =
      !epName || epName.toLowerCase() === epBase.toLowerCase() ? epBase : epBase + '  ·  ' + epName;
    bd.appendChild(t);
    d.appendChild(bd);
    host.appendChild(d);
    this.epEls.push(d);
  }
  this.epIdx = 0;
  this.markWatched();
};
detail.jumpEpisode = function () {
  episodeJump.show((this.currentEpisode() && this.currentEpisode()._stremAbsolute) || 1);
};
detail.goToEpisodeNumber = function (n) {
  var at = episodeIndexByNumber(this.linearEps, n);
  if (at < 0) {
    toast(tx('episodeNotFound'));
    return false;
  }
  this.episodeMode = 'continuous';
  this.rangeIdx = Math.floor(at / 50);
  this.epIdx = at % 50;
  this.buildEps();
  this.epIdx = at % 50;
  this.zone = 'eps';
  this.paint();
  return true;
};
detail.selectEpisode = function (vid, noOpen) {
  if (this.episodeMode === 'continuous') {
    for (var a = 0; a < this.linearEps.length; a++)
      if (this.linearEps[a].id === vid) {
        this.rangeIdx = Math.floor(a / 50);
        this.buildEps();
        this.epIdx = a % 50;
        this.zone = 'eps';
        this.paint();
        if (!noOpen) this.openStreams(vid);
        return;
      }
  }
  for (var s = 0; s < this.seasons.length; s++) {
    var eps = this.seasons[s].eps;
    for (var e = 0; e < eps.length; e++) {
      if (eps[e].id === vid) {
        this.seasonIdx = s;
        this.buildEps();
        this.epIdx = e;
        this.zone = 'eps';
        this.paint();
        if (!noOpen) this.openStreams(vid);
        return;
      }
    }
  }
};
// In-app numeric keypad for jumping to an episode.
/* Chromium 38/53 can silently ignore the native browser prompt inside packaged TV apps.
   Keep episode entry inside the application so arrows, OK, number keys and the
   Magic Remote all use the same predictable path. */
var episodeJump = {
  open: false,
  value: '',
  idx: 0,
  replaceOnDigit: true,
  els: [],
  keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'delete', '0', 'go'],
  show: function (initial) {
    this.open = true;
    this.value = String(Math.max(1, parseInt(initial, 10) || 1));
    this.replaceOnDigit = true;
    this.idx = 0;
    this.build();
    $('episodeJump').style.display = 'block';
    this.paint();
  },
  build: function () {
    var host = $('ejKeys');
    host.innerHTML = '';
    this.els = [];
    $('ejTitle').textContent = tx('episodeNumberPrompt');
    $('ejHint').textContent = tx('jumpHint');
    for (var i = 0; i < this.keys.length; i++) {
      var b = document.createElement('div');
      b.className = 'ejkey';
      b.textContent =
        this.keys[i] === 'delete' ? tx('jumpDelete') : this.keys[i] === 'go' ? tx('jumpGo') : this.keys[i];
      host.appendChild(b);
      this.els.push(b);
    }
  },
  paint: function () {
    $('ejValue').textContent = this.value || '0';
    setF(this.els, this.idx);
  },
  close: function () {
    this.open = false;
    $('episodeJump').style.display = 'none';
  },
  press: function (i) {
    var k = this.keys[i];
    if (k === 'delete') {
      this.replaceOnDigit = false;
      this.value = this.value.slice(0, -1);
    } else if (k === 'go') {
      var n = parseInt(this.value, 10);
      if (n > 0 && detail.goToEpisodeNumber(n)) this.close();
      else if (!(n > 0)) toast(tx('episodeNotFound'));
    } else if (this.value.length < 5 || this.replaceOnDigit) {
      this.value = this.replaceOnDigit ? k : (this.value === '0' ? '' : this.value) + k;
      this.replaceOnDigit = false;
    }
    this.paint();
  },
  key: function (k) {
    var row = Math.floor(this.idx / 3),
      col = this.idx % 3;
    if (k >= 48 && k <= 57) {
      this.press(k === 48 ? 10 : k - 49);
      return;
    }
    if (k >= 96 && k <= 105) {
      this.press(k === 96 ? 10 : k - 97);
      return;
    }
    if (k === 37) col = Math.max(0, col - 1);
    else if (k === 39) col = Math.min(2, col + 1);
    else if (k === 38) row = Math.max(0, row - 1);
    else if (k === 40) row = Math.min(3, row + 1);
    else if (k === 13) {
      this.press(this.idx);
      return;
    }
    this.idx = row * 3 + col;
    this.paint();
  }
};
window.__SC_EPISODE_JUMP__ = episodeJump;
// The first start of 4.0: how the app is used (simple or complete) and how it looks (standard or
// light). Both stay in Settings; skipping keeps everything as it was.
/* the look this TV had before anyone chose: light on the TVs the profile already treats as small.
   The modern look of the 4.0 tests is gone: a TV that chose it has the standard one. */
var PROFILE_LOW_MEMORY = !!TV_PROFILE.lowMemory;
function uiLook() {
  return lsRaw('uiLook', '') === 'light' || (!lsRaw('uiLook', '') && PROFILE_LOW_MEMORY)
    ? 'light'
    : 'standard';
}
function simpleMode() {
  return lsRaw('uiMode', 'full') === 'simple';
}
/* Light: no animations or effects, smaller backgrounds and the small-TV caches. */
function applyLook() {
  var light = uiLook() === 'light';
  TV_PROFILE.lowMemory = light || PROFILE_LOW_MEMORY;
  if (light) bodyAdd('lowmem');
  else if (!PROFILE_LOW_MEMORY) bodyRemove('lowmem');
  if (light) bodyAdd('lite');
  else bodyRemove('lite');
}
/* Draws the panel shared by the first-start questions and the interface languages: a title, rows of { name, help, cls } and a hint. Returns the rows' elements. */
function drawChoices(title, rows, hint) {
  var host = $('suOptions'),
    els = [];
  $('setupPanel').style.display = 'block';
  $('suTitle').textContent = title;
  $('suHint').textContent = hint || '';
  host.innerHTML = '';
  for (var i = 0; i < rows.length; i++) {
    var b = document.createElement('div'),
      name = document.createElement('div');
    b.className = 'suopt' + (rows[i].cls ? ' ' + rows[i].cls : '');
    name.className = 'suname';
    name.textContent = rows[i].name;
    b.appendChild(name);
    if (rows[i].help) {
      var help = document.createElement('div');
      help.className = 'suhelp';
      help.textContent = rows[i].help;
      b.appendChild(help);
    }
    host.appendChild(b);
    els.push(b);
  }
  return els;
}
var languagePanel = {
  open: false,
  idx: 0,
  els: [],
  codes: [],
  done: null,
  show: function (done) {
    var rows = [];
    this.codes = Object.keys(UI_LANGUAGES);
    this.done = done;
    this.idx = Math.max(0, this.codes.indexOf(UI_LANG));
    for (var i = 0; i < this.codes.length; i++) rows.push({ name: UI_LANGUAGES[this.codes[i]] });
    this.els = drawChoices(tx('interfaceLanguage'), rows);
    this.open = true;
    setF(this.els, this.idx);
  },
  choose: function (i) {
    setUILanguage(this.codes[i]);
    this.close();
    if (this.done) this.done();
  },
  close: function () {
    this.open = false;
    $('setupPanel').style.display = 'none';
  },
  key: function (k) {
    if (k === 38) this.idx = Math.max(0, this.idx - 1);
    else if (k === 40) this.idx = Math.min(this.els.length - 1, this.idx + 1);
    else if (k === 13) return this.choose(this.idx);
    setF(this.els, this.idx);
  }
};
var setupPanel = {
  open: false,
  step: 0,
  idx: 0,
  els: [],
  /* once, after the first start of this version with an account; Back or Skip keep the defaults */
  maybeShow: function () {
    if (lsRaw('setupDone', '') || !user() || profilePanel.open) return;
    this.open = true;
    this.step = 0;
    this.build();
  },
  questions: function () {
    return [
      {
        key: 'uiMode',
        title: tx('setupUseQuestion'),
        options: [
          ['simple', tx('modeSimple'), tx('modeSimpleHint')],
          ['full', tx('modeFull'), tx('modeFullHint')]
        ],
        current: simpleMode() ? 'simple' : 'full'
      },
      {
        key: 'uiLook',
        title: tx('setupLookQuestion'),
        options: [
          ['standard', tx('lookStandard'), tx('lookStandardHint')],
          ['light', tx('lookLight'), tx('lookLightHint')]
        ],
        current: uiLook()
      }
    ];
  },
  build: function () {
    var q = this.questions()[this.step],
      rows = [];
    this.idx = 0;
    for (var i = 0; i < q.options.length; i++) {
      rows.push({ name: q.options[i][1], help: q.options[i][2] });
      if (q.options[i][0] === q.current) this.idx = i;
    }
    rows.push({ name: tx('setupSkip'), cls: 'suskip' });
    this.els = drawChoices(q.title, rows, tx('setupHint'));
    setF(this.els, this.idx);
  },
  /* an option of this question, or Skip, which closes with what is set now */
  choose: function (i) {
    var q = this.questions()[this.step];
    if (i >= q.options.length) return this.close();
    lsRawSet(q.key, q.options[i][0]);
    if (q.key === 'uiLook') applyLook();
    this.step++;
    if (this.step >= this.questions().length) return this.close();
    this.build();
  },
  close: function () {
    this.open = false;
    lsRawSet('setupDone', '1');
    $('setupPanel').style.display = 'none';
  },
  key: function (k) {
    if (k === 38) this.idx = Math.max(0, this.idx - 1);
    else if (k === 40) this.idx = Math.min(this.els.length - 1, this.idx + 1);
    else if (k === 13) return this.choose(this.idx);
    setF(this.els, this.idx);
  }
};
// "Who is watching?": the profiles of a Nuvio account on a screen of their own, at every start
// (the profile chosen last has the focus), after signing in and from the profile at the top of
// the side menu. A profile can be added there, and its name, colour and avatar changed.

/* A round face: the avatar when it loads, until then (or without one) the initial on the
   profile's colour. Nuvio gives both; a Stremio account has its email's initial. */
function drawFace(el, face) {
  el.innerHTML = '';
  el.style.backgroundColor = face.color || '#0F766E';
  el.textContent = (face.name || '?').charAt(0).toUpperCase();
  if (!face.avatar) return;
  var img = new Image();
  img.onload = function () {
    el.textContent = '';
    el.appendChild(img);
  };
  img.src = face.avatar;
}
/* the profile in use: Nuvio's as chosen (kept by profilePanel.use), or the Stremio account */
function currentFace() {
  var u = user() || {};
  if (isNuvioAccount()) return lsJson('profileFace') || { name: u.email || '', color: '#1E88E5', avatar: '' };
  return { name: u.email || tx('connectedAccount'), color: '#0F766E', avatar: '' };
}
function paintProfileChip() {
  var face = currentFace();
  drawFace($('navFace'), face);
  $('navName').textContent = face.name;
}
/* The profile is asked once each time the app is opened. The interface page also loads again
   when the player hands back to it, or after choosing another profile; sessionStorage lasts
   while the app stays open, so those loads do not ask again. */
function rememberProfileAsked() {
  try {
    sessionStorage.setItem('profileAsked', '1');
  } catch (e) {}
}
function profileAsked() {
  try {
    return sessionStorage.getItem('profileAsked') === '1';
  } catch (e) {
    return false;
  }
}
/* after choosing, the app starts again with that profile; the screen stays up until then */
function reloadWithProfile() {
  rememberProfileAsked();
  location.reload();
}
/* When the app is opened a Nuvio account asks who is watching, with the last profile chosen in
   focus, before Home is built; one profile alone is used without asking. then() builds Home. */
function startProfiles(then) {
  paintProfileChip();
  if (profileAsked()) return then();
  profilePanel.show(authKey(), function (changed) {
    if (changed) return reloadWithProfile();
    rememberProfileAsked();
    /* the opening screen comes back while Home is built, as on any start */
    $('boot').style.display = '';
    profilePanel.close();
    paintProfileChip();
    then();
  });
}
/* OK on the profile item: Nuvio switches profiles; a Stremio account has one, so it opens its
   Account settings */
function openProfile() {
  if (!isNuvioAccount()) {
    topNav.switchTo(chipTarget.indexOf('set'));
    return settings.openCategory('account');
  }
  profilePanel.show(
    authKey(),
    function (changed) {
      if (changed) return reloadWithProfile();
      profilePanel.close();
      topNav.focus();
    },
    function () {
      topNav.focus();
    }
  );
}
/* the colours offered for a profile, Nuvio's blue first */
var PROFILE_COLORS = ['#1E88E5', '#E53935', '#43A047', '#FB8C00', '#8E24AA', '#00ACC1', '#F4511E', '#6D4C41'];
var MAX_PROFILES = 6;

var profilePanel = {
  open: false,
  mode: 'pick',
  zone: 'row',
  idx: 0,
  els: [],
  list: [],
  account: '',
  done: null,
  cancel: null,
  /* the profile being changed or made: { index, name, color, avatar } */
  draft: null,
  avatars: [],
  colorIdx: 0,
  avatarIdx: 0,
  btnIdx: 0,
  /* done(changed) runs once a profile is in use, changed when it is another one than before; the
     screen stays up for it to close or start the app again. cancel(), when given, lets Back close
     without choosing */
  show: function (key, done, cancel) {
    var self = this;
    this.account = key;
    this.done = done;
    this.cancel = cancel || null;
    xhrJson(
      '/nuvioprofiles?key=' + encodeURIComponent(key),
      function (j) {
        var list = (j && j.profiles) || [];
        if (!list.length) {
          toast(tx('profilesUnavailable'));
          if (!cancel) done(false);
          return;
        }
        if (list.length === 1 && !list[0].locked && !cancel) return self.use(list[0]);
        self.list = list;
        self.buildPick();
      },
      20000
    );
  },
  /* ---------- choosing ---------- */
  buildPick: function () {
    var row = $('pfRow');
    row.innerHTML = '';
    this.mode = 'pick';
    this.zone = 'row';
    this.els = [];
    this.idx = 0;
    $('pfScreen').style.display = 'block';
    $('boot').style.display = 'none';
    $('pfPick').style.display = '';
    $('pfEditor').style.display = 'none';
    $('pfTitle').textContent = tx('whoIsWatching');
    $('pfEditBtn').textContent = tx('editProfile');
    $('pfHint').textContent = tx('profilesHint');
    for (var i = 0; i < this.list.length; i++) {
      var p = this.list[i];
      this.addCard(p.name || tx('profileNumber', p.index), p, p.locked ? tx('profileLocked') : '');
      if (p.current) this.idx = i;
    }
    if (this.list.length < MAX_PROFILES) this.addCard(tx('addProfile'), null, '');
    this.open = true;
    this.paint();
  },
  /* one card: the face and the name; null for "Add profile" */
  addCard: function (label, p, note) {
    var card = document.createElement('div'),
      face = document.createElement('div'),
      name = document.createElement('div');
    card.className = 'pf' + (p && p.locked ? ' locked' : '') + (p ? '' : ' add');
    face.className = 'pfav';
    if (p) drawFace(face, p);
    else face.textContent = '+';
    name.className = 'pfname';
    name.textContent = label;
    card.appendChild(face);
    card.appendChild(name);
    if (note) {
      var lock = document.createElement('div');
      lock.className = 'pflock';
      lock.textContent = note;
      card.appendChild(lock);
    }
    $('pfRow').appendChild(card);
    this.els.push(card);
  },
  choose: function (i) {
    var p = this.list[i];
    if (!p) return this.edit(null);
    if (p.locked) return toast(tx('profileLocked'));
    this.use(p);
  },
  /* the server switches the session to it; the account's user id names the profile's library */
  use: function (p) {
    var self = this;
    lsSet('profileFace', { name: p.name, color: p.color, avatar: p.avatar });
    this.open = false;
    if (p.current) return this.done(false);
    xhrJson(
      '/nuvioprofile?key=' + encodeURIComponent(this.account) + '&index=' + p.index,
      function (j) {
        if (!j || !j.ok) {
          self.open = true;
          return toast(tx('profilesUnavailable'));
        }
        postJson(API + '/api/getUser', { authKey: self.account }, function (u) {
          if (u && u.result) lsSet('user', u.result);
          lsRawSet('addons', '');
          self.done(true);
        });
      },
      20000
    );
  },
  /* ---------- adding or changing a profile ---------- */
  edit: function (p) {
    var self = this;
    this.mode = 'edit';
    this.zone = 'name';
    this.btnIdx = 0;
    this.draft = p
      ? { index: p.index, name: p.name, color: p.color, avatar: p.avatar || '' }
      : { index: 0, name: '', color: PROFILE_COLORS[this.list.length % PROFILE_COLORS.length], avatar: '' };
    $('pfPick').style.display = 'none';
    $('pfEditor').style.display = '';
    $('pfTitle').textContent = tx(p ? 'editProfile' : 'addProfile');
    $('pfHint').textContent = tx('profileEditHint');
    $('pfEdName').value = this.draft.name;
    $('pfEdName').placeholder = tx('profileName');
    $('pfSave').textContent = tx('save');
    $('pfCancel').textContent = tx('cancel');
    var colors = $('pfEdColors');
    colors.innerHTML = '';
    this.colorEls = [];
    this.colorIdx = Math.max(0, PROFILE_COLORS.indexOf(String(this.draft.color).toUpperCase()));
    for (var c = 0; c < PROFILE_COLORS.length; c++) {
      var dot = document.createElement('div');
      dot.className = 'pfcolor';
      dot.style.backgroundColor = PROFILE_COLORS[c];
      colors.appendChild(dot);
      this.colorEls.push(dot);
    }
    this.drawAvatars([]);
    xhrJson(
      '/nuvioavatars?key=' + encodeURIComponent(this.account),
      function (j) {
        if (self.mode === 'edit') self.drawAvatars((j && j.avatars) || []);
      },
      20000
    );
    this.paint();
  },
  /* the avatars to pick from, the initial alone first */
  drawAvatars: function (list) {
    var host = $('pfEdAvatars');
    host.innerHTML = '';
    this.avatars = [{ id: '', url: '' }].concat(list);
    this.avatarEls = [];
    this.avatarIdx = 0;
    for (var i = 0; i < this.avatars.length; i++) {
      var a = document.createElement('div');
      a.className = 'pfpick';
      if (this.avatars[i].url) {
        var img = new Image();
        img.src = this.avatars[i].url;
        a.appendChild(img);
      } else a.textContent = (this.draft.name || '?').charAt(0).toUpperCase();
      host.appendChild(a);
      this.avatarEls.push(a);
      if (this.avatars[i].url && this.avatars[i].url === this.draft.avatar) this.avatarIdx = i;
    }
    this.paint();
  },
  save: function () {
    var self = this,
      d = this.draft,
      name = String($('pfEdName').value || '').trim(),
      avatar = this.avatars[this.avatarIdx] || { id: '' };
    if (!name) {
      this.zone = 'name';
      this.paint();
      return toast(tx('profileNameNeeded'));
    }
    toast(tx('saving'));
    xhrJson(
      '/nuvioprofilesave?key=' +
        encodeURIComponent(this.account) +
        '&index=' +
        (d.index || '') +
        '&name=' +
        encodeURIComponent(name) +
        '&color=' +
        encodeURIComponent(PROFILE_COLORS[this.colorIdx]) +
        '&avatar=' +
        encodeURIComponent(avatar.id),
      function (j) {
        if (!j || !j.ok) return toast(tx('profileNotSaved'));
        /* the profile in use keeps its face in the side menu up to date */
        for (var i = 0; i < self.list.length; i++)
          if (self.list[i].current && self.list[i].index === j.index)
            lsSet('profileFace', { name: name, color: PROFILE_COLORS[self.colorIdx], avatar: avatar.url });
        self.show(self.account, self.done, self.cancel);
      },
      20000
    );
  },
  /* the face of the draft follows the name, colour and avatar chosen */
  paintDraft: function () {
    var avatar = this.avatars[this.avatarIdx] || {};
    drawFace($('pfEdFace'), {
      name: $('pfEdName').value || '?',
      color: PROFILE_COLORS[this.colorIdx],
      avatar: avatar.url || ''
    });
  },
  /* ---------- drawing the focus ---------- */
  paint: function () {
    if (this.mode === 'pick') {
      setF(this.els, this.zone === 'row' ? this.idx : -1);
      var canEdit = !!this.list[this.idx];
      $('pfEditBtn').style.visibility = canEdit ? '' : 'hidden';
      $('pfEditBtn').className = this.zone === 'edit' ? 'f' : '';
      return;
    }
    $('pfEdName').className = this.zone === 'name' ? 'f' : '';
    for (var c = 0; c < this.colorEls.length; c++)
      this.colorEls[c].className =
        'pfcolor' +
        (c === this.colorIdx ? ' on' : '') +
        (this.zone === 'colors' && c === this.colorIdx ? ' f' : '');
    for (var a = 0; a < this.avatarEls.length; a++)
      this.avatarEls[a].className =
        'pfpick' +
        (a === this.avatarIdx ? ' on' : '') +
        (this.zone === 'avatars' && a === this.avatarIdx ? ' f' : '');
    /* the avatar strip slides so the chosen one stays in view */
    var step = this.avatarEls[1] ? this.avatarEls[1].offsetLeft - this.avatarEls[0].offsetLeft : 0,
      off = Math.max(0, this.avatarIdx - 4) * step;
    $('pfEdAvatars').style.webkitTransform = 'translateX(-' + off + 'px)';
    $('pfEdAvatars').style.transform = 'translateX(-' + off + 'px)';
    setF([$('pfSave'), $('pfCancel')], this.zone === 'btns' ? this.btnIdx : -1);
    this.paintDraft();
  },
  close: function () {
    this.open = false;
    $('pfEdName').blur();
    $('pfScreen').style.display = 'none';
  },
  back: function () {
    if (this.mode === 'edit') return this.buildPick();
    if (!this.cancel) return;
    this.close();
    this.cancel();
  },
  /* the name box is typed in with the TV's keyboard; OK or Back leaves it */
  typing: function () {
    return document.activeElement === $('pfEdName');
  },
  key: function (k) {
    if (this.mode === 'pick') return this.keyPick(k);
    var zones = ['name', 'colors', 'avatars', 'btns'],
      z = zones.indexOf(this.zone);
    if (k === 40 && z < zones.length - 1) this.zone = zones[z + 1];
    else if (k === 38 && z > 0) this.zone = zones[z - 1];
    else if (k === 37 || k === 39) {
      var d = k === 39 ? 1 : -1;
      if (this.zone === 'colors')
        this.colorIdx = Math.max(0, Math.min(this.colorEls.length - 1, this.colorIdx + d));
      else if (this.zone === 'avatars')
        this.avatarIdx = Math.max(0, Math.min(this.avatarEls.length - 1, this.avatarIdx + d));
      else if (this.zone === 'btns') this.btnIdx = d > 0 ? 1 : 0;
    } else if (k === 13) {
      if (this.zone === 'name') return $('pfEdName').focus();
      if (this.zone === 'btns') return this.btnIdx ? this.buildPick() : this.save();
      this.zone = zones[z + 1];
    }
    this.paint();
  },
  keyPick: function (k) {
    if (this.zone === 'row') {
      if (k === 37) this.idx = Math.max(0, this.idx - 1);
      else if (k === 39) this.idx = Math.min(this.els.length - 1, this.idx + 1);
      else if (k === 40 && this.list[this.idx]) this.zone = 'edit';
      else if (k === 13) return this.choose(this.idx);
    } else if (k === 38) this.zone = 'row';
    else if (k === 13) return this.edit(this.list[this.idx]);
    this.paint();
  }
};
on($('pfEdName'), 'keydown', function (e) {
  if (e.keyCode !== 13 && !isRemoteBack(e.keyCode)) return;
  e.preventDefault();
  e.stopPropagation();
  $('pfEdName').blur();
  profilePanel.zone = 'colors';
  profilePanel.paint();
});
on($('pfEdName'), 'input', function () {
  profilePanel.paintDraft();
});
// Source picker overlay.
/* ================= STREAMS OVERLAY ================= */
var streamsUI = {
  open: false,
  items: [],
  idx: 0,
  els: [],
  groups: [],
  pool: [],
  trimmed: {},
  type: '',
  id: '',
  vid: '',
  seq: 0,
  requestSeq: 0,
  autoPref: null,
  zone: 'list',
  filter: 'All',
  langFilter: 'All',
  langs: [],
  chipIdx: 0,
  chips: [],
  chipEls: [],
  failed: [],
  title: '',
  flushT: null,
  show: function (type, id, vid, title, bestQuality, bestLanguage) {
    var request = ++this.requestSeq;
    this.open = true;
    this.failed = [];
    this.title = title || '';
    this.cancelFlush();
    this.items = [];
    this.idx = 0;
    this.moved = false;
    this.els = [];
    this.groups = [];
    this.pool = [];
    this.trimmed = {};
    this.type = type;
    this.id = id;
    this.vid = vid;
    this.seq = 0;
    this.autoPref = takeNextSourcePreference(id, vid);
    this.retryPref = takeRetryRequest(id, vid);
    this.zone = 'list';
    this.filter = 'All';
    this.langFilter = 'All';
    this.langs = [];
    this.chipIdx = 0;
    this.chips = [];
    this.chipEls = [];
    /* Best source from the title page goes straight to the film; the list only appears if
       nothing can be chosen */
    this.searching = !!bestQuality;
    if (bestQuality) toast(tx('findingSources'));
    else this.reveal();
    $('stChips').innerHTML = '';
    $('stLang').style.display = 'none';
    $('stBest').style.display = 'none';
    $('stBest').innerHTML = ICON.bolt + esc(tx('playBest'));
    $('stSub').textContent =
      (title || '') +
      (vid && vid.indexOf(':') > 0 ? '  ·  T' + vid.split(':')[1] + ' E' + vid.split(':')[2] : '');
    $('stInner').innerHTML = '<div class="stmsg">' + tx('findingSources') + '</div>';
    var q = resumeSearch(id, vid);
    var self = this;
    if (q) {
      this.push(
        [
          {
            addon: tx('lastSource'),
            name: tx('continuePlayback'),
            title: tx('sameSource'),
            stored: q,
            quality: 'Recent',
            seeders: 999999,
            compatLabels: [],
            compatRank: 0
          }
        ],
        0,
        tx('lastSource')
      );
    }
    fetchStreams(
      type,
      vid,
      function (part, gi, gn) {
        if (self.open && self.requestSeq === request) self.push(part, gi + 1, gn);
      },
      function (total, failed) {
        if (!self.open || self.requestSeq !== request) return;
        self.failed = failed || [];
        if (!self.pool.length) {
          self.reveal();
          $('stInner').innerHTML =
            '<div class="stmsg">' +
            (self.failed.length
              ? esc(tx('addonsNoAnswer', self.failed.join(', '))) + '<br>' + tx('pressOkRetry')
              : tx('noSources')) +
            '</div>';
          return;
        }
        self.flush();
        if (bestQuality) {
          if (!self.startBest(bestQuality, bestLanguage)) self.reveal();
          return;
        }
        if (self.retryPref) {
          var retry = nextSourceAfterFailure(self.items, self.retryPref);
          self.retryPref = null;
          if (retry) {
            toast(tx('tryingNextSource'));
            playUrl(retry, self.type, self.id, self.vid, self.backHash());
          } else toast(tx('noOtherSource'));
          return;
        }
        var matched = matchingNextSource(self.all(), self.autoPref);
        self.autoPref = null;
        if (matched) {
          var backHash = 'beta#detail/' + self.type + '/' + self.id + '/' + self.vid;
          playUrl(matched, self.type, self.id, self.vid, backHash);
        }
      }
    );
  },
  reveal: function () {
    this.searching = false;
    $('streams').style.display = 'block';
    bodyAdd('streamsopen');
  },
  backHash: function () {
    return 'beta#detail/' + this.type + '/' + this.id + (this.vid !== this.id ? '/' + this.vid : '');
  },
  chooseBest: function () {
    var self = this;
    cwMenu.withBestChoice(function (quality, language) {
      self.startBest(quality, language);
    });
  },
  /* the source list stays open underneath when nothing can be picked */
  startBest: function (quality, language) {
    var best = bestSource(this.items, quality, language);
    if (!best) return false;
    toast(tx('playingBest', best.quality || best.addon || ''));
    playUrl(best, this.type, this.id, this.vid, this.backHash());
    return true;
  },
  push: function (arr, gIdx, gName) {
    if (!this.open) return;
    for (var i = 0; i < arr.length; i++) {
      arr[i]._seq = this.seq++;
      this.pool.push(arr[i]);
    }
    this.compact();
    /* Every answering addon used to rebuild the whole list while the viewer was moving
       through it. The first answer is drawn at once; later ones are drawn together. */
    if (!this.items.length) {
      this.flush();
      return;
    }
    var self = this;
    if (!this.flushT)
      this.flushT = setTimeout(function () {
        self.flushT = null;
        if (self.open) self.flush();
      }, 300);
  },
  cancelFlush: function () {
    if (this.flushT) clearTimeout(this.flushT);
    this.flushT = null;
  },
  flush: function () {
    this.cancelFlush();
    this.renderChips();
    this.rebuild();
  },
  sourceKey: function (s) {
    return streamSourceKey(s);
  },
  compact: function () {
    var cap = TV_PROFILE.sourceCap || 60;
    var result = compactSourcePool(this.pool, cap);
    this.pool = result.items;
    this.trimmed = result.trimmed;
  },
  all: function () {
    return this.pool.slice(0);
  },
  renderChips: function () {
    var host = $('stChips'),
      allItems = this.all(),
      counts = {},
      order = ['All', '4K', '1440p', '1080p', '720p', 'SD', 'Other'];
    host.innerHTML = '';
    this.chips = [];
    this.chipEls = [];
    for (var n = 0; n < allItems.length; n++) {
      var q = allItems[n].quality || 'Other';
      counts[q] = (counts[q] || 0) + 1;
    }
    for (var i = 0; i < order.length; i++) {
      var key = order[i];
      if (key !== 'All' && !counts[key]) continue;
      var c = document.createElement('div');
      c.className = 'stchip';
      c.textContent =
        qualityLabel(key) + (key === 'All' ? '' : ' ' + counts[key] + (this.trimmed[key] ? '+' : ''));
      host.appendChild(c);
      this.chips.push(key);
      this.chipEls.push(c);
    }
    var k = this.chips.indexOf(this.filter);
    if (k < 0) {
      this.filter = 'All';
      k = 0;
    }
    this.chipIdx = k;
    $('stBest').style.display = 'inline-block';
    this.renderLangs(allItems);
    this.paintChips();
  },
  /* The language selector stays small in the corner: it appears only when the sources
     come in two or more languages, and OK steps through them. */
  renderLangs: function (allItems) {
    var counts = {},
      order = [],
      n,
      g;
    for (n = 0; n < allItems.length; n++) {
      if (allItems[n].stored) continue;
      g = langGroups(allItems[n]);
      for (var j = 0; j < g.length; j++) {
        if (!counts[g[j]]) order.push(g[j]);
        counts[g[j]] = (counts[g[j]] || 0) + 1;
      }
    }
    /* a fixed order so the selector always steps the same way: English, Portuguese,
       Spanish, the other languages, multi audio, then sources with no language */
    var rank = ['en', 'pt', 'es', 'fr', 'it', 'de', 'ja', 'ko', 'ru', 'hi', 'multi', 'none'];
    order.sort(function (a, b) {
      return rank.indexOf(a) - rank.indexOf(b);
    });
    this.langs = order.length > 1 ? ['All'].concat(order) : [];
    if (this.langs.indexOf(this.langFilter) < 0) this.langFilter = 'All';
    if (!this.langs.length && this.zone === 'lang') this.zone = 'chips';
    $('stLang').style.display = this.langs.length ? 'block' : 'none';
  },
  langName: function (g) {
    return g === 'All'
      ? tx('langAll')
      : g === 'none'
        ? tx('langOther')
        : g === 'multi'
          ? 'Multi'
          : g.toUpperCase();
  },
  nextLang: function (step) {
    var n = this.langs.length;
    if (!n) return;
    this.langFilter = this.langs[(this.langs.indexOf(this.langFilter) + (step || 1) + n) % n];
    this.refilter();
  },
  refilter: function () {
    this.idx = 0;
    this.moved = false;
    this.rebuild();
  },
  paintChips: function () {
    for (var i = 0; i < this.chipEls.length; i++) {
      var cur = this.chips[i] === this.filter;
      this.chipEls[i].className =
        'stchip' + (cur ? ' cur' : '') + (this.zone === 'chips' && i === this.chipIdx ? ' f' : '');
    }
    this.revealChip(this.zone === 'chips' ? this.chipIdx : this.chips.indexOf(this.filter));
    $('stBest').className = this.zone === 'best' ? 'f' : '';
    var lang = $('stLang');
    lang.textContent = tx('langFilter', this.langName(this.langFilter));
    lang.className = (this.langFilter !== 'All' ? 'cur' : '') + (this.zone === 'lang' ? ' f' : '');
  },
  /* When the chips do not fit (All, 4K, 1080p, 720p, SD, Other), the row scrolls so the
     focused one, or the active filter, is fully visible; the first chip keeps the row at
     the start. */
  revealChip: function (i) {
    var host = $('stChips'),
      el = this.chipEls[i];
    if (!el) return;
    var left = el.offsetLeft,
      right = left + el.offsetWidth,
      pad = 24;
    if (i === 0) host.scrollLeft = 0;
    else if (right + pad > host.scrollLeft + host.clientWidth)
      host.scrollLeft = right + pad - host.clientWidth;
    else if (left - pad < host.scrollLeft) host.scrollLeft = Math.max(0, left - pad);
  },
  rebuild: function () {
    var sel = this.moved ? this.items[this.idx] : null,
      flat = this.all(),
      self = this,
      pref = lsRaw('preferredSourceQuality', 'Auto'),
      langPref = fixedSourceLanguage(),
      lf = this.langFilter;
    flat = flat.filter(function (s) {
      return (
        (self.filter === 'All' || s.quality === self.filter) &&
        (lf === 'All' || s.stored || langGroups(s).indexOf(lf) >= 0)
      );
    });
    /* the last source first, then the preferred language, then the preferred quality */
    flat.sort(function (a, b) {
      if (!a.stored !== !b.stored) return a.stored ? -1 : 1;
      var al = langRank(a, langPref),
        bl = langRank(b, langPref);
      if (al !== bl) return al - bl;
      if (pref !== 'Auto') {
        var ap = a.quality === pref ? 0 : 1,
          bp = b.quality === pref ? 0 : 1;
        if (ap !== bp) return ap - bp;
      }
      return sourceOrder(a, b);
    });
    var host = $('stInner');
    host.innerHTML = '';
    this.items = [];
    this.els = [];
    /* named when there is a choice, and the same source the Best source button starts */
    var choices = flat.filter(function (s) {
      return !s.stored;
    }).length;
    var rec = choices < 2 ? -1 : flat.indexOf(bestSource(flat, pref));
    for (var i = 0; i < flat.length; i++) {
      var s = flat[i],
        d = document.createElement('div');
      d.className = 'st';
      if (i === rec) {
        var tag = document.createElement('div');
        tag.className = 'rec';
        tag.textContent = tx('recommendedSource');
        d.appendChild(tag);
      }
      var a = document.createElement('div');
      a.className = 'a';
      a.textContent = s.stored ? tx('continuePlayback') : s.addon || 'Addon';
      d.appendChild(a);
      var tags = s.stored ? [] : sourceTags(s);
      if (tags.length) {
        var tg = document.createElement('div');
        tg.className = 'tags';
        for (var ti = 0; ti < tags.length; ti++) {
          var tgi = document.createElement('span');
          tgi.className = 'tg' + (tags[ti].c ? ' ' + tags[ti].c : '');
          tgi.textContent = tags[ti].t;
          tg.appendChild(tgi);
        }
        d.appendChild(tg);
      }
      if (s.compatLabels && s.compatLabels.length) {
        var c = document.createElement('div');
        c.className = 'compat';
        c.textContent = tx('compatibilityCheck', s.compatLabels.join(' · '));
        d.appendChild(c);
      }
      var b = document.createElement('div');
      b.className = 'b';
      b.textContent = String(s.title || s.name || '').replace(/\n/g, '  ');
      d.appendChild(b);
      host.appendChild(d);
      this.items.push(s);
      this.els.push(d);
    }
    if (!this.items.length) host.innerHTML = '<div class="stmsg">' + tx('noSourcesQuality') + '</div>';
    if (this.failed.length) {
      var note = document.createElement('div');
      note.className = 'stmsg';
      note.textContent = tx('addonsNoAnswer', this.failed.join(', '));
      host.appendChild(note);
    }
    /* addons answer at different times: the focus stays on top until the viewer moves it, and
       only then follows the source it is on, so OK never starts another one */
    var at = sel ? this.items.indexOf(sel) : -1;
    this.idx = at >= 0 ? at : Math.min(this.idx, Math.max(0, this.items.length - 1));
    this.paint();
  },
  paint: function () {
    setF(this.els, this.zone === 'list' ? this.idx : -1);
    this.paintChips();
    var y = 0,
      el = this.els[this.idx];
    if (el && el.offsetTop > 260) y = el.offsetTop - 260;
    $('stInner').style.transform = 'translateY(-' + y + 'px)';
    $('stInner').style.webkitTransform = 'translateY(-' + y + 'px)';
  },
  close: function () {
    this.open = false;
    this.cancelFlush();
    this.requestSeq++;
    $('streams').style.display = 'none';
    bodyRemove('streamsopen');
  },
  choose: function () {
    var s = this.items[this.idx];
    if (!s) {
      if (this.failed.length) this.show(this.type, this.id, this.vid, this.title);
      return true;
    }
    if (s.stored) playStored(s.stored, this.backHash());
    else playUrl(s, this.type, this.id, this.vid, this.backHash());
    return true;
  },
  key: function (k) {
    if (this.searching) return true;
    if (this.zone === 'best') {
      if (k === 13) this.chooseBest();
      else if (k === 39 && this.langs.length) {
        this.zone = 'lang';
        this.paint();
      } else if (k === 40) {
        this.zone = 'chips';
        this.paint();
      }
      return true;
    }
    if (this.zone === 'lang') {
      if (k === 13 || k === 39) this.nextLang(1);
      else if (k === 37) this.nextLang(-1);
      else if (k === 40) {
        this.zone = 'chips';
        this.paint();
      }
      return true;
    }
    if (this.zone === 'chips') {
      if (k === 38) {
        this.zone = 'best';
        this.paint();
        return true;
      }
      if (k === 39) this.chipIdx = Math.min(this.chipEls.length - 1, this.chipIdx + 1);
      else if (k === 37) this.chipIdx = Math.max(0, this.chipIdx - 1);
      else if (k === 40 || k === 13) {
        if (this.items.length) {
          this.zone = 'list';
          this.paint();
        }
        return true;
      } else return true;
      this.filter = this.chips[this.chipIdx];
      this.refilter();
      return true;
    }
    if (k === 40) {
      if (!this.els.length) return true;
      this.idx = Math.min(this.els.length - 1, this.idx + 1);
      this.moved = true;
      this.paint();
    } else if (k === 38) {
      if (this.idx > 0) {
        this.idx--;
        this.moved = true;
        this.paint();
      } else {
        this.zone = 'chips';
        this.paint();
      }
    } else if (k === 13) {
      return this.choose();
    } else if (k === 37) this.close();
    return true;
  }
};
// Search screen: on-screen keyboard, live results and recent searches.
/* Typing with the remote is slow, so the last searches stay one key away. */
var RECENT_SEARCH_KEY = 'recentSearches',
  RECENT_SEARCH_MAX = 8;
function recentSearches() {
  var list = lsJson(RECENT_SEARCH_KEY);
  return Object.prototype.toString.call(list) === '[object Array]' ? list : [];
}
function rememberSearch(q) {
  q = String(q || '').replace(/^\s+|\s+$/g, '');
  if (!q || lsRaw('noHistory', 'false') === 'true') return;
  var list = recentSearches(),
    out = [q];
  for (var i = 0; i < list.length && out.length < RECENT_SEARCH_MAX; i++)
    if (typeof list[i] === 'string' && list[i].toLowerCase() !== q.toLowerCase()) out.push(list[i]);
  lsSet(RECENT_SEARCH_KEY, out);
}
window.__SC_REMEMBER_SEARCH__ = rememberSearch;
/* The on-screen keyboard replaces the system one (slow, covers the screen and closed
   after every key on some webOS builds): 6 x 6 letters and digits, then space, delete
   and clear across two columns each. The system keyboard stays one key up, on the box. */
var SEARCH_KEYS = 'abcdefghijklmnopqrstuvwxyz1234567890'.split('').concat(['space', 'del', 'clear']);
function searchKeyPos(i) {
  return i < 36 ? { r: Math.floor(i / 6), c: i % 6 } : { r: 6, c: (i - 36) * 2 };
}
function searchKeyAt(r, c) {
  return r < 6 ? r * 6 + c : 36 + Math.min(2, Math.floor(c / 2));
}
/* ================= SEARCH ================= */
var search = {
  zone: 'keys',
  rows: [],
  rowIdx: 0,
  keyIdx: 0,
  keyEls: [],
  text: '',
  liveT: null,
  recent: [],
  recentEls: [],
  recentIdx: 0,
  recentSig: null,
  q: '',
  gen: 0,
  previewId: '',
  previewT: null,
  requests: [],
  wire: function () {
    var self = this;
    var box = $('sBox');
    if (!box) return;
    if (!box._wired) {
      box._wired = true;
      on(
        box,
        'keydown',
        function (e) {
          if (e.keyCode === 13 || e.keyCode === 65376) {
            e.preventDefault();
            e.stopPropagation();
            $('sBox').blur();
            self.text = $('sBox').value;
            self.run(self.text);
          } else if (e.keyCode === 40) {
            e.preventDefault();
            e.stopPropagation();
            $('sBox').blur();
            self.text = $('sBox').value;
            self.zone = 'keys';
            self.paint();
          } else if (isRemoteBack(e.keyCode) || e.keyCode === 65385) {
            e.preventDefault();
            e.stopPropagation();
            $('sBox').blur();
            self.paint();
          }
        },
        true
      );
    }
    if (!this.keyEls.length) {
      var host = $('sKeys');
      for (var i = 0; i < SEARCH_KEYS.length; i++) {
        var el = document.createElement('div');
        el.className = 'skey' + (i >= 36 ? ' wide' : '');
        host.appendChild(el);
        this.keyEls.push(el);
      }
    }
    this.labelKeys();
  },
  labelKeys: function () {
    for (var i = 0; i < this.keyEls.length; i++) {
      var k = SEARCH_KEYS[i];
      this.keyEls[i].textContent =
        k === 'space' ? tx('keySpace') : k === 'del' ? tx('keyDelete') : k === 'clear' ? tx('keyClear') : k;
    }
  },
  enter: function (p) {
    this.wire();
    this.zone = 'keys';
    /* Back from a result returns to that result, not to the keyboard */
    if (p && p.zone === 'rows' && this.rows.length) {
      this.zone = 'rows';
      this.rowIdx = Math.max(0, Math.min(p.rowIdx || 0, this.rows.length - 1));
    }
    this.paint();
    animIn($('sWrap'));
  },
  enterNav: function () {
    this.wire();
    this.paint();
    animIn($('sWrap'));
  } /* shown but top nav keeps focus */,
  enterInput: function () {
    this.zone = 'keys';
    this.paint();
  } /* nav handed focus down to the keyboard */,
  /* Leaving Search for another section releases its results and decoded posters; the
     recent searches bring a query back with one key. */
  reset: function () {
    if (this.liveT) clearTimeout(this.liveT);
    this.liveT = null;
    this.clearResults();
    this.text = '';
    $('sBox').value = '';
    this.zone = 'keys';
    this.keyIdx = 0;
    this.recentSig = null;
    $('sHint').textContent = tx('searchHint');
    this.preview(null);
  },
  clearResults: function () {
    this.abort();
    ++this.gen;
    unloadBoard(this);
    $('sRows').innerHTML = '';
    this.rows = [];
    this.rowIdx = 0;
    this.q = '';
  },
  abort: function () {
    for (var rq = 0; rq < this.requests.length; rq++)
      if (this.requests[rq] && this.requests[rq].abort)
        try {
          this.requests[rq].abort();
        } catch (e) {}
    this.requests = [];
  },
  press: function (k) {
    if (k === 'space') {
      if (this.text && this.text.charAt(this.text.length - 1) !== ' ') this.text += ' ';
    } else if (k === 'del') this.text = this.text.slice(0, -1);
    else if (k === 'clear') this.text = '';
    else if (this.text.length < 60) this.text += k;
    $('sBox').value = this.text;
    this.scheduleLive();
  },
  /* results follow the typing after a short pause; one letter or none shows recents again */
  scheduleLive: function () {
    var self = this;
    if (this.liveT) clearTimeout(this.liveT);
    this.liveT = null;
    var q = this.text.replace(/^\s+|\s+$/g, '');
    if (q.length < 2) {
      if (this.rows.length || this.q) this.clearResults();
      $('sHint').textContent = tx('searchHint');
      this.paint();
      return;
    }
    this.liveT = setTimeout(function () {
      self.liveT = null;
      if (SCR === 'search') self.run(q, true);
    }, 650);
  },
  /* live: typed on the on-screen keyboard, remembered only once a result is opened */
  run: function (q, live) {
    q = String(q || '').replace(/^\s+|\s+$/g, '');
    if (!q || q === this.q) return;
    this.clearResults();
    this.q = q;
    if (!live) rememberSearch(q);
    var gen = this.gen,
      host = $('sRows'),
      self = this,
      got = 0;
    $('sHint').textContent = tx('searching');
    this.paint();
    function add(title, items) {
      got++;
      if (self.gen !== gen || self.q !== q) return;
      if (items && items.length) {
        var slim = [];
        for (var i = 0; i < Math.min(items.length, 20); i++) {
          var m = items[i];
          slim.push({
            id: m.id,
            type: m.type,
            name: m.name,
            poster: m.poster,
            background: m.background,
            logo: m.logo,
            description: m.description,
            releaseInfo: m.releaseInfo,
            year: m.year,
            runtime: m.runtime,
            imdbRating: m.imdbRating
          });
        }
        var row = buildRow(title, slim, false, true, false);
        row.el.className = 'row in';
        self.rows.push(row);
        host.appendChild(row.el);
      }
      if (got >= 2) {
        $('sHint').textContent = '';
        if (!self.rows.length) host.innerHTML = emptyState(tx('noResults', q), tx('noResultsHint'));
        /* a submitted query moves to the results; live typing keeps the keyboard */
        if (self.rows.length && self.zone === 'input') self.zone = 'rows';
        self.paint();
      }
    }
    this.requests.push(
      xhrJson(CIN + '/catalog/movie/top/search=' + encodeURIComponent(q) + '.json', function (j) {
        add(tx('movies'), (j && j.metas) || []);
      })
    );
    this.requests.push(
      xhrJson(CIN + '/catalog/series/top/search=' + encodeURIComponent(q) + '.json', function (j) {
        add(tx('series'), (j && j.metas) || []);
      })
    );
  },
  preview: function (it) {
    var box = $('sPreview');
    if (!box) return;
    if (this.previewT) {
      clearTimeout(this.previewT);
      this.previewT = null;
    }
    if (!it || this.zone !== 'rows') {
      box.style.display = 'none';
      this.previewId = '';
      return;
    }
    box.style.display = 'block';
    var key = it.type + ':' + it.id;
    this.previewId = key;
    $('spTitle').textContent = it.name || '';
    $('spMeta').textContent = [
      it.releaseInfo || it.year,
      it.runtime,
      it.imdbRating ? 'IMDb ' + it.imdbRating : ''
    ]
      .join('   ')
      .replace(/\s+/g, ' ');
    $('spDesc').textContent = it.description || '';
    if (!it.description || !it.runtime) {
      var self = this;
      this.previewT = setTimeout(function () {
        self.previewT = null;
        if (self.previewId !== key) return;
        getMeta(it.type, it.id, function (m) {
          if (!m || self.previewId !== key) return;
          it.description = m.description || it.description || '';
          it.runtime = m.runtime || it.runtime || '';
          it.releaseInfo = m.releaseInfo || it.releaseInfo || '';
          it.year = m.year || it.year || '';
          it.imdbRating = m.imdbRating || it.imdbRating || '';
          $('spTitle').textContent = m.name || it.name || '';
          $('spMeta').textContent = [
            it.releaseInfo || it.year,
            it.runtime,
            it.imdbRating ? 'IMDb ' + it.imdbRating : ''
          ]
            .join('   ')
            .replace(/\s+/g, ' ');
          $('spDesc').textContent = it.description;
        });
      }, 220);
    }
  },
  /* recent searches are offered while there are no results; the last chip clears them */
  renderRecent: function () {
    var list = this.rows.length || this.q ? [] : recentSearches(),
      sig = UI_LANG + '\n' + list.join('\n');
    if (sig === this.recentSig) return;
    this.recentSig = sig;
    var host = $('sRecent');
    host.innerHTML = '';
    this.recent = list;
    this.recentEls = [];
    if (!this.recent.length) return;
    var lbl = document.createElement('div');
    lbl.className = 'sreclbl';
    lbl.textContent = tx('recentSearches');
    host.appendChild(lbl);
    for (var i = 0; i <= this.recent.length; i++) {
      var c = document.createElement('div');
      c.className = 'schip' + (i === this.recent.length ? ' clear' : '');
      c.textContent = i === this.recent.length ? tx('clearHistory') : this.recent[i];
      host.appendChild(c);
      this.recentEls.push(c);
    }
    this.recentIdx = Math.min(this.recentIdx, this.recentEls.length - 1);
  },
  runRecent: function (i) {
    if (i === this.recent.length) {
      clearRecentSearches();
      this.zone = 'keys';
      this.paint();
      toast(tx('searchesCleared'));
      return;
    }
    var q = this.recent[i];
    if (!q) return;
    this.text = q;
    $('sBox').value = q;
    this.recentIdx = 0;
    this.zone = 'keys';
    this.run(q);
  },
  /* the right-hand column: results if any, otherwise the recent searches */
  toSide: function () {
    if (this.rows.length) this.zone = 'rows';
    else if (this.recentEls.length) this.zone = 'recent';
    else return false;
    this.paint();
    return true;
  },
  paint: function () {
    virtualizeBoard(this, this.rowIdx, false);
    $('sBox').className = this.zone === 'input' ? 'f' : '';
    this.renderRecent();
    if (this.zone === 'recent' && !this.recentEls.length) this.zone = 'keys';
    setF(this.recentEls, this.zone === 'recent' ? this.recentIdx : -1);
    setF(this.keyEls, this.zone === 'keys' && !topNav.active ? this.keyIdx : -1);
    var clipW = $('sRowsClip').clientWidth || contentWidth();
    for (var r = 0; r < this.rows.length; r++) {
      var row = this.rows[r];
      var active = this.zone === 'rows' && r === this.rowIdx;
      setF(row.cardEls, active ? row.col : -1);
      row.cardsEl.className = row.cardsEl.className.replace(/ ?\bact\b/, '') + (active ? ' act' : '');
      var w = 288,
        vis = Math.max(2, Math.floor(clipW / w));
      var off = Math.max(0, row.col - (vis - 2)) * w;
      row.cardsEl.style.transform = 'translateX(-' + off + 'px)';
      row.cardsEl.style.webkitTransform = 'translateX(-' + off + 'px)';
    }
    var y = this.rows[this.rowIdx] ? this.rows[this.rowIdx].el.offsetTop - this.rows[0].el.offsetTop : 0;
    $('sRows').style.transform = 'translateY(-' + y + 'px)';
    $('sRows').style.webkitTransform = 'translateY(-' + y + 'px)';
    /* browsing results -> backdrop follows the focused cover; typing -> faded logo */
    if (this.zone === 'rows') {
      var frow = this.rows[this.rowIdx];
      var fit = frow && frow.items[frow.col];
      $('logobg').className = '';
      if (fit) setBg(bgMid(fit));
      this.preview(fit);
    } else {
      this.preview(null);
      updateLogoBg();
    }
  },
  keysKey: function (k) {
    var p = searchKeyPos(this.keyIdx);
    if (k >= 65 && k <= 90) this.press(String.fromCharCode(k + 32));
    else if (k >= 48 && k <= 57) this.press(String(k - 48));
    else if (k === 8) this.press('del');
    else if (k === 13) this.press(SEARCH_KEYS[this.keyIdx]);
    else if (k === 37) {
      if (p.c === 0) {
        topNav.focus();
        return true;
      }
      this.keyIdx--;
    } else if (k === 39) {
      if (p.r < 6 ? p.c === 5 : this.keyIdx === SEARCH_KEYS.length - 1) return this.toSide() || true;
      this.keyIdx++;
    } else if (k === 38) {
      if (p.r === 0) this.zone = 'input';
      else this.keyIdx = searchKeyAt(p.r - 1, p.c);
    } else if (k === 40 && p.r < 6) this.keyIdx = searchKeyAt(p.r + 1, p.c);
    this.paint();
    return true;
  },
  key: function (k) {
    if (this.zone === 'keys') return this.keysKey(k);
    if (this.zone === 'input') {
      if (k === 13) {
        $('sBox').focus();
        return true;
      }
      if (k === 40) {
        this.zone = 'keys';
        this.paint();
        return true;
      }
      if (k === 37) {
        topNav.focus();
        return true;
      }
      return true;
    }
    if (this.zone === 'recent') {
      if (k === 39) this.recentIdx = Math.min(this.recentEls.length - 1, this.recentIdx + 1);
      else if (k === 37) {
        if (this.recentIdx === 0) this.zone = 'keys';
        else this.recentIdx--;
      } else if (k === 13) {
        this.runRecent(this.recentIdx);
        return true;
      }
      this.paint();
      return true;
    }
    var row = this.rows[this.rowIdx];
    if (!row) {
      this.zone = 'keys';
      this.paint();
      return true;
    }
    if (k === 39) {
      var st = hstep(1, row.cardsEl);
      var o = row.col;
      row.col = Math.min(row.items.length - 1, row.col + st);
      if (row.col !== o) {
        setF1(row.cardEls, o, row.col);
        this.paint();
      }
    } else if (k === 37) {
      if (row.col === 0) {
        this.zone = 'keys';
        this.paint();
        return true;
      }
      var st2 = hstep(-1, row.cardsEl);
      var o2 = row.col;
      row.col = Math.max(0, row.col - st2);
      if (row.col !== o2) {
        setF1(row.cardEls, o2, row.col);
        this.paint();
      }
    } else if (k === 40) {
      if (this.rowIdx < this.rows.length - 1) {
        this.rowIdx++;
        this.paint();
      }
    } else if (k === 38) {
      if (this.rowIdx > 0) {
        this.rowIdx--;
        this.paint();
      } else {
        this.zone = 'keys';
        this.paint();
      }
    } else if (k === 13) {
      var it = row.items[row.col];
      if (it) {
        /* a live query becomes a recent search once one of its results is opened */
        rememberSearch(this.q);
        openItem(it);
      }
    }
    return true;
  }
};
// Addons screen.
/* ================= ADDONS =================
   Read-only on the TV for now: account installation remains authoritative, while
   the user can inspect and resync the exact set driving Home and source results. */
var addonPanel = {
  idx: 0,
  els: [],
  list: [],
  enter: function () {
    this.idx = 0;
    this.els = [$('aSync')];
    this.list = addons();
    var host = $('aInner');
    host.innerHTML = '';
    for (var i = 0; i < this.list.length; i++) {
      var ad = this.list[i],
        m = ad.manifest || {},
        d = document.createElement('div');
      d.className = 'addon';
      var n = document.createElement('div');
      n.className = 'an';
      n.textContent = m.name || m.id || 'Addon';
      d.appendChild(n);
      var info = document.createElement('div');
      info.className = 'ai';
      info.textContent = [m.id || '', m.version || '', (m.types || []).join(' · ')]
        .join('   ')
        .replace(/\s+/g, ' ');
      d.appendChild(info);
      host.appendChild(d);
      this.els.push(d);
    }
    if (!this.list.length) {
      var empty = document.createElement('div');
      empty.className = 'stmsg';
      empty.textContent = tx('noAddons');
      host.appendChild(empty);
    }
    this.paint();
    animIn($('aWrap'));
  },
  focusTop: function () {
    topNav.active = false;
    this.idx = 0;
    this.paint();
    topNav.paint();
  },
  paint: function () {
    setF(this.els, topNav.active ? -1 : this.idx);
    var y = 0;
    if (this.idx > 3) {
      var el = this.els[this.idx];
      if (el) y = Math.max(0, el.offsetTop - 220);
    }
    $('aInner').style.transform = 'translateY(-' + y + 'px)';
    $('aInner').style.webkitTransform = 'translateY(-' + y + 'px)';
  },
  syncNow: function () {
    var self = this;
    toast(tx('syncing'));
    syncAddons(function (changed) {
      toast(changed ? tx('addonsUpdated') : tx('addonsCurrent'));
      self.enter();
      invalidateBoards();
    });
  },
  key: function (k) {
    if (k === 40) {
      this.idx = Math.min(this.els.length - 1, this.idx + 1);
      this.paint();
    } else if (k === 38) {
      if (this.idx > 0) {
        this.idx--;
        this.paint();
      }
    } else if (k === 37) topNav.focus();
    else if (k === 13 && this.idx === 0) this.syncNow();
    return true;
  }
};
// Settings and account screen.
/* ================= SETTINGS + ACCOUNT ================= */
function mediaLanguageOptions() {
  return [
    ['', tx('disabled')],
    ['por', tx('portugueseBrazil')],
    ['eng', tx('english')],
    ['spa', tx('spanish')],
    ['fre', tx('french')],
    ['ita', tx('italian')],
    ['ger', tx('german')],
    ['ara', tx('arabic')],
    ['rus', tx('russian')],
    ['tur', tx('turkish')],
    ['pol', tx('polish')],
    ['dut', tx('dutch')],
    ['swe', tx('swedish')],
    ['heb', tx('hebrew')],
    ['hin', tx('hindi')],
    ['jpn', tx('japanese')],
    ['kor', tx('korean')],
    ['chi', tx('chinese')]
  ];
}
/* one recorded problem as '14:32 · Source would not play (Torrentio 1080p)' */
function diagEventLine(e) {
  var d = new Date(e.at),
    hh = (d.getHours() < 10 ? '0' : '') + d.getHours(),
    mm = (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(),
    key = {
      media_error: 'evMediaError',
      media_start_retry: 'evSlowStart',
      streamref_failed: 'evPrepareFailed',
      play_rejected: 'evPlayRejected',
      addon_unavailable: 'evAddonDown',
      network_unreachable: 'evNoNetwork'
    }[e.kind];
  return hh + ':' + mm + '  ·  ' + tx(key || e.kind) + (e.detail ? ' (' + e.detail + ')' : '');
}
/* running or stopped; the engine itself only runs while a torrent plays */
function diagStreamingState(j) {
  var f = j.torrentEngine || {};
  if (j.serverAddress)
    return j.serverAddress + '  ·  ' + tx(j.streamingServer ? 'diagRunning' : 'diagStopped');
  if (f.state === 'failed') return tx('diagStreamFailed', 'sc-engine');
  if (f.state === 'no-room') return tx('torrentsNoRoom');
  var where = f.usb ? '  ·  ' + tx('diagOnUsb') : '',
    cache = f.cacheMb != null && f.cacheCapMb ? '  ·  ' + tx('diagCache', f.cacheMb, f.cacheCapMb) : '';
  return tx(f.running ? 'diagRunning' : 'diagEngineReady') + where + cache;
}
/* an option that is only on or off is drawn as a switch, and OK flips it */
function isSwitch(def) {
  return (
    !!def.opts &&
    def.opts.length === 2 &&
    /^(true|false)$/.test(def.opts[0][0]) &&
    /^(true|false)$/.test(def.opts[1][0])
  );
}
/* Settings in two columns, as the big streaming apps lay them out: the groups on the left and
   the options of the chosen group on the right. Moving through the groups shows their options
   at once; Right or OK goes into them and Left comes back. */
var settings = {
  idx: 0,
  els: [],
  defs: [],
  cats: [],
  catEls: [],
  catIdx: 0,
  zone: 'cats',
  editing: false,
  editOriginal: null,
  enter: function (preserveEdit) {
    if (!preserveEdit) {
      this.editing = false;
      this.editOriginal = null;
    }
    var u = user() || {};
    $('setAcct').getElementsByClassName('em')[0].textContent = u.email || tx('connectedAccount');
    var prem = tx(isNuvioAccount() ? 'nuvioAccountLabel' : 'freeAccount');
    if (u.premium_expire && String(u.premium_expire).indexOf('000') !== 0) {
      var d = new Date(u.premium_expire);
      if (d.getTime() > Date.now()) prem = tx('premiumUntil', d.toLocaleDateString());
    }
    $('setAcct').getElementsByClassName('pl')[0].textContent = prem;
    var langOpts = mediaLanguageOptions(),
      audioOpts = langOpts.slice(1),
      backupOpts = [['', tx('none')]].concat(audioOpts);
    this.defs = [
      { head: tx('playbackGroup'), id: 'playback' },
      {
        k: 'preferredSourceQuality',
        lb: tx('preferredQuality'),
        opts: [
          ['Ask', tx('qualityAsk')],
          ['Auto', tx('automatic')],
          ['4K', '4K'],
          ['1080p', '1080p'],
          ['720p', '720p'],
          ['SD', 'SD']
        ],
        d: 'Ask'
      },
      {
        k: 'preferredSourceLanguage',
        lb: tx('preferredLanguage'),
        opts: [
          ['Ask', tx('qualityAsk')],
          ['Auto', tx('anyLanguage')]
        ].concat(SOURCE_LANGUAGES),
        d: 'Ask'
      },
      {
        k: 'bingeWatch',
        lb: tx('nextEpisode'),
        opts: [
          ['true', tx('enabled')],
          ['false', tx('disabled')]
        ],
        d: 'true'
      },
      {
        k: 'seekStep',
        lb: tx('seekInterval'),
        opts: [
          ['5', '5s'],
          ['10', '10s'],
          ['15', '15s'],
          ['20', '20s'],
          ['30', '30s']
        ],
        d: '10'
      },
      {
        k: 'scrubPreview',
        lb: tx('scrubPreview'),
        opts: [
          ['true', tx('enabled')],
          ['false', tx('disabled')]
        ],
        d: 'false'
      },
      { head: tx('subtitlesGroup'), id: 'subtitles' },
      { k: 'subsLang', lb: tx('defaultLanguage'), opts: langOpts, d: defaultMediaLanguage() },
      { k: 'subsLang2', lb: tx('backupLanguage'), opts: backupOpts, d: '' },
      {
        k: 'subtitleSize',
        lb: tx('subtitleSize'),
        opts: [
          ['0', '72%'],
          ['1', '80%'],
          ['2', '100%'],
          ['3', '120%'],
          ['4', '140%'],
          ['5', '160%'],
          ['6', '180%']
        ],
        d: '2'
      },
      {
        k: 'subsColor',
        lb: tx('subtitleColor'),
        opts: [
          ['#ffffff', tx('white')],
          ['#ffe600', tx('yellow')],
          ['#00e5ff', tx('cyan')]
        ],
        d: '#ffffff'
      },
      {
        k: 'subsOutlineColor',
        lb: tx('subtitleOutline'),
        opts: [
          ['#000000', tx('black')],
          ['#ffffff', tx('white')]
        ],
        d: '#000000'
      },
      {
        k: 'subsBgStyle',
        lb: tx('subtitleBackground'),
        opts: [
          ['0', tx('none')],
          ['1', tx('solid')],
          ['.6', tx('transparent')]
        ],
        d: '0'
      },
      {
        k: 'assStyle',
        lb: tx('assStyle'),
        opts: [
          ['false', tx('disabled')],
          ['true', tx('enabled')]
        ],
        d: 'false'
      },
      {
        k: 'embSubsMode',
        lb: tx('embeddedSubtitles'),
        opts: [
          ['server', tx('extractRecommended')],
          ['native', tx('tvNative')]
        ],
        d: 'server'
      },
      { head: tx('audioGroup'), id: 'audio' },
      {
        k: 'enableDefaultAudioTrack',
        lb: tx('autoAudio'),
        opts: [
          ['true', tx('enabled')],
          ['false', tx('disabled')]
        ],
        d: 'false'
      },
      { k: 'defaultAudioTrack', lb: tx('defaultAudio'), opts: audioOpts, d: defaultMediaLanguage() },
      { k: 'defaultAudioTrack2', lb: tx('backupLanguage'), opts: backupOpts, d: '' },
      { head: tx('interfaceGroup'), id: 'interface' },
      {
        k: UI_LANG_KEY,
        lb: tx('interfaceLanguage'),
        opts: Object.keys(UI_LANGUAGES).map(function (code) {
          return [code, UI_LANGUAGES[code]];
        }),
        d: UI_LANG
      },
      {
        k: 'uiMode',
        lb: tx('uiModeLabel'),
        opts: [
          ['full', tx('modeFull')],
          ['simple', tx('modeSimple')]
        ],
        d: 'full'
      },
      {
        k: 'uiLook',
        lb: tx('uiLookLabel'),
        opts: [
          ['standard', tx('lookStandard')],
          ['light', tx('lookLight')]
        ],
        d: uiLook()
      },
      {
        k: 'uiTextSize',
        lb: tx('interfaceTextSize'),
        opts: [
          ['normal', tx('textNormal')],
          ['large', tx('textLarge')]
        ],
        d: 'normal'
      },
      {
        k: 'bgTrailer',
        lb: tx('backgroundTrailers'),
        opts: [
          ['false', tx('disabled')],
          ['true', tx('enabled')]
        ],
        d: 'false'
      },
      { head: tx('accountGroup'), id: 'account' },
      { k: '__profile', lb: tx('nuvioProfile'), action: true },
      { k: '__sync', lb: tx('syncAddons'), action: true },
      { head: tx('historyGroup'), id: 'history' },
      {
        k: 'noHistory',
        lb: tx('noHistory'),
        opts: [
          ['false', tx('disabled')],
          ['true', tx('enabled')]
        ],
        d: 'false'
      },
      { k: '__clearSearches', lb: tx('clearSearches'), action: true },
      { k: '__clearCw', lb: tx('clearCw'), action: true },
      { k: '__showNew', lb: tx('showHiddenNewEpisodes'), action: true },
      {
        k: 'torrentsOnUsb',
        lb: tx('torrentsOnUsb'),
        opts: [
          ['false', tx('disabled')],
          ['true', tx('enabled')]
        ],
        d: 'false'
      },
      { k: '__clearCache', lb: tx('clearTorrentCache'), action: true },
      { head: tx('maintenanceGroup'), id: 'maintenance' },
      { k: '__server', lb: tx('serverAddress'), action: true, info: true },
      { k: '__diag', lb: tx('diagnostics'), action: true },
      { k: '__speed', lb: tx('testConnection'), action: true },
      { k: '__reload', lb: tx('reloadApp'), action: true },
      { head: tx('supportGroup'), id: 'support' },
      { k: '__support', lb: tx('supportCoffee'), action: true },
      { head: tx('signOut'), id: 'logout' },
      { k: '__logout', lb: tx('signOut'), action: true }
    ];
    /* profiles exist only on Nuvio accounts */
    if (!isNuvioAccount())
      this.defs = this.defs.filter(function (d) {
        return d.k !== '__profile';
      });
    /* Simple keeps what most people change: languages, subtitle size, the look and the account */
    if (simpleMode()) {
      var essential =
        /^(subsLang|subsLang2|subtitleSize|enableDefaultAudioTrack|defaultAudioTrack|bingeWatch|preferredSourceQuality|uiLanguage|uiMode|uiLook|uiTextSize|__profile|__logout|__diag|__reload|__support)$/;
      this.defs = this.defs.filter(function (d) {
        return d.head || essential.test(d.k || '');
      });
      /* a heading with nothing under it goes too */
      this.defs = this.defs.filter(function (d, i, all) {
        return !d.head || (all[i + 1] && !all[i + 1].head);
      });
    }
    /* these depend on FFmpeg or on memory only the LG packages can spare */
    if (!HAS_MEDIA_TOOLS)
      for (var nf = this.defs.length - 1; nf >= 0; nf--)
        if (/^(scrubPreview|embSubsMode|bgTrailer|torrentsOnUsb|__clearCache)$/.test(this.defs[nf].k || ''))
          this.defs.splice(nf, 1);
    var oldCats = this.cats;
    this.cats = [];
    for (var i = 0; i < this.defs.length; i++) {
      var def = this.defs[i];
      if (def.head) this.cats.push({ name: def.head, id: def.id || '', items: [] });
      else if (this.cats.length) this.cats[this.cats.length - 1].items.push(def);
    }
    this.cats = this.cats.filter(function (c) {
      return c.items.length;
    });
    var keepCat = preserveEdit && oldCats.length ? oldCats[this.catIdx].id : '',
      keepKey = preserveEdit && this.fdefs && this.fdefs[this.idx] ? this.fdefs[this.idx].k : '';
    var catHost = $('setCats');
    catHost.innerHTML = '';
    this.catEls = [];
    for (var c = 0; c < this.cats.length; c++) {
      var el = document.createElement('div');
      el.className = 'setcat' + (this.cats[c].id === 'logout' ? ' out' : '');
      el.textContent = this.cats[c].name;
      if (this.cats[c].id === keepCat) this.catIdx = c;
      catHost.appendChild(el);
      this.catEls.push(el);
    }
    if (!preserveEdit) {
      this.catIdx = 0;
      this.zone = 'cats';
    }
    this.catIdx = Math.min(this.catIdx, this.cats.length - 1);
    this.showCat();
    for (var f = 0; f < this.fdefs.length; f++) if (this.fdefs[f].k === keepKey) this.idx = f;
    this.paint();
    this.showServerAddress();
    animIn($('setWrap'));
  },
  /* the options of the chosen group, as cards; the account card heads the Account group */
  showCat: function () {
    var cat = this.cats[this.catIdx],
      host = $('setItems');
    host.innerHTML = '';
    this.els = [];
    this.fdefs = [];
    this.idx = 0;
    $('setAcct').style.display = cat.id === 'account' || cat.id === 'logout' ? '' : 'none';
    var hd = document.createElement('div');
    hd.className = 'setgrp';
    hd.textContent = cat.name;
    host.appendChild(hd);
    for (var i = 0; i < cat.items.length; i++) {
      var def = cat.items[i],
        d = document.createElement('div'),
        l = document.createElement('div'),
        v = document.createElement('div');
      d.className =
        'set' + (def.action ? ' act' : '') + (def.info ? ' info' : '') + (def.k === '__logout' ? ' out' : '');
      l.className = 'lb';
      l.textContent = def.lb;
      d.appendChild(l);
      v.className = 'vl';
      d.appendChild(v);
      host.appendChild(d);
      this.els.push(d);
      this.fdefs.push(def);
      this.paintValue(i);
    }
    this.paintServerAddress();
    this.paint();
  },
  /* a switch for on and off, otherwise the chosen value */
  paintValue: function (i) {
    var def = this.fdefs[i],
      v = this.els[i] && this.els[i].getElementsByClassName('vl')[0];
    if (!v || def.action) return;
    if (isSwitch(def)) {
      v.className = 'vl sw' + (lsRaw(def.k, def.d) === 'true' ? ' on' : '');
      v.textContent = '';
    } else v.textContent = this.valLabel(def);
  },
  /* Account from the profile item of the side menu */
  openCategory: function (id) {
    for (var c = 0; c < this.cats.length; c++)
      if (this.cats[c].id === id) {
        this.catIdx = c;
        this.showCat();
        this.zone = 'items';
        topNav.active = false;
        topNav.paint();
        this.paint();
      }
  },
  /* OK on an option: an action runs, a switch flips, anything else starts editing */
  activate: function () {
    var def = this.fdefs[this.idx];
    if (!def) return;
    if (def.action) {
      if (def.k === '__sync') this.syncNow();
      else if (def.k === '__reload') this.reloadNow();
      else this.runAction(def.k);
    } else if (isSwitch(def)) {
      if (!this.cycle(def, 1)) this.paintValue(this.idx);
    } else this.startEdit();
  },
  /* the value of the address row comes from the local server */
  serverAddress: '',
  showServerAddress: function () {
    var self = this;
    xhrJson(
      '/serverconfig',
      function (j) {
        self.serverAddress = (j && j.address) || '';
        self.paintServerAddress();
      },
      3000
    );
  },
  paintServerAddress: function () {
    if (!this.fdefs) return;
    for (var i = 0; i < this.fdefs.length; i++)
      if (this.fdefs[i].k === '__server')
        this.els[i].getElementsByClassName('vl')[0].textContent =
          this.serverAddress.replace(/^https?:\/\//, '') || tx('serverHere');
  },
  syncNow: function () {
    toast(tx('syncing'));
    pullLib(function () {
      invalidateBoards();
    });
    syncAddons(function (changed) {
      toast(changed ? tx('addonsUpdated') : tx('addonsCurrent'));
      if (changed) buildHomeRows(true);
    });
  },
  reloadNow: function () {
    manualRecover();
  },
  /* actions that are not Sync or Reload; the destructive one asks for a second OK */
  runAction: function (k) {
    if (k === '__server') {
      var self = this;
      serverPanel.show(this.serverAddress, function (address) {
        self.serverAddress = address;
        self.paintServerAddress();
      });
    } else if (k === '__diag') this.showDiag();
    else if (k === '__support') this.showSupport();
    else if (k === '__profile') openProfile();
    else if (k === '__logout') this.logout();
    else if (k === '__clearSearches') {
      clearRecentSearches();
      toast(tx('searchesCleared'));
    } else if (k === '__speed') {
      toast(tx('testingConnection'), 12000);
      xhrJson(
        '/speedtest',
        function (j) {
          if (!j || j.latencyMs == null) return toast(tx('connectionFailed', (j && j.error) || '—'), 6000);
          var line = tx('connectionLatency', j.latencyMs);
          if (j.mbps != null) line += '  ·  ' + tx('connectionSpeed', j.mbps, j.host);
          toast(line, 9000);
        },
        20000
      );
    } else if (k === '__clearCache') {
      xhrJson(
        '/clearcache',
        function (j) {
          if (!j) toast(tx('diagUnavailable'));
          else if (j.running) toast(tx('cacheInUse'));
          else toast(j.mb ? tx('cacheCleared', j.mb) : tx('nothingToClear'));
        },
        8000
      );
    } else if (k === '__showNew') {
      var hiddenCount = hiddenNewEpisodes().length;
      lsSet(NEW_EPISODES_HIDDEN, []);
      toast(hiddenCount ? tx('newEpisodesShown', hiddenCount) : tx('nothingToClear'));
    } else if (k === '__clearCw') {
      if (!this.confirming(k)) return;
      var n = clearContinueWatching();
      toast(n ? tx('cwCleared', n) : tx('nothingToClear'));
    }
  },
  /* true on the second OK within 4 s; the first one turns the value into a prompt */
  confirming: function (k) {
    var row = this.els[this.idx],
      vl = row && row.getElementsByClassName('vl')[0];
    if (this.confirmKey === k && Date.now() < this.confirmUntil) {
      this.confirmKey = '';
      if (vl) vl.textContent = '';
      return true;
    }
    this.confirmKey = k;
    this.confirmUntil = Date.now() + 4000;
    if (vl) {
      vl.textContent = tx('confirmAgain');
      setTimeout(function () {
        vl.textContent = '';
      }, 4000);
    }
    return false;
  },
  /* the diagnostics panel opens under its row; OK again or Back closes it */
  closeDiag: function () {
    var box = $('setDiag');
    if (!box) return false;
    box.parentNode.removeChild(box);
    return true;
  },
  /* the support page as a QR code for the phone, with its address, under its row */
  showSupport: function () {
    if (this.closeDiag()) return;
    var row = this.els[this.idx],
      box = document.createElement('div');
    box.id = 'setDiag';
    box.className = 'setdiag support';
    box.innerHTML = '<img src="/support-qr.svg" alt=""><div><p></p><b>buymeacoffee.com/Alexesmm</b></div>';
    box.getElementsByTagName('p')[0].textContent = tx('supportText');
    row.parentNode.insertBefore(box, row.nextSibling);
  },
  /* Numbers to compare before and after a change, read on the television itself. */
  showDiag: function () {
    if (this.closeDiag()) return;
    var row = this.els[this.idx],
      box = document.createElement('div');
    box.id = 'setDiag';
    box.className = 'setdiag';
    row.parentNode.insertBefore(box, row.nextSibling);
    box.textContent = tx('diagLoading');
    var heap =
        window.performance && performance.memory
          ? Math.round(performance.memory.usedJSHeapSize / 1048576)
          : '—',
      home = window.__SC_HOME_LOAD_MS__ ? (window.__SC_HOME_LOAD_MS__ / 1000).toFixed(1) : '—',
      shown = window.__SC_VISIBLE_MS__ ? (window.__SC_VISIBLE_MS__ / 1000).toFixed(1) : '—';
    xhrJson(
      '/diag',
      function (j) {
        if (!j || !j.server) {
          box.textContent = tx('diagUnavailable');
          return;
        }
        var lines = [
          tx('diagServer', j.server.rssMb, j.server.heapMb, j.uptimeMin),
          tx('diagTv', j.system.availableMb, j.system.totalMb, j.load),
          j.disk ? tx('diagDisk', j.disk.freeMb, j.disk.totalMb) : '',
          tx('diagStreaming', diagStreamingState(j)),
          j.nativeProbe ? 'Native code: ' + j.nativeProbe : '',
          tx('diagInterface', heap, shown, home),
          tx('diagPeak', j.peakRssMb, j.minAvailableMb),
          smoothnessLine()
        ];
        var events = j.events || [];
        lines.push(events.length ? tx('diagRecent') : tx('diagNoProblems'));
        for (var ev = 0; ev < events.length && ev < 5; ev++) lines.push(diagEventLine(events[ev]));
        box.textContent = '';
        for (var i = 0; i < lines.length; i++) {
          if (!lines[i]) continue;
          var line = document.createElement('div');
          line.textContent = lines[i];
          box.appendChild(line);
        }
      },
      5000
    );
  },
  valLabel: function (def) {
    var cur = lsRaw(def.k, def.d);
    for (var i = 0; i < def.opts.length; i++) if (def.opts[i][0] === cur) return def.opts[i][1] + '  ›';
    return def.opts[0][1] + '  ›';
  },
  cycle: function (def, dir) {
    var cur = lsRaw(def.k, def.d),
      ci = 0;
    for (var i = 0; i < def.opts.length; i++) if (def.opts[i][0] === cur) ci = i;
    ci = (ci + dir + def.opts.length) % def.opts.length;
    lsRawSet(def.k, def.opts[ci][0]);
    if (def.k === 'uiTextSize') applyTextSize();
    if (def.k === 'uiLook') applyLook();
    if (def.k === 'uiMode' || def.k === UI_LANG_KEY) {
      if (def.k === UI_LANG_KEY) setUILanguage(def.opts[ci][0]);
      this.enter(true);
      return true;
    }
    if (def.k === 'bingeWatch') lsRawSet('enableNextVideo', def.opts[ci][0]);
    /* the server chooses where torrents go */
    if (def.k === 'torrentsOnUsb')
      xhrJson('/torrentplace?usb=' + (def.opts[ci][0] === 'true' ? '1' : '0'), function () {}, 5000);
    return false;
  },
  startEdit: function () {
    var def = this.fdefs[this.idx];
    if (!def || def.action) return;
    this.editing = true;
    this.editOriginal = { k: def.k, v: lsRaw(def.k, def.d) };
    this.paint();
  },
  finishEdit: function () {
    this.editing = false;
    this.editOriginal = null;
    this.paint();
  },
  cancelEdit: function () {
    if (!this.editing) return;
    var old = this.editOriginal,
      idx = this.idx;
    this.editing = false;
    this.editOriginal = null;
    if (old) {
      lsRawSet(old.k, old.v);
      if (old.k === UI_LANG_KEY) {
        setUILanguage(old.v);
        this.enter(true);
      } else this.paintValue(idx);
    }
    this.paint();
  },
  logout: function () {
    var ak = authKey();
    toast(tx('signingOut'));
    postJson(API + '/api/logout', { authKey: ak }, function () {}, 4000);
    var kill = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (
        k === 'authKey' ||
        k === 'user' ||
        k === 'profileFace' ||
        k === 'newEpisodes' ||
        k === 'addons' ||
        k === 'addonsLastModified' ||
        k === 'blib_migrated' ||
        k.indexOf('lib_') === 0 ||
        k.indexOf('blib_') === 0 ||
        k.indexOf('subs_') === 0 ||
        k.indexOf('tvstream_') === 0 ||
        k.indexOf('beta_') === 0
      )
        kill.push(k);
    }
    for (var j = 0; j < kill.length; j++) {
      try {
        localStorage.removeItem(kill[j]);
      } catch (e) {}
    }
    setTimeout(function () {
      location.reload();
    }, 400);
  },
  focusTop: function () {
    this.editing = false;
    this.editOriginal = null;
    this.zone = 'cats';
    this.paint();
  },
  paint: function () {
    var onCats = !topNav.active && this.zone === 'cats';
    for (var g = 0; g < this.catEls.length; g++)
      this.catEls[g].className =
        'setcat' +
        (this.cats[g].id === 'logout' ? ' out' : '') +
        (g === this.catIdx ? (onCats ? ' f' : ' cur') : '');
    setF(this.els, topNav.active || this.zone !== 'items' ? -1 : this.idx);
    for (var c = 0; c < this.els.length; c++)
      this.els[c].className =
        this.els[c].className.replace(/ ?\bediting\b/, '') +
        (this.editing && c === this.idx ? ' editing' : '');
    if ($('setHint')) $('setHint').textContent = tx(this.editing ? 'settingsEditing' : 'settingsHint');
    var el = this.els[this.idx],
      y = 0,
      /* the focus stops at this height of the screen, whatever its resolution */
      stop = Math.round($('setPane').clientHeight * 0.63);
    if (this.zone === 'items' && el && el.offsetTop > stop) y = el.offsetTop - stop;
    $('setInner').style.transform = 'translateY(-' + y + 'px)';
    $('setInner').style.webkitTransform = 'translateY(-' + y + 'px)';
  },
  key: function (k) {
    var def = this.fdefs[this.idx];
    if (this.editing) {
      if ((k === 37 || k === 39) && def && !def.action) {
        if (!this.cycle(def, k === 39 ? 1 : -1)) this.paintValue(this.idx);
      } else if (k === 13) this.finishEdit();
      this.paint();
      return true;
    }
    if (this.zone === 'cats') {
      if (k === 40 || k === 38) {
        var next = Math.max(0, Math.min(this.cats.length - 1, this.catIdx + (k === 40 ? 1 : -1)));
        if (next !== this.catIdx) {
          this.catIdx = next;
          this.showCat();
        }
      } else if (k === 37) {
        topNav.focus();
        return true;
      } else if (k === 39 || k === 13) this.zone = 'items';
      this.paint();
      return true;
    }
    if (k === 40) this.idx = Math.min(this.els.length - 1, this.idx + 1);
    else if (k === 38) {
      if (this.idx > 0) this.idx--;
    } else if (k === 37) this.zone = 'cats';
    else if (k === 13 && def) {
      this.activate();
      return true;
    }
    this.paint();
    return true;
  }
};
// Typing the streaming server address with the remote.
/* Letters, digits and what an address needs, ten to a row; below them delete, clear, back
   to the server on this TV, and test and save. The number keys of the remote type too. */
var SERVER_KEYS = '1234567890abcdefghijklmnopqrstuvwxyz.:-/'.split('');
var serverPanel = {
  open: false,
  busy: false,
  text: '',
  idx: 0,
  els: [],
  actions: ['serverDelete', 'serverClear', 'serverUseTv', 'serverSave'],
  done: null,
  show: function (current, done) {
    this.open = true;
    this.busy = false;
    this.text = String(current || '').replace(/^http:\/\//, '');
    this.done = done;
    this.idx = 0;
    this.build();
    $('serverPanel').style.display = 'block';
    this.status(tx('serverHint'));
    this.paint();
  },
  build: function () {
    var host = $('srvKeys'),
      self = this;
    host.innerHTML = '';
    this.els = [];
    $('srvTitle').textContent = tx('serverTitle');
    function add(label, wide) {
      var b = document.createElement('div');
      b.className = 'srvkey' + (wide ? ' srvact' : '');
      b.textContent = label;
      host.appendChild(b);
      self.els.push(b);
    }
    for (var i = 0; i < SERVER_KEYS.length; i++) add(SERVER_KEYS[i], false);
    for (var a = 0; a < this.actions.length; a++) add(tx(this.actions[a]), true);
  },
  status: function (text) {
    $('srvStatus').textContent = text;
  },
  paint: function () {
    /* a long address keeps its end in view, where the typing happens */
    $('srvValue').textContent = this.text.length > 40 ? '…' + this.text.slice(-39) : this.text || ' ';
    setF(this.els, this.idx);
  },
  close: function () {
    this.open = false;
    $('serverPanel').style.display = 'none';
  },
  press: function (i) {
    if (this.busy) return;
    if (i < SERVER_KEYS.length) {
      this.type(SERVER_KEYS[i]);
    } else {
      var action = this.actions[i - SERVER_KEYS.length];
      if (action === 'serverDelete') this.text = this.text.slice(0, -1);
      else if (action === 'serverClear') this.text = '';
      else if (action === 'serverUseTv') this.submit('');
      else if (action === 'serverSave') this.submit(this.text);
    }
    this.paint();
  },
  type: function (ch) {
    if (this.busy || this.text.length >= 120) return;
    this.text += ch;
    this.status(tx('serverHint'));
  },
  submit: function (address) {
    var self = this;
    this.busy = true;
    this.status(tx('serverTesting'));
    postJson(
      '/serverconfig',
      { address: address },
      function (j) {
        self.busy = false;
        if (!self.open) return;
        if (j && j.ok) {
          self.close();
          toast(j.address ? tx('serverSaved') : tx('serverLocal'));
          if (self.done) self.done(j.address);
          return;
        }
        var why = j && j.err;
        self.status(
          tx(why === 'invalid' ? 'serverInvalid' : why === 'disk' ? 'serverDisk' : 'serverUnreachable')
        );
      },
      10000
    );
  },
  /* rows of ten over a row of four wider keys */
  key: function (k) {
    var n = SERVER_KEYS.length,
      i = this.idx;
    if (k >= 48 && k <= 57) {
      this.type(String(k - 48));
    } else if (k === 13) {
      this.press(i);
      return;
    } else if (k === 37) {
      if (i < n ? i % 10 > 0 : i > n) this.idx = i - 1;
    } else if (k === 39) {
      if (i < n ? i % 10 < 9 : i < n + this.actions.length - 1) this.idx = i + 1;
    } else if (k === 38) {
      if (i >= n) this.idx = n - 10 + Math.floor(((i - n) * 10) / this.actions.length);
      else if (i >= 10) this.idx = i - 10;
    } else if (k === 40) {
      if (i < n - 10) this.idx = i + 10;
      else if (i < n) this.idx = n + Math.floor(((i - (n - 10)) * this.actions.length) / 10);
    }
    this.paint();
  }
};
window.__SC_SERVER_PANEL__ = serverPanel;
// Login screen: QR pairing and email sign-in.
/* ================= LOGIN (standalone: QR + email) ================= */
var login = {
  zone: 'email',
  poll: null,
  started: false,
  polling: false,
  suspended: false,
  qrCode: '',
  pollGen: 0,
  statusKey: 'generatingCode',
  /* which account: 'stremio', or 'nuvio' (experimental, nuvio-account.js on the server) */
  provider: 'stremio',
  enter: function () {
    var self = this,
      email = $('lgEmail'),
      pass = $('lgPass'),
      lang = $('lgLang');
    if (lang && !lang._wired) {
      lang._wired = true;
      on(
        lang,
        'click',
        function () {
          self.chooseLanguage();
        },
        false
      );
    }
    var prov = $('lgProv');
    if (prov && !prov._wired) {
      prov._wired = true;
      on(
        prov,
        'click',
        function (e) {
          var spans = prov.getElementsByTagName('span');
          self.setProvider(e && e.target === spans[1] ? 'nuvio' : 'stremio');
        },
        false
      );
    }
    if (email && !email._wired) {
      email._wired = true;
      var wire = function (el, next) {
        if (!el) return;
        on(
          el,
          'keydown',
          function (e) {
            if (e.keyCode === 13 || e.keyCode === 40 || e.keyCode === 65376) {
              e.preventDefault();
              e.stopPropagation();
              el.blur();
              self.zone = next;
              self.paint();
            } else if (isRemoteBack(e.keyCode) || e.keyCode === 65385) {
              e.preventDefault();
              e.stopPropagation();
              el.blur();
              self.paint();
            }
          },
          true
        );
      };
      wire(email, 'pass');
      wire(pass, 'btn');
    }
    this.paint();
    this.setStatus(this.statusKey);
    /* chosen at the first start of 4.0 (setup.js): the form opens on Nuvio */
    if (lsRaw('loginProvider', '') === 'nuvio') {
      lsRawSet('loginProvider', '');
      this.provider = 'stremio';
      this.setProvider('nuvio');
      return;
    }
    this.startQr();
  },
  setStatus: function (key) {
    this.statusKey = key;
    var el = $('lgStat');
    if (el) {
      el.textContent = tx(key);
      el.className =
        key === 'generatingCode' ||
        key === 'waitingPhone' ||
        key === 'signingIn' ||
        key === 'accountConnected'
          ? 'loading'
          : '';
    }
  },
  /* the list of languages; the screen is drawn again in the one chosen */
  chooseLanguage: function () {
    var self = this;
    languagePanel.show(function () {
      self.setStatus(self.statusKey);
      self.paint();
    });
  },
  startQr: function () {
    if (this.qrCode) {
      this.schedulePoll(this.pollGen);
      return;
    }
    if (this.started) return;
    this.started = true;
    this.suspended = false;
    var self = this,
      gen = ++this.pollGen;
    /* Nuvio: the local server asks Nuvio for a code and draws its QR (nuvio-account.js, qr.js) */
    if (this.provider === 'nuvio')
      return xhrJson(
        '/nuvioqr',
        function (j) {
          if (self.pollGen !== gen) return;
          if (!j || !j.id) {
            self.started = false;
            self.setStatus('qrUnavailable');
            return;
          }
          self.qrCode = j.id;
          self.qrEvery = j.interval * 1000;
          $('lgQrImg').src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(j.qr);
          $('lgCode').textContent = j.code;
          self.setStatus('waitingPhone');
          self.schedulePoll(gen);
        },
        20000
      );
    xhrJson('https://link.stremio.com/api/create', function (j) {
      if (self.pollGen !== gen) return;
      if (!j || !j.code) {
        self.started = false;
        self.setStatus('qrUnavailable');
        self.explainNoConnection(gen);
        return;
      }
      self.qrCode = j.code;
      $('lgQrImg').src = j.qrcode;
      $('lgCode').textContent = j.code;
      self.setStatus('waitingPhone');
      self.schedulePoll(gen);
    });
  },
  /* the QR code or sign-in got no answer: when Stremio is unreachable, say so and how to fix it */
  explainNoConnection: function (gen) {
    var self = this;
    checkConnection(function (code) {
      if (!code || gen !== self.pollGen || SCR !== 'login') return;
      self.setStatus('noConnectionShort');
      $('lgErr').textContent = tx('noConnection', code);
    });
  },
  schedulePoll: function (gen) {
    var self = this;
    if (this.suspended || !this.qrCode || this.poll || this.polling || gen !== this.pollGen) return;
    this.poll = setTimeout(
      function () {
        self.poll = null;
        self.pollOnce(gen);
      },
      this.provider === 'nuvio' ? this.qrEvery || 3000 : 2500
    );
  },
  pollOnce: function (gen) {
    if (this.suspended || this.polling || gen !== this.pollGen || !this.qrCode) return;
    this.polling = true;
    var self = this;
    if (this.provider === 'nuvio')
      return xhrJson(
        '/nuvioqrpoll?id=' + encodeURIComponent(this.qrCode),
        function (r) {
          if (gen !== self.pollGen) return;
          self.polling = false;
          if (r && r.result && r.result.authKey) {
            lsSet('user', r.result.user);
            return self.finish(r.result.authKey);
          }
          /* a code that ran out is replaced by a new one */
          if (r && (r.status === 'expired' || r.status === 'used' || r.status === 'cancelled')) {
            self.stopQr();
            return self.startQr();
          }
          self.schedulePoll(gen);
        },
        20000
      );
    xhrJson(
      'https://link.stremio.com/api/read?code=' + encodeURIComponent(this.qrCode),
      function (r) {
        if (gen !== self.pollGen) return;
        self.polling = false;
        var ak = r && r.result && (r.result.authKey || r.result.auth_key);
        if (ak) {
          self.finish(ak);
          return;
        }
        self.schedulePoll(gen);
      },
      10000
    );
  },
  suspendQr: function () {
    this.suspended = true;
    if (this.poll) {
      clearTimeout(this.poll);
      this.poll = null;
    }
  },
  resumeQr: function () {
    this.suspended = false;
    if (this.qrCode) this.schedulePoll(this.pollGen);
    else this.startQr();
  },
  stopQr: function () {
    if (this.poll) {
      clearTimeout(this.poll);
      this.poll = null;
    }
    this.polling = false;
    this.started = false;
    this.qrCode = '';
    this.pollGen++;
  },
  /* the QR code and the form follow the account chosen */
  setProvider: function (provider) {
    if (provider === this.provider) return;
    this.provider = provider;
    this.stopQr();
    $('lgQrImg').removeAttribute('src');
    $('lgCode').textContent = '';
    this.setStatus('generatingCode');
    this.startQr();
    $('lgErr').textContent = '';
    this.paint();
  },
  doEmail: function () {
    var email = $('lgEmail'),
      pass = $('lgPass');
    if (!email || !pass) {
      $('lgErr').textContent = tx('usePhoneCode');
      return;
    }
    var em = email.value,
      pw = pass.value;
    if (!em || !pw) {
      $('lgErr').textContent = tx('enterCredentials');
      return;
    }
    $('lgErr').textContent = '';
    toast(tx('signingIn'));
    var self = this;
    var body = { email: em, password: pw };
    if (this.provider === 'nuvio') body.provider = 'nuvio';
    postJson(API + '/api/login', body, function (r) {
      var res = r && r.result;
      if (!res || !res.authKey) {
        $('lgErr').textContent = (r && r.error && r.error.message) || tx('signInFailed');
        if (!r) self.explainNoConnection(self.pollGen);
        return;
      }
      if (res.user) lsSet('user', res.user);
      self.finish(res.authKey);
    });
  },
  finish: function (ak) {
    this.stopQr();
    lsSet('authKey', ak);
    this.setStatus('accountConnected');
    /* a Nuvio account first asks whose profile this is */
    if (isNuvioAccount()) return profilePanel.show(ak, reloadWithProfile);
    postJson(API + '/api/getUser', { authKey: ak }, function (j) {
      if (j && j.result) lsSet('user', j.result);
      syncAddons(function () {
        location.reload();
      });
      setTimeout(function () {
        location.reload();
      }, 4000);
    });
  },
  paint: function () {
    var email = $('lgEmail'),
      pass = $('lgPass'),
      button = $('lgBtn'),
      lang = $('lgLang');
    if (lang) lang.className = this.zone === 'lang' ? 'f' : '';
    var prov = $('lgProv');
    if (prov) {
      prov.className = this.zone === 'prov' ? 'f' : '';
      prov.innerHTML =
        '<span class="' +
        (this.provider === 'stremio' ? 'on' : '') +
        '">Stremio</span><span class="' +
        (this.provider === 'nuvio' ? 'on' : '') +
        '">' +
        esc(tx('providerNuvio')) +
        '</span>';
    }
    if (email) email.className = 'lgin' + (this.zone === 'email' ? ' f' : '');
    if (pass) pass.className = 'lgin' + (this.zone === 'pass' ? ' f' : '');
    if (button) button.className = this.zone === 'btn' ? 'f' : '';
  },
  key: function (k) {
    if (this.zone === 'lang') {
      if (k === 13) this.chooseLanguage();
      else if (k === 40) {
        this.zone = 'prov';
        this.paint();
      }
      return true;
    }
    if (this.zone === 'prov') {
      if (k === 37) this.setProvider('stremio');
      else if (k === 39) this.setProvider('nuvio');
      else if (k === 13) this.setProvider(this.provider === 'nuvio' ? 'stremio' : 'nuvio');
      else if (k === 40 || k === 38) {
        this.zone = k === 40 ? 'email' : 'lang';
        this.paint();
      }
      return true;
    }
    if (k === 40) {
      this.zone = this.zone === 'email' ? 'pass' : this.zone === 'pass' ? 'btn' : 'btn';
      this.paint();
    } else if (k === 38) {
      this.zone = this.zone === 'btn' ? 'pass' : this.zone === 'pass' ? 'email' : 'prov';
      this.paint();
    } else if (k === 13) {
      if (this.zone === 'email') {
        var email = $('lgEmail');
        if (email && email.focus) email.focus();
      } else if (this.zone === 'pass') {
        var pass = $('lgPass');
        if (pass && pass.focus) pass.focus();
      } else this.doEmail();
    }
    return true;
  }
};
// Idle tracking and LG Magic Remote pointer navigation.
/* ================= keys / back / idle ================= */
var lastIn = Date.now();
function idleTouch() {
  lastIn = Date.now();
  if (bodyHas('idle') || bodyHas('trailer')) {
    bodyRemove('idle');
    bodyRemove('trailer');
    stopIdleTrailer();
  }
}
function pointerIndex(target, list) {
  for (var n = target; n && n !== document.body; n = n.parentNode) {
    for (var i = 0; i < list.length; i++) if (list[i] === n) return i;
  }
  return -1;
}
function pointerBoard(target, board, activate) {
  if (!board) return false;
  for (var r = 0; r < board.rows.length; r++) {
    var row = board.rows[r],
      i = pointerIndex(target, row.cardEls || []);
    if (i < 0) continue;
    board.rowIdx = r;
    board.top = false;
    row.col = i;
    topNav.active = false;
    board.paint();
    board.hero();
    if (activate && row.items[i]) openItem(row.items[i]);
    return true;
  }
  return false;
}
function pointerUI(target, activate) {
  var i, r, row, def;
  if (serverPanel.open) {
    i = pointerIndex(target, serverPanel.els);
    if (i >= 0) {
      serverPanel.idx = i;
      serverPanel.paint();
      if (activate) serverPanel.press(i);
    }
    return true;
  }
  if (languagePanel.open) {
    i = pointerIndex(target, languagePanel.els);
    if (i >= 0) {
      languagePanel.idx = i;
      setF(languagePanel.els, i);
      if (activate) languagePanel.choose(i);
    }
    return true;
  }
  if (profilePanel.open) {
    i = profilePanel.mode === 'pick' ? pointerIndex(target, profilePanel.els) : -1;
    if (i >= 0) {
      profilePanel.zone = 'row';
      profilePanel.idx = i;
      profilePanel.paint();
      if (activate) profilePanel.choose(i);
    }
    return true;
  }
  if (setupPanel.open) {
    i = pointerIndex(target, setupPanel.els);
    if (i >= 0) {
      setupPanel.idx = i;
      setF(setupPanel.els, i);
      if (activate) setupPanel.choose(i);
    }
    return true;
  }
  if (episodeJump.open) {
    i = pointerIndex(target, episodeJump.els);
    if (i >= 0) {
      episodeJump.idx = i;
      episodeJump.paint();
      if (activate) episodeJump.press(i);
    }
    return true;
  }
  if (cwMenu.open) {
    i = pointerIndex(target, cwMenu.els);
    if (i < 0) return false;
    cwMenu.idx = i;
    cwMenu.paint();
    if (activate && cwMenu.acts[i]) cwMenu.acts[i]();
    return true;
  }
  if (streamsUI.open) {
    if (pointerIndex(target, [$('stBest')]) === 0) {
      streamsUI.zone = 'best';
      streamsUI.paint();
      if (activate) streamsUI.chooseBest();
      return true;
    }
    if (target && target.id === 'stLang') {
      streamsUI.zone = 'lang';
      streamsUI.paint();
      if (activate) streamsUI.nextLang();
      return true;
    }
    i = pointerIndex(target, streamsUI.chipEls);
    if (i >= 0) {
      streamsUI.zone = 'chips';
      streamsUI.chipIdx = i;
      streamsUI.paint();
      if (activate) {
        streamsUI.filter = streamsUI.chips[i];
        streamsUI.refilter();
      }
      return true;
    }
    i = pointerIndex(target, streamsUI.els);
    if (i < 0) return false;
    streamsUI.zone = 'list';
    streamsUI.idx = i;
    streamsUI.moved = true;
    streamsUI.paint();
    if (activate) streamsUI.choose();
    return true;
  }
  i = pointerIndex(target, chips);
  if (i >= 0) {
    if (activate) topNav.chooseSection(i);
    else {
      topNav.idx = i;
      topNav.active = true;
      topNav.paint();
    }
    return true;
  }
  if (SCR === 'login') {
    if (target === $('lgBtn') || target.parentNode === $('lgBtn')) {
      login.zone = 'btn';
      login.paint();
      if (activate) login.doEmail();
      return true;
    }
    return false;
  }
  if (BOARD_SCR[SCR] && pointerBoard(target, curBoard(), activate)) return true;
  if (SCR === 'disc') {
    i = pointerIndex(target, disc.optionEls);
    if (i >= 0) {
      disc.zone = 'filters';
      disc.optionIdx = i;
      disc.paint();
      if (activate) disc.selectFilter();
      return true;
    }
    i = pointerIndex(target, disc.filterEls);
    if (i >= 0) {
      disc.zone = 'filters';
      disc.filterIdx = i;
      disc.paint();
      if (activate) {
        if (disc.filterOpen) disc.closeFilter();
        else disc.openFilter();
      }
      return true;
    }
    i = pointerIndex(target, disc.els);
    if (i >= 0) {
      disc.zone = 'grid';
      disc.idx = i;
      disc.paint();
      if (activate && disc.items[i]) openItem(disc.items[i]);
      return true;
    }
  }
  if (SCR === 'sim') {
    i = pointerIndex(target, similar.els);
    if (i >= 0) {
      similar.idx = i;
      similar.paint();
      if (activate && similar.items[i])
        goScr('detail', { type: similar.items[i].type, id: similar.items[i].id, vid: null });
      return true;
    }
  }
  if (SCR === 'detail') {
    i = pointerIndex(target, detail.btnEls);
    if (i >= 0) {
      detail.zone = 'btns';
      detail.btnIdx = i;
      detail.paint();
      if (activate && detail.btnActs[i]) detail.btnActs[i]();
      return true;
    }
    i = pointerIndex(target, detail.seasonEls);
    if (i >= 0) {
      detail.zone = 'seasons';
      detail.seasonControlIdx = i;
      detail.paint();
      if (activate && detail.seasonActs[i]) {
        detail.seasonActs[i]();
        detail.paint();
      }
      return true;
    }
    i = pointerIndex(target, detail.epEls);
    if (i >= 0) {
      detail.zone = 'eps';
      detail.epIdx = i;
      detail.paint();
      if (activate && detail.eps[i]) detail.openStreams(detail.eps[i].id);
      return true;
    }
  }
  if (SCR === 'search') {
    i = pointerIndex(target, search.keyEls);
    if (i >= 0) {
      topNav.active = false;
      search.zone = 'keys';
      search.keyIdx = i;
      if (activate) search.press(SEARCH_KEYS[i]);
      search.paint();
      return true;
    }
    i = pointerIndex(target, search.recentEls);
    if (i >= 0) {
      topNav.active = false;
      search.zone = 'recent';
      search.recentIdx = i;
      search.paint();
      if (activate) search.runRecent(i);
      return true;
    }
    for (r = 0; r < search.rows.length; r++) {
      row = search.rows[r];
      i = pointerIndex(target, row.cardEls || []);
      if (i >= 0) {
        search.zone = 'rows';
        search.rowIdx = r;
        row.col = i;
        search.paint();
        if (activate && row.items[i]) openItem(row.items[i]);
        return true;
      }
    }
  }
  if (SCR === 'addons') {
    i = pointerIndex(target, addonPanel.els);
    if (i >= 0) {
      topNav.active = false;
      addonPanel.idx = i;
      addonPanel.paint();
      if (activate && i === 0) addonPanel.syncNow();
      return true;
    }
  }
  if (SCR === 'set' && !settings.editing) {
    i = pointerIndex(target, settings.catEls);
    if (i >= 0) {
      if (i !== settings.catIdx) {
        settings.catIdx = i;
        settings.showCat();
      }
      settings.zone = 'cats';
      settings.paint();
      return true;
    }
  }
  if (SCR === 'set') {
    i = pointerIndex(target, settings.els);
    if (i >= 0) {
      if (!settings.editing || settings.idx === i) {
        settings.idx = i;
        settings.zone = 'items';
        settings.paint();
      }
      if (activate) {
        def = settings.fdefs[i];
        if (!settings.editing) settings.activate();
        else if (settings.idx === i) {
          if (!settings.cycle(def, 1)) settings.paintValue(i);
          settings.paint();
        }
      }
      return true;
    }
  }
  return false;
}
var pointerHoverTimer = null,
  pointerHoverTarget = null;
function queuePointerHover(target) {
  pointerHoverTarget = target;
  if (pointerHoverTimer) clearTimeout(pointerHoverTimer);
  pointerHoverTimer = setTimeout(function () {
    var next = pointerHoverTarget;
    pointerHoverTimer = null;
    pointerHoverTarget = null;
    if (next) pointerUI(next, false);
  }, 140);
}
on(
  document,
  'mouseover',
  function (e) {
    queuePointerHover(e.target);
  },
  false
);
on(
  document,
  'click',
  function (e) {
    if (pointerHoverTimer) {
      clearTimeout(pointerHoverTimer);
      pointerHoverTimer = null;
    }
    pointerHoverTarget = null;
    idleTouch();
    if (pointerUI(e.target, true)) {
      e.preventDefault();
      e.stopPropagation();
    }
  },
  false
);
/* idle trailer: after 10s the UI melts away; the focused title's trailer plays
   muted (no subs) behind the artwork, and once it's actually rolling the whole
   foreground fades to 0. 360p to stay easy on RAM; any key kills it instantly. */
// Muted background trailer shown after the remote has been idle.
var bgv = null;
function stopIdleTrailer() {
  if (!bgv) return;
  var el = bgv;
  bgv = null;
  try {
    el.pause();
    el.removeAttribute('src');
    el.load();
  } catch (e) {}
  if (el.parentNode) el.parentNode.removeChild(el);
}
function idleMeta(cb) {
  if (SCR === 'detail' && detail.meta) {
    cb(detail.meta);
    return;
  }
  if (SCR === 'disc') {
    var dit = disc.focusedItem();
    if (dit) {
      getMeta(dit.type, dit.id, cb);
      return;
    }
  }
  var b = curBoard();
  if (b) {
    var it = b.focusedItem();
    if (it) {
      getMeta(it.type, it.id, cb);
      return;
    }
  }
  cb(null);
}
function startIdleTrailer() {
  if (bgv) return;
  if (!HAS_MEDIA_TOOLS || lsRaw('bgTrailer', 'false') !== 'true' || uiLook() === 'light')
    return; /* Off by default on the low-memory 2019 TV */
  idleMeta(function (m) {
    if (!m) return;
    var t = trailerIdOf(m);
    if (!t) return;
    xhrJson(
      '/yt?v=' + encodeURIComponent(t) + '&lq=1',
      function (j) {
        if (!j || !j.url || !bodyHas('idle') || bgv) return;
        var el = document.createElement('video');
        el.id = 'bgv';
        el.autoplay = true;
        /* Keep previews unobtrusive and cheap; the user can still open a full trailer. */
        el.muted = true;
        el.volume = 0;
        /* once playing, fade the foreground fully away (adds the .trailer class) */
        on(el, 'playing', function () {
          if (bgv === el) {
            el.className = 'on';
            if (bodyHas('idle')) bodyAdd('trailer');
          }
        });
        on(el, 'ended', function () {
          if (bgv === el) stopIdleTrailer();
        });
        on(el, 'error', function () {
          if (bgv === el) stopIdleTrailer();
        });
        el.src = j.url;
        var shade = $('bgshade');
        shade.parentNode.insertBefore(el, shade);
        bgv = el;
      },
      14000
    );
  });
}
setInterval(function () {
  var browsing = SCR === 'home' || SCR === 'detail' || SCR === 'disc' || SCR === 'lib';
  var idle =
    Date.now() - lastIn > 12000 &&
    browsing &&
    !streamsUI.open &&
    !cwMenu.open &&
    document.activeElement !== $('sBox') &&
    $('boot').style.display === 'none';
  var has = bodyHas('idle');
  if (idle && !has) {
    bodyAdd('idle');
    startIdleTrailer();
  } else if (!idle && has) {
    bodyRemove('idle');
    bodyRemove('trailer');
    stopIdleTrailer();
  }
}, 1000);
/* the item under the cursor on whatever screen is showing (null if none) */
// The featured titles at the top of Home, as on the big streaming apps: Home opens on them, a
// large hero with the title, its genres, the synopsis, a "See details" button and dots saying
// which one is shown. They are the first titles of Home's first catalog; one passes every 8 s
// while the remote is left alone, Left and Right change it, OK opens it, Down goes to the rows.
// Nothing new is drawn: the hero and the background are the ones the rows already use, and the
// rows only slide down. Off in the light look; on the TVs the profile treats as small the
// titles change only by hand.
var FEATURED_EVERY_MS = 8000,
  FEATURED_MAX = 8,
  featured = { items: null, gen: -1, at: 0, shownAt: 0 };
function featuredItems() {
  if (featured.gen === home._loadGen && featured.items) return featured.items;
  /* the first catalog that has titles, in Home's order: Continue watching and My list are not
     featured, and a catalog still loading is waited for until Home is filled (board-loaders.js) */
  var found = [];
  for (var r = 0; r < home.rows.length && !found.length; r++) {
    var row = home.rows[r];
    if (!row.catalog || row.wide) continue;
    if (!row.answered) {
      if (!homeFilled) break;
      continue;
    }
    var titles = row.items.filter(function (it) {
      return it.id && !it.more;
    });
    if (titles.length > 2) found = titles.slice(0, FEATURED_MAX);
  }
  /* kept once found, so the titles do not change under the viewer when more rows arrive */
  if (found.length) {
    featured.items = found;
    featured.gen = home._loadGen;
    if (featured.at >= found.length) featured.at = 0;
  }
  return found;
}
/* whether the focus is on the featured titles: Home's top, outside the light look, with titles */
function featuredShown() {
  return home.top && SCR === 'home' && uiLook() !== 'light' && featuredItems().length > 2;
}
function featuredItem() {
  return featuredItems()[featured.at] || null;
}
function paintFeatured() {
  var on = featuredShown();
  if (on) bodyAdd('featured');
  else bodyRemove('featured');
  var host = $('heroDots');
  host.innerHTML = '';
  if (!on) return;
  $('heroBtn').textContent = tx('seeDetails');
  var items = featuredItems();
  for (var i = 0; i < items.length; i++) {
    var dot = document.createElement('span');
    if (i === featured.at) dot.className = 'on';
    host.appendChild(dot);
  }
}
/* the hero shows the featured title, and the ones on each side are fetched meanwhile, so Left,
   Right and the next one by itself find their picture ready (the local server keeps them) */
function warmFeatured(it) {
  if (!it) return;
  prewarm(bgMid(it, true));
  if (isImdb(it.id)) prewarm('https://images.metahub.space/logo/medium/' + it.id + '/img');
}
function showFeatured() {
  featured.shownAt = Date.now();
  paintFeatured();
  home.heroApply(featuredItem());
  var items = featuredItems(),
    n = items.length;
  warmFeatured(items[(featured.at + 1) % n]);
  warmFeatured(items[(featured.at + n - 1) % n]);
}
function moveFeatured(dir) {
  var n = featuredItems().length;
  featured.at = (featured.at + dir + n) % n;
  showFeatured();
}
/* keys while the focus is on the featured titles */
function featuredKey(k) {
  if (k === 39) moveFeatured(1);
  else if (k === 37) {
    if (featured.at === 0) topNav.focus();
    else moveFeatured(-1);
  } else if (k === 40) {
    home.top = false;
    home.paint();
    home.hero();
  } else if (k === 13) {
    var it = featuredItem();
    if (it) openItem(it);
  }
  return true;
}
setInterval(function () {
  if (
    !featuredShown() ||
    topNav.active ||
    bgv ||
    TV_PROFILE.lowMemory ||
    streamsUI.open ||
    cwMenu.open ||
    Date.now() - Math.max(lastIn, featured.shownAt) < FEATURED_EVERY_MS
  )
    return;
  moveFeatured(1);
}, 1000);
on($('heroBtn'), 'click', function () {
  if (featuredShown()) featuredKey(13);
});
// Remote key dispatch, long-press OK and the Back button.
function currentFocusedItem() {
  if (topNav.active) return null;
  var b = curBoard();
  if (b) return b.focusedItem();
  if (SCR === 'disc' && disc.zone === 'grid' && !disc.filterOpen) return disc.focusedItem();
  if (SCR === 'sim') return similar.items[similar.idx] || null;
  if (SCR === 'search' && search.zone === 'rows') {
    var row = search.rows[search.rowIdx];
    return row ? row.items[row.col] || null : null;
  }
  return null;
}
/* long-press OK on ANY card opens the side menu; a short tap does its normal action.
   webOS repeats keydown while held, so we act on keyup (short) or after 2 repeats (menu). */
var okHold = { down: false, rep: 0, menu: false, item: null },
  menuGuard = false;
window.__SC_PHASE__('M3');
on(
  document,
  'keydown',
  function (e) {
    var k = e.keyCode;
    idleTouch();
    noteKey();
    var a = document.activeElement;
    if (a === $('sBox') || a === $('lgEmail') || a === $('lgPass') || a === $('pfEdName'))
      return; /* typing: inputs manage themselves */
    if (serverPanel.open) {
      e.preventDefault();
      e.stopPropagation();
      if (isBackKey(k)) serverPanel.close();
      else serverPanel.key(k);
      return;
    }
    if (languagePanel.open) {
      e.preventDefault();
      e.stopPropagation();
      if (isBackKey(k)) languagePanel.close();
      else languagePanel.key(k);
      return;
    }
    if (profilePanel.open) {
      e.preventDefault();
      e.stopPropagation();
      if (isBackKey(k)) profilePanel.back();
      else profilePanel.key(k);
      return;
    }
    if (setupPanel.open) {
      e.preventDefault();
      e.stopPropagation();
      if (isBackKey(k)) setupPanel.close();
      else setupPanel.key(k);
      return;
    }
    if (episodeJump.open) {
      e.preventDefault();
      e.stopPropagation();
      if (isBackKey(k)) episodeJump.close();
      else episodeJump.key(k);
      return;
    }
    if (isBackKey(k)) {
      e.preventDefault();
      e.stopPropagation();
      if (SCR === 'disc' && disc.closeFilter()) return;
      history.back();
      return;
    }
    if (k !== 37 && k !== 38 && k !== 39 && k !== 40 && k !== 13) return;
    e.preventDefault();
    /* while the OK that OPENED the menu is still held, swallow its repeats so it can't
     instantly fire the first menu item; released OK (keyup) clears the guard */
    if (cwMenu.open) {
      if (k === 13 && menuGuard) return;
      cwMenu.key(k);
      return;
    }
    if (streamsUI.open) {
      streamsUI.key(k);
      return;
    }
    if (topNav.active) {
      topNav.key(k);
      return;
    }
    if (k === 13) {
      var fi = currentFocusedItem();
      /* See all and Collections folders open at once: they have no title menu */
      if (fi && !fi.more && !fi.folder) {
        if (!okHold.down) {
          okHold.down = true;
          okHold.rep = 0;
          okHold.menu = false;
          okHold.item = fi;
        } else {
          okHold.rep++;
          if (okHold.rep >= 2 && !okHold.menu) {
            okHold.menu = true;
            menuGuard = true;
            cwMenu.show(okHold.item);
          }
        }
        return;
      }
    }
    if (SCR === 'home') home.key(k);
    else if (SCR === 'detail') detail.key(k);
    else if (SCR === 'disc') disc.key(k);
    else if (SCR === 'search') search.key(k);
    else if (SCR === 'lib') lib.key(k);
    else if (SCR === 'fold') fold.key(k);
    else if (SCR === 'addons') addonPanel.key(k);
    else if (SCR === 'set') settings.key(k);
    else if (SCR === 'login') login.key(k);
    else if (SCR === 'sim') similar.key(k);
  },
  true
);
on(
  document,
  'keyup',
  function (e) {
    if (e.keyCode !== 13) return;
    menuGuard = false;
    var h = okHold;
    okHold = { down: false, rep: 0, menu: false, item: null };
    if (h.down && !h.menu && h.item) {
      /* short press = the card's normal action */
      if (SCR === 'sim') goScr('detail', { type: h.item.type, id: h.item.id, vid: null });
      else openItem(h.item);
    }
  },
  true
);
try {
  history.pushState({ tv: 1 }, '');
} catch (e) {}
on(window, 'popstate', function () {
  try {
    history.pushState({ tv: 1 }, '');
  } catch (e) {}
  goBackScr();
});

window.__SC_PHASE__('M4');
// App visibility changes (Quick Start+ resume).
/* QuickStart+ can leave the webview alive while webOS stops its local service.
   Verify and recover the service only when the app becomes visible again. */
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
  on(
    document,
    event,
    function () {
      if (document[prop]) {
        hiddenAt = Date.now();
        try {
          stopIdleTrailer();
        } catch (e) {}
        if (SCR === 'login') login.suspendQr();
        clientDiag('app_hidden', {});
      } else if (hiddenAt) {
        clientDiag('app_visible', { awaySec: Math.max(0, ((Date.now() - hiddenAt) / 1000) | 0) });
        hiddenAt = 0;
        if (SCR === 'login') login.resumeQr();
        setTimeout(runtimeRecover, 120);
      }
    },
    true
  );
})();
// Startup: choose login or Home, restore deep links and start the silent syncs.
/* ================= boot ================= */
var HOME_WAIT_MS = 7000;
function boot() {
  try {
    window.__SC_PHASE__('B0');
    if (TV_PROFILE.lowMemory) bodyAdd('lowmem');
    applyLook();
    applyTextSize();
    /* 4.0 keeps accounts differently: every TV signs in again once, on its first start of this
       version, and never again after it */
    if (!lsRaw('signedInFor40', '')) {
      lsRawSet('signedInFor40', '1');
      if (user() || authKey()) return settings.logout();
    }
    if (!user()) {
      window.__SC_PHASE__('L0');
      showScr('login');
      login.enter();
      window.__SC_BOOT_DONE__ = true;
      window.__SC_PHASE__('READY');
      $('boot').style.display = 'none';
      return;
    }
    /* a Nuvio account says who is watching before Home is built */
    if (isNuvioAccount()) startProfiles(startHome);
    else startHome();
  } catch (error) {
    window.__SC_BOOT_ERROR__((error && error.message) || String(error), 'BOOT');
  }
}
/* A profile seen for the first time on this TV has no library here yet: Home waits for it (as
   long as Home waits for its rows), so Continue Watching and My list are there when it appears
   instead of after. */
function startHome() {
  if (allLib().length) return showHome(false);
  var started = false;
  function go() {
    if (started) return;
    started = true;
    showHome(true);
  }
  pullLib(go);
  setTimeout(go, HOME_WAIT_MS);
}
function showHome(libraryPulled) {
  try {
    var h = location.hash || '';
    var m = h.match(/^#detail\/([^\/]+)\/([^\/]+)(?:\/(.+))?$/);
    var ms = h.match(/^#sim\/([^\/]+)\/([^\/]+)$/);
    /* the player leaves a flag when it hands back to the interface */
    var fromPlayer = false;
    try {
      fromPlayer = sessionStorage.getItem('tvBack') === '1';
      sessionStorage.removeItem('tvBack');
    } catch (e) {}
    showScr('home');
    home.enter();
    if (m) {
      goScr('detail', {
        type: m[1],
        id: m[2],
        vid: m[3] ? decodeURIComponent(m[3]) : null,
        restored: fromPlayer
      });
    } else if (ms) {
      goScr('sim', { type: ms[1], id: ms[2] });
    }
    try {
      history.replaceState(history.state, '', appUrl('/beta'));
    } catch (e) {}
    var revealed = false;
    var reveal = function () {
      if (revealed) return;
      revealed = true;
      window.__SC_BOOT_DONE__ = true;
      window.__SC_PHASE__('READY');
      $('boot').style.display = 'none';
      setupPanel.maybeShow();
      /* shown by Settings > Diagnostics: from opening this page to Home on screen */
      try {
        window.__SC_VISIBLE_MS__ = Date.now() - performance.timing.navigationStart;
      } catch (e) {}
    };
    /* Home appears once its first rows are in, and the artwork has had a moment; a title page
       opened from a link shows at once; slow addons never keep the opening screen past 7 s */
    if (m || ms) setTimeout(reveal, 120);
    else {
      var limit = setTimeout(reveal, HOME_WAIT_MS);
      onHomeFilled = function () {
        clearTimeout(limit);
        setTimeout(reveal, 350);
      };
      if (homeFilled) onHomeFilled();
    }
    /* silent account syncs: library (Continue Watching / watched) + addon collection */
    if (!libraryPulled)
      setTimeout(function () {
        pullLib(function () {
          invalidateBoards();
          if (SCR === 'home' || SCR === 'lib') refreshCurBoard();
        });
      }, 700);
    setTimeout(function () {
      syncAddons(function (changed) {
        syncCollections(function (collectionsChanged) {
          if (changed) toast(tx('addonsUpdated'));
          if (changed || collectionsChanged) buildHomeRows(true);
        });
      });
    }, 900);
    /* new episodes of followed series, at most once a day; shown on the next Home build */
    setTimeout(function () {
      checkNewEpisodes(function (changed) {
        if (changed) home.built = false;
      });
    }, 8000);
    /* the last start stopped before Home or login: say where, for a report */
    var lastPhase = window.__SC_LAST_PHASE__;
    if (lastPhase && lastPhase !== 'READY' && !window.__SC_BOOT_FAILED__)
      setTimeout(function () {
        toast(tx('lastStartStopped', lastPhase), 8000);
      }, 2500);
    /* what this version brought, once after updating; then a newer version, once per version */
    setTimeout(function () {
      xhrJson(
        '/update',
        function (answer) {
          var current = answer && answer.current,
            seen = lsRaw('versionSeen', ''),
            told = false;
          if (current && current !== seen) {
            lsRawSet('versionSeen', current);
            told = seen && SCR !== 'login' && !setupPanel.open;
            if (told) toast(tx('whatsNew', current), 9000);
          }
          var version = answer && answer.version;
          if (!version) return;
          /* the Update item in the side menu stays until it is installed */
          pendingUpdate = answer;
          bodyAdd('hasupdate');
          if (told || lsRaw('updateShown', '') === version || SCR === 'login') return;
          lsRawSet('updateShown', version);
          toast(tx('updateAvailable', version), 8000);
        },
        8000
      );
    }, 12000);
    /* the long-press menu has no visible entry point: explain it once, on Home */
    setTimeout(function () {
      if (lsRaw('holdOkHintShown', '') || SCR !== 'home' || streamsUI.open || cwMenu.open) return;
      lsRawSet('holdOkHintShown', '1');
      toast(tx('holdOkHint'), 6000);
    }, 4000);
  } catch (error) {
    window.__SC_BOOT_ERROR__((error && error.message) || String(error), 'BOOT');
  }
}
/* This script is the last parser-blocking element in body, so every UI node already
   exists. Boot synchronously: old webOS WebAppManager builds can miss a late
   DOMContentLoaded listener after navigating from the packaged bootstrap to localhost. */
window.__SC_PHASE__('B_CALL');
boot();
})();
}catch(error){window.__SC_BOOT_ERROR__(error&&error.message||String(error),'TOP');}
