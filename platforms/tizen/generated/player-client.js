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
// Player side of the Tizen platform: the TV's own player, behind what the player code expects
// of a <video> element. Unlike <video>, AVPlay plays MKV and lists the file's audio and
// subtitle tracks without FFmpeg.
function createVideo() {
  var A = window.webapis.avplay,
    listeners = {},
    src = '',
    opened = false,
    ready = false,
    paused = true,
    ended = false,
    error = null,
    buffering = false,
    wantPlay = true,
    durationMs = 0,
    positionMs = 0,
    startAtMs = -1,
    seeking = false,
    nextSeekMs = -1,
    audio = [],
    pendingAudio = -1,
    onText = null,
    hiddenAtMs = -1,
    video;
  function emit(name) {
    var list = (listeners[name] || []).slice();
    for (var i = 0; i < list.length; i++) {
      try {
        list[i].call(video);
      } catch (e) {}
    }
  }
  function close() {
    if (!opened) return;
    opened = false;
    ready = false;
    try {
      A.stop();
    } catch (e) {}
    try {
      A.close();
    } catch (e) {}
  }
  function trackInfo(type) {
    var out = [],
      all = [];
    try {
      all = A.getTotalTrackInfo() || [];
    } catch (e) {}
    for (var i = 0; i < all.length; i++) {
      if (all[i].type !== type) continue;
      var extra = {};
      try {
        extra = JSON.parse(all[i].extra_info);
      } catch (e) {}
      out.push({ index: all[i].index, language: extra.language || extra.track_lang || '' });
    }
    return out;
  }
  function selectedAudio() {
    try {
      var current = A.getCurrentStreamInfo() || [];
      for (var i = 0; i < current.length; i++) if (current[i].type === 'AUDIO') return current[i].index;
    } catch (e) {}
    return -1;
  }
  /* Tizen 3 does not change the audio track while paused: it waits for the next play. */
  function chooseAudio(index) {
    if (paused) {
      pendingAudio = index;
      return;
    }
    try {
      A.setSelectTrack('AUDIO', index);
    } catch (e) {}
  }
  function audioTrack(info, on) {
    var track = { label: '', language: info.language };
    Object.defineProperty(track, 'enabled', {
      get: function () {
        return on;
      },
      set: function (value) {
        var changed = value && !on;
        on = !!value;
        if (changed) chooseAudio(info.index);
      }
    });
    return track;
  }
  function readTracks() {
    var infos = trackInfo('AUDIO'),
      current = selectedAudio();
    audio = [];
    for (var i = 0; i < infos.length; i++)
      audio.push(audioTrack(infos[i], current >= 0 ? infos[i].index === current : i === 0));
  }
  function fail(code, message) {
    error = { code: code, message: String(message || '') };
    paused = true;
    emit('error');
  }
  function start() {
    if (!ready || !paused) return;
    try {
      A.play();
    } catch (e) {
      return fail(3, e && e.message);
    }
    paused = false;
    ended = false;
    if (pendingAudio >= 0) {
      chooseAudio(pendingAudio);
      pendingAudio = -1;
    }
    emit('play');
    if (!buffering) emit('playing');
  }
  function seekTo(ms) {
    if (seeking) {
      nextSeekMs = ms;
      return;
    }
    seeking = true;
    positionMs = ms;
    function done() {
      seeking = false;
      if (nextSeekMs >= 0) {
        var next = nextSeekMs;
        nextSeekMs = -1;
        return seekTo(next);
      }
      emit('seeked');
      emit('canplay');
      if (!paused && !buffering) emit('playing');
    }
    emit('seeking');
    try {
      A.seekTo(ms, done, done);
    } catch (e) {
      done();
    }
  }
  var player = {
    onbufferingstart: function () {
      buffering = true;
      emit('waiting');
    },
    onbufferingprogress: function () {},
    onbufferingcomplete: function () {
      buffering = false;
      emit('canplay');
      if (!paused) emit('playing');
    },
    oncurrentplaytime: function (ms) {
      if (seeking) return;
      positionMs = parseInt(ms, 10) || 0;
      emit('timeupdate');
    },
    onstreamcompleted: function () {
      close();
      ended = true;
      paused = true;
      emit('pause');
      emit('ended');
    },
    onerror: function (kind) {
      fail(4, kind);
    },
    onevent: function () {},
    onsubtitlechange: function (duration, text) {
      if (onText) onText(parseInt(duration, 10) || 3000, String(text || ''));
    }
  };
  function open() {
    close();
    ended = false;
    error = null;
    buffering = false;
    durationMs = 0;
    audio = [];
    if (!src) return;
    opened = true;
    try {
      A.open(src);
      A.setListener(player);
      A.setDisplayRect(0, 0, 1920, 1080);
      A.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
      A.prepareAsync(
        function () {
          ready = true;
          try {
            durationMs = A.getDuration() || 0;
          } catch (e) {}
          readTracks();
          if (startAtMs >= 0) {
            positionMs = startAtMs;
            try {
              A.seekTo(startAtMs);
            } catch (e) {}
            startAtMs = -1;
          }
          emit('loadedmetadata');
          emit('loadeddata');
          emit('canplay');
          /* after the events: a resume position set by them is in place before the first frame */
          setTimeout(function () {
            if (wantPlay) start();
          }, 0);
        },
        function (e) {
          fail(4, e && e.message);
        }
      );
    } catch (e) {
      fail(4, e && e.message);
    }
  }
  video = {
    addEventListener: function (name, fn) {
      (listeners[name] = listeners[name] || []).push(fn);
    },
    removeEventListener: function (name, fn) {
      var list = listeners[name] || [],
        at = list.indexOf(fn);
      if (at >= 0) list.splice(at, 1);
    },
    play: function () {
      wantPlay = true;
      if (ended) {
        positionMs = 0;
        open();
      } else start();
    },
    pause: function () {
      wantPlay = false;
      if (!ready || paused) {
        paused = true;
        return;
      }
      try {
        A.pause();
      } catch (e) {}
      paused = true;
      emit('pause');
    },
    load: function () {},
    removeAttribute: function (name) {
      if (name !== 'src') return;
      src = '';
      close();
    },
    /* the file's text tracks for the subtitle menu, once the player has read the file */
    textTrackList: function () {
      if (!ready) return null;
      var infos = trackInfo('TEXT'),
        out = [];
      for (var i = 0; i < infos.length; i++)
        out.push({
          n: infos[i].index,
          ti: infos[i].index,
          name: infos[i].language || 'Track ' + (i + 1)
        });
      return out;
    },
    /* n < 0 turns them off; each line then reaches cb(milliseconds, text) */
    selectTextTrack: function (n, cb) {
      onText = n >= 0 ? cb : null;
      try {
        A.setSilentSubtitle(n < 0);
      } catch (e) {}
      if (n < 0) return;
      try {
        A.setSelectTrack('TEXT', n);
      } catch (e) {}
    }
  };
  Object.defineProperties(video, {
    src: {
      get: function () {
        return src;
      },
      set: function (u) {
        src = String(u || '');
        wantPlay = true;
        paused = true;
        open();
      }
    },
    currentTime: {
      get: function () {
        return positionMs / 1000;
      },
      set: function (sec) {
        var ms = Math.max(0, Math.round(sec * 1000));
        if (!ready) {
          startAtMs = ms;
          positionMs = ms;
        } else seekTo(ms);
      }
    },
    duration: {
      get: function () {
        return durationMs ? durationMs / 1000 : NaN;
      }
    },
    paused: {
      get: function () {
        return paused;
      }
    },
    ended: {
      get: function () {
        return ended;
      }
    },
    error: {
      get: function () {
        return error;
      }
    },
    readyState: {
      get: function () {
        return !ready ? 0 : buffering ? 2 : 4;
      }
    },
    networkState: {
      get: function () {
        return src ? 2 : 0;
      }
    },
    audioTracks: {
      get: function () {
        return audio;
      }
    },
    textTracks: {
      get: function () {
        return [];
      }
    }
  });
  /* Hidden, the TV takes the decoder back: let it go, and return paused at the same place. */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (!opened) return;
      hiddenAtMs = positionMs;
      close();
    } else if (hiddenAtMs >= 0 && src && !opened) {
      startAtMs = hiddenAtMs;
      hiddenAtMs = -1;
      wantPlay = false;
      paused = true;
      open();
    }
  });
  /* without this the sound carries on over the next page */
  window.addEventListener('pagehide', close);
  window.addEventListener('beforeunload', close);
  return video;
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
    serverGroup: 'Streaming server',
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
    libraryButton: '+ Library',
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
    playingBest: 'Playing the best source: {0}',
    updateAvailable: 'StremCompat {0} is available. Update it in the Homebrew Channel.',
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
    languagePicker: 'Language: {0}  ‹ ›',
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
    torrentsUnavailable: 'The torrent engine is not available on this TV. Debrid and direct sources still work.',
    diagEngineReady: 'Ready, starts with the first torrent',
    diagRunning: 'running',
    diagStopped: 'stopped',
    diagInterface: 'Interface: {0} MB of JS · Home on screen in {1} s · catalogs in {2} s',
    diagPeak: 'Since start: local server peak {0} MB · lowest TV free memory {1} MB',
    diagRecent: 'Recent problems:',
    diagNoProblems: 'No problems recorded since start',
    evMediaError: 'Source would not play',
    evSlowStart: 'Source was slow to start, retried',
    evPrepareFailed: 'Source could not be prepared',
    evPlayRejected: 'Playback was refused',
    evAddonDown: 'Addon did not answer',
    reloadingApp: 'Reloading StremCompat…',
    sourceGroup: 'Sources',
    preferredQuality: 'Preferred quality',
    preferredLanguage: 'Preferred source language',
    anyLanguage: 'Any',
    langFilter: 'Language: {0}',
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
    accountNote: 'Sign in with your Stremio account. No account? Create one for free at stremio.com/register',
    unofficialNote: 'Unofficial client. Not affiliated with or endorsed by Stremio or LG.',
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
    serverGroup: 'Servidor de streaming',
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
    libraryButton: '+ Biblioteca',
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
    playingBest: 'Tocando a melhor fonte: {0}',
    updateAvailable: 'StremCompat {0} disponível. Atualize pelo Homebrew Channel.',
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
    languagePicker: 'Idioma: {0}  ‹ ›',
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
    torrentsUnavailable: 'O motor de torrents não está disponível nesta TV. Fontes debrid e diretas continuam funcionando.',
    diagEngineReady: 'Pronto, inicia com o primeiro torrent',
    diagRunning: 'ativo',
    diagStopped: 'parado',
    diagInterface: 'Interface: {0} MB de JS · Início na tela em {1} s · catálogos em {2} s',
    diagPeak: 'Desde o início: pico do servidor local {0} MB · menor memória livre da TV {1} MB',
    diagRecent: 'Problemas recentes:',
    diagNoProblems: 'Nenhum problema registrado desde o início',
    evMediaError: 'A fonte não reproduziu',
    evSlowStart: 'A fonte demorou a iniciar, tentou de novo',
    evPrepareFailed: 'A fonte não pôde ser preparada',
    evPlayRejected: 'A reprodução foi recusada',
    evAddonDown: 'O addon não respondeu',
    reloadingApp: 'Recarregando o StremCompat…',
    sourceGroup: 'Fontes',
    preferredQuality: 'Qualidade preferida',
    preferredLanguage: 'Idioma preferido das fontes',
    anyLanguage: 'Qualquer',
    langFilter: 'Idioma: {0}',
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
    accountNote: 'Entre com sua conta Stremio. Não tem conta? Crie grátis em stremio.com/register',
    unofficialNote: 'Cliente não oficial. Sem vínculo com o Stremio ou a LG.',
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
  }
};
/* in the language itself, whichever one the interface is in */
var UI_LANGUAGES = {
  'en-US': 'English',
  'pt-BR': 'Português (Brasil)',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  ru: 'Русский'
};
function normalizeUILanguage(value) {
  return Object.prototype.hasOwnProperty.call(UI_LANGUAGES, value) ? value : 'en-US';
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
      return localStorage.getItem(UI_LANG_KEY);
    } catch (e) {
      return null;
    }
  })()
);
loadUILanguage(UI_LANG);
/* the language of audio and subtitles until the viewer picks one */
function defaultMediaLanguage() {
  return { 'pt-BR': 'por', es: 'spa', fr: 'fre', de: 'ger', it: 'ita', ru: 'rus' }[UI_LANG] || 'eng';
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
function sourceItem(s, addonName) {
  var url = s.url,
    h = s.behaviorHints || {};
  if (!url && s.infoHash) url = 'http://127.0.0.1:11470/' + s.infoHash + '/' + (s.fileIdx || 0) + torrentTrackers(s);
  if (!url) return null;
  var item = {
    addon: addonName,
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
    name: s.name || '',
    title: s.title || '',
    filename: s.filename || '',
    bingeGroup: s.bingeGroup || '',
    quality: s.quality || '',
    compat: (s.compatLabels || []).join(','),
    notWebReady: !!s.notWebReady,
    headers: s.headers || null
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
// Player strings from the shared table, and the season/episode line.
/* The player strings in the current language, completed from English. */
function playerText() {
  var base = UI_TEXT['en-US'].player,
    cur = (UI_TEXT[UI_LANG] && UI_TEXT[UI_LANG].player) || {},
    out = {};
  for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = cur[k] || base[k];
  return out;
}
var P = playerText();
var SE =
  SEASON && EPISODE
    ? tx('season', SEASON) + ' · ' + tx('episode', EPISODE) + (EPTITLE ? '  ·  ' + EPTITLE : '')
    : '';
// Element references, XHR helper, loading artwork and the startup watchdog.
var v = createVideo(),
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
  setArt(document.getElementById('tlogo'), LOGO);
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
var IS_TORRENT = /:11470\/[0-9a-f]{40}\//i.test(URL);
/* a torrent can take over a minute to find its peers, and starting over would not help it */
var STARTUP_LIMIT_MS = IS_TORRENT ? 45000 : 18000;
function armStartupWatch() {
  if (startupWatch) clearTimeout(startupWatch);
  startupWatch = setTimeout(function () {
    if (!mediaUsable && !retryStartup('timeout') && ID && BACK.indexOf('beta#detail/') === 0)
      showSourceFailed();
  }, STARTUP_LIMIT_MS);
}
function mediaReady() {
  mediaUsable = true;
  startupResetting = false;
  hideSourceFailed();
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
/* Settings > Do not save history: nothing about this session is kept, here or in the account.
   An earlier position is still offered, because it was saved before. */
var NO_HISTORY = lsGet('noHistory', 'false') === 'true';
// POST helper + push the library item to the account (same datastorePut Stremio uses)
/* done (optional) runs once the request finished, failed or took longer than 2 s */
function xpost(u, body, done) {
  var called = false;
  function finish() {
    if (called) return;
    called = true;
    if (done) done();
  }
  setTimeout(finish, 2000);
  try {
    if (u.indexOf('https://api.strem.io/api/') === 0)
      u = '/stremioapi?path=' + encodeURIComponent(u.slice('https://api.strem.io'.length));
    var x = new XMLHttpRequest();
    x.open('POST', u, true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.onreadystatechange = function () {
      if (x.readyState === 4) finish();
    };
    x.send(JSON.stringify(body));
  } catch (e) {
    finish();
  }
}
function authKeyLS() {
  try {
    return JSON.parse(localStorage.getItem('authKey') || 'null');
  } catch (e) {
    return null;
  }
}
var lastPush = 0;
function pushLib(force, done) {
  var ak = authKeyLS(),
    it = readLib(),
    n = Date.now();
  if (NO_HISTORY || !ak || !it || !it._id || (!force && n - lastPush < 60000)) {
    if (done) done();
    return;
  }
  lastPush = n;
  xpost(
    'https://api.strem.io/api/datastorePut',
    { authKey: ak, collection: 'libraryItem', changes: [it] },
    done
  );
}
// remember exactly which stream we played so Continue Watching can resume it directly
try {
  if (ID && !NO_HISTORY) localStorage.setItem('tvstream_' + ID + '_' + (VID || ID), location.search);
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
  if (NO_HISTORY || !v.duration || !ID || sessionDone) return;
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
  var s = it.state,
    vid = VID || ID,
    pos = Math.round(v.currentTime * 1000);
  /* as stremio-core: time watched counts real playback of this video only (a seek is not
     watching), and starts again when another episode takes over the item */
  if (s.video_id !== vid) {
    s.video_id = vid;
    s.timeWatched = 0;
    s.flaggedWatched = 0;
    lastPos = -1;
  }
  var step = lastPos >= 0 ? pos - lastPos : 0;
  lastPos = pos;
  if (step > 0 && step <= 15000) {
    s.timeWatched = (s.timeWatched || 0) + step;
    s.overallTimeWatched = (s.overallTimeWatched || 0) + step;
  }
  s.timeOffset = pos;
  s.duration = Math.round(v.duration * 1000);
  s.lastWatched = now;
  if (s.timeWatched == null) s.timeWatched = 0;
  if (s.overallTimeWatched == null) s.overallTimeWatched = 0;
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
  /* Stremio apps list an item in Continue Watching only when it is in the library or
     temporary: a title removed from the library and watched again must become temporary */
  if (it.removed && !it.temp) it.temp = true;
  try {
    localStorage.setItem(LIBKEY, JSON.stringify(it));
  } catch (e) {}
  if (s.timeWatched > s.duration * WATCHED_THRESHOLD && !s.flaggedWatched) markWatchedLocal();
}
/* watched once 70 % was really played, as stremio-core (markWatchedLocal) */
var WATCHED_THRESHOLD = 0.7;
/* last saved position, to tell playback from seeks (saveProgress) */
var lastPos = -1,
  sessionDone = false;
/* playing again after the end resumes saving this video (finishSession) */
v.addEventListener('play', function () {
  sessionDone = false;
});
v.addEventListener('seeking', function () {
  lastPos = -1;
});
var didResume = false;
/* After an automatic resume, OK starts over for as long as the hint is on screen;
   any other toast replaces the hint and withdraws the offer. */
var RESTART_WINDOW = 8000,
  restartUntil = 0;
function restartOffered() {
  if (Date.now() >= restartUntil) return false;
  restartUntil = 0;
  try {
    v.currentTime = 0;
  } catch (e) {}
  showToast(P.fromStart);
  return true;
}
function tryResume() {
  if (didResume) return;
  didResume = true;
  var it = readLib();
  if (it && it.state && it.state.video_id === (VID || ID) && it.state.timeOffset > 5000) {
    var sec = it.state.timeOffset / 1000;
    if (!it.state.duration || sec < it.state.duration / 1000 - 30) {
      try {
        v.currentTime = sec;
        showToast(P.resuming + fmt(sec) + '  ·  ' + P.restartHint, RESTART_WINDOW);
        restartUntil = Date.now() + RESTART_WINDOW;
      } catch (e) {}
    }
  }
}
v.addEventListener('loadeddata', tryResume);
v.addEventListener('canplay', tryResume);
/* said once, unless the resume hint is using the same place */
var noHistoryShown = !NO_HISTORY;
v.addEventListener('playing', function () {
  if (noHistoryShown) return;
  noHistoryShown = true;
  if (Date.now() >= restartUntil) showToast(P.noHistoryOn);
});
setInterval(function () {
  if (!v.paused) {
    saveProgress();
    pushLib(false);
  }
}, 10000);
v.addEventListener('pause', function () {
  if (subHolding) return;
  saveProgress();
  pushLib(true);
});
/* once this episode is finished, Continue Watching offers the next one (account.js);
   kept for items saved by older versions, the account item now points at it itself */
function rememberUpNext() {
  if (!ID || !VID || !NEXTVID) return;
  try {
    localStorage.setItem('tvnext_' + ID + '_' + VID, NEXTVID);
  } catch (e) {}
}
/* Watched like the official apps once 70 % was really watched: the watched flag, one more
   time watched and, for an episode, its bit in state.watched so every Stremio app shows
   it; state.watchedEpisodes keeps the local mark until the field comes back. */
function markWatchedLocal() {
  var it = readLib();
  if (!it || !it.state) return;
  var s = it.state,
    wv = VID || ID;
  if (s.video_id !== wv || s.flaggedWatched) return;
  s.flaggedWatched = 1;
  s.timesWatched = (s.timesWatched || 0) + 1;
  if (!s.watchedEpisodes) s.watchedEpisodes = [];
  if (s.watchedEpisodes.indexOf(wv) < 0) s.watchedEpisodes.push(wv);
  it._mtime = new Date().toISOString();
  try {
    localStorage.setItem(LIBKEY, JSON.stringify(it));
  } catch (e) {}
  pushLib(true);
  if (TYPE !== 'series' || !VID) return;
  xhr(
    '/watchedset?id=' +
      encodeURIComponent(ID) +
      '&vid=' +
      encodeURIComponent(VID) +
      '&f=' +
      encodeURIComponent(s.watched || ''),
    function (j) {
      var cur = readLib();
      if (!j || !j.watched || !cur || !cur.state) return;
      cur.state.watched = j.watched;
      cur._mtime = new Date().toISOString();
      try {
        localStorage.setItem(LIBKEY, JSON.stringify(cur));
      } catch (e) {}
      pushLib(true);
    }
  );
}
/* Leaving after the credits started (90 %), as stremio-core: the position goes back to the
   start and a series moves on to its next episode, which Continue Watching then offers on
   every device. `toNext` (the Next button) moves on even before the credits. */
function finishSession(toNext) {
  if (NO_HISTORY || !v.duration) return;
  saveProgress();
  var it = readLib();
  if (!it || !it.state || it.state.video_id !== (VID || ID)) return;
  var s = it.state;
  if (!toNext && !watchFinished(s.timeOffset, s.duration)) return;
  rememberUpNext();
  s.timeOffset = 0;
  if (TYPE === 'series' && NEXTVID) {
    s.video_id = NEXTVID;
    s.timeOffset = 1;
    s.timeWatched = 0;
    s.flaggedWatched = 0;
    var pp = NEXTVID.split(':');
    if (pp.length >= 3) {
      s.season = parseInt(pp[pp.length - 2], 10) || 0;
      s.episode = parseInt(pp[pp.length - 1], 10) || 0;
    }
  }
  sessionDone = true;
  it._mtime = new Date().toISOString();
  try {
    localStorage.setItem(LIBKEY, JSON.stringify(it));
  } catch (e) {}
}
// binge: when the episode ends, count down to the next one (up-next.js)
v.addEventListener('ended', function () {
  finishSession(false);
  pushLib(true);
  var binge = lsGet('bingeWatch', 'true') !== 'false' && lsGet('enableNextVideo', 'true') !== 'false';
  if (binge && NEXTHREF && !npDismissed) startAutoNext();
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
  zho: 'chi'
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
/* what the next episode's source should match (matchingNextSource) */
function nextSourcePref() {
  return {
    at: Date.now(),
    addon: ADDON,
    quality: QUALITY,
    compat: COMPAT,
    text: SNAME,
    binge: BINGE,
    langs: subtitleLanguagesOnly({ name: SNAME }) ? [] : streamLanguages({ name: SNAME })
  };
}
function rememberNextSource() {
  if (!ID || !NEXTVID) return;
  try {
    localStorage.setItem('tvnextpref_' + ID + '_' + NEXTVID, JSON.stringify(nextSourcePref()));
  } catch (e) {}
}
function forgetNextSource() {
  try {
    localStorage.removeItem('tvnextpref_' + ID + '_' + NEXTVID);
  } catch (e) {}
}
var nextStarting = false;
function nextEp() {
  if (!NEXTHREF || nextStarting) return;
  nextStarting = true;
  try {
    finishSession(true);
    rememberNextSource();
    openNextDirect();
  } catch (e) {
    location.replace(appUrl(NEXTHREF));
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
/* The bar's length must not change while the time counts. The TV browsers do not apply
   fixed-width digits, so once per video the time box gets the width of its longest form
   (every digit replaced by the widest one), and the text sits at its right edge. */
var timeWidthFor = 0;
function lockTimeWidth() {
  if (!v.duration || timeWidthFor === v.duration) return;
  timeWidthFor = v.duration;
  var full = fmt(v.duration),
    widest = 0;
  timeEl.style.minWidth = '';
  for (var d = 0; d < 10; d++) {
    var t = full.replace(/\d/g, String(d));
    timeEl.innerHTML = t + ' / ' + t + '<span class=trem>-' + t + '</span>';
    widest = Math.max(widest, timeEl.offsetWidth);
  }
  if (widest) timeEl.style.minWidth = widest + 2 + 'px';
  else timeWidthFor = 0; // measured while hidden: try again next time
}
/* elapsed / total, then the time left */
function paintTime(at) {
  lockTimeWidth();
  timeEl.innerHTML =
    fmt(at) + ' / ' + fmt(v.duration) + '<span class=trem>-' + fmt(Math.max(0, v.duration - at)) + '</span>';
}
/* The bar is hidden most of the time; timeupdate only repaints it while it is visible. */
function paintProgress() {
  if (!v.duration || seekTarget >= 0) return;
  var pct = (v.currentTime / v.duration) * 100;
  fill.style.width = pct + '%';
  knob.style.left = pct + '%';
  paintTime(v.currentTime);
}
function showBar() {
  if (bar.className !== 'show') paintProgress();
  bar.className = 'show';
  if (hideT) clearTimeout(hideT);
  hideT = setTimeout(hideControls, mode === 'menu' ? 8000 : 5000);
}
/* After a few seconds without a key or the pointer, everything goes away and only the
   video stays: the bar, a focused button and the settings menu alike. The focus returns
   to the video, so the next key brings the controls back. */
function hideControls() {
  if (seekTarget >= 0 || playerBusy()) {
    showBar();
    return;
  }
  if (mode === 'menu') menu.className = '';
  mode = 'video';
  paintBtns();
  bar.className = '';
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
/* A source that will not play: offer the next one instead of a dead end. The interface
   reads tvretry_* on the title page and plays the next source in its list, skipping this one. */
var failShown = false;
function showSourceFailed() {
  if (failShown) return;
  failShown = true;
  document.getElementById('failT').textContent = P.sourceFailed;
  document.getElementById('failS').textContent = (ADDON ? ADDON + '  ·  ' : '') + (QUALITY || '');
  document.getElementById('failB').textContent = P.tryAnother;
  document.getElementById('failH').textContent = P.failHint;
  document.getElementById('fail').className = 'show';
}
/* the source answered after all, so the film is what stays on screen */
function hideSourceFailed() {
  if (!failShown) return;
  failShown = false;
  document.getElementById('fail').className = '';
}
function tryAnotherSource() {
  try {
    localStorage.setItem(
      'tvretry_' + ID + '_' + (VID || ID),
      JSON.stringify({ at: Date.now(), addon: ADDON, text: SNAME })
    );
  } catch (e) {}
  location.replace(appUrl('/' + (BACK || 'beta')));
}
/* The engine's link for a torrent ends after a long pause. The address on :11470 leads to a new
   one, so the film opens again where it was instead of offering another source. */
var reopenedAt = 0;
function reopenTorrent() {
  if (!mediaUsable || !IS_TORRENT || Date.now() - reopenedAt < 60000) return false;
  reopenedAt = Date.now();
  var at = v.currentTime;
  diag('media_reopen', { at: Math.round(at) });
  showToast(P.retrying);
  function back() {
    v.removeEventListener('loadedmetadata', back);
    v.currentTime = at;
    var playing = v.play();
    if (playing && playing.catch) playing.catch(function () {});
  }
  v.addEventListener('loadedmetadata', back);
  v.src = URL;
  v.load();
  return true;
}
v.addEventListener('error', function () {
  if (retryStartup('error') || reopenTorrent()) return;
  lname.textContent = P.playbackError;
  if (ID && BACK.indexOf('beta#detail/') === 0) showSourceFailed();
  diag('media_error', {
    code: v.error ? v.error.code : 0,
    ready: v.readyState,
    network: v.networkState,
    compat: COMPAT,
    addon: ADDON,
    quality: QUALITY
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
  dropSubHold();
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
function showToast(m, ms) {
  if (!toastEl) return;
  restartUntil = 0;
  toastEl.textContent = m;
  toastEl.style.opacity = '1';
  if (toastT) clearTimeout(toastT);
  toastT = setTimeout(function () {
    toastEl.style.opacity = '0';
  }, ms || 3200);
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
  startService(SERVICE_ID, cb);
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
            location.replace(appUrl('http://127.0.0.1:' + APP_PORT + '/' + (BACK || 'beta')));
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
/* Presses add up from the position at the FIRST press (seekBase), so 3 presses of 10 s
   read +30s even though the video kept playing meanwhile; the time that played until the
   jump happens is added back in commitSeek, so the jump is exactly the setting. Number
   keys and pointer clicks aim at an absolute time instead (seekAbs). */
var seekBase = -1,
  seekAbs = false;
function showSeekInd() {
  var d = Math.round(seekTarget - (seekAbs || seekBase < 0 ? v.currentTime : seekBase));
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
  paintTime(seekTarget);
}
function commitSeek() {
  if (seekTarget < 0) return;
  var tgt = seekTarget;
  if (!seekAbs && seekBase >= 0) tgt = Math.max(0, Math.min(v.duration, tgt + (v.currentTime - seekBase)));
  seekTarget = -1;
  seekBase = -1;
  seekAbs = false;
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
  if (seekTarget < 0) {
    seekBase = v.currentTime;
    seekAbs = false;
  }
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
/* jump to an absolute time (number keys), committed like the other seeks */
function seekTo(t) {
  if (!v.duration) return;
  if (seekTarget < 0) seekBase = v.currentTime;
  seekAbs = true;
  seek(t - (seekTarget >= 0 ? seekTarget : v.currentTime));
  seekAbs = true;
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
    v.pause();
  } catch (e) {}
  try {
    window.removeEventListener('popstate', onPop);
  } catch (e) {}
  // one clean dark cover (same bg as the Stremio splash) so there is no flash, then a flag so
  // the interface shows a single "Taking you back to the interface" loading splash.
  try {
    var cov = document.createElement('div');
    cov.id = 'gocov';
    document.body.appendChild(cov);
  } catch (e) {}
  try {
    sessionStorage.setItem('tvBack', '1');
  } catch (e) {}
  /* The progress has to reach the account before the page changes, or other devices never
     see this session: leave when the push answers, or after 0.9 s at the latest. */
  var left = false;
  function leave() {
    if (left) return;
    left = true;
    leavePlayer();
  }
  setTimeout(leave, 900);
  try {
    finishSession(false);
    saveProgress();
    pushLib(true, leave);
  } catch (e) {
    leave();
  }
}
function leavePlayer() {
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
  location.replace(appUrl('/' + (BACK || 'beta')));
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
function choiceRow(label, on, tail) {
  return '<div class="mi' + (on ? ' on' : '') + '">' + eh(selectedLabel(label, on)) + (tail || '') + '</div>';
}
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
        html += choiceRow(al, at.enabled);
        menuItems.push({ k: 'aud', idx: a, on: at.enabled });
      }
    } catch (e) {}
    if (!menuItems.length) html += '<div class=mi style="opacity:.5">' + P.none + '</div>';
  } else if (view === 'subsroot') {
    html += '<div class=mh>' + P.subtitles + ': ' + eh(subtitleName()) + '</div>';
    var f0 = curSub === 'off';
    html += choiceRow(P.off, f0);
    menuItems.push({ k: 'off', on: f0 });
    /* the row that leads to the current subtitle says so, before opening it */
    var inEmb = curSub.indexOf('emb:') === 0,
      inExt = curSub.indexOf('ext:') === 0;
    html += choiceRow(P.embedded, inEmb, ' \u203a');
    menuItems.push({ k: 'go', to: 'embedded', on: inEmb });
    html += choiceRow(P.external, inExt, ' \u203a');
    menuItems.push({ k: 'go', to: 'external', on: inExt });
    html += '<div class=mi>' + P.style + ' \u203a</div>';
    menuItems.push({ k: 'go', to: 'style' });
    if (inExt) {
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
      html +=
        '<div class=mi style="opacity:.6;white-space:normal;font-size:22px">' +
        eh(embTimeout ? P.tracksStillLoading : embErr) +
        '</div>';
      html += '<div class=mi>' + P.tryAgain + '</div>';
      menuItems.push({ k: 'embretry' });
    } else if (!embTracks.length) {
      html += '<div class=mi style="opacity:.5">' + P.noneInFile + '</div>';
    } else {
      for (var j = 0; j < embTracks.length; j++) {
        var et = embTracks[j];
        var fb = curSub === 'emb:' + et.n;
        html += choiceRow(et.name, fb);
        menuItems.push({ k: 'emb', idx: et.n, ti: et.ti, lang: et.lang, on: fb });
      }
    }
  } else if (view === 'external') {
    html += '<div class=mh>' + P.external + ' \u2014 ' + P.language + '</div>';
    if (!extSubs.length) html += '<div class=mi style="opacity:.5">' + P.none + '</div>';
    var seen = {},
      curLang = null;
    for (var i = 0; i < extSubs.length; i++) if (curSub === 'ext:' + extSubs[i].u) curLang = extSubs[i].lang;
    for (var i = 0; i < extSubs.length; i++) {
      var L = extSubs[i].lang;
      if (!seen[L]) {
        seen[L] = 1;
        html += choiceRow(extSubs[i].name, L === curLang, ' \u203a');
        menuItems.push({ k: 'lang', lang: L, on: L === curLang });
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
        var srcName = extSubs[i].src ? '  ·  ' + extSubs[i].src : '';
        html += choiceRow(nm + ' ' + c + srcName, fe);
        menuItems.push({ k: 'ext', u: extSubs[i].u, lang: extSubs[i].lang, src: extSubs[i].src, on: fe });
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
  /* the list opens on what is in use, not on its first row */
  mIdx = 0;
  for (var r = menuItems.length - 1; r >= 0; r--) if (menuItems[r].on) mIdx = r;
  paintMenu();
}
function paintMenu() {
  var els = menu.querySelectorAll('.mi');
  for (var i = 0; i < els.length; i++)
    els[i].className = 'mi' + (/\bon\b/.test(els[i].className) ? ' on' : '') + (i === mIdx ? ' f' : '');
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
  if (it.k === 'embretry') {
    embTracks = null;
    embErr = '';
    ensureEmbTracks();
    reopen();
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
    saveTitlePref('delay', subDelay);
    reopen();
    return;
  }
  if (it.k === 'd-') {
    subDelay -= 0.5;
    saveTitlePref('delay', subDelay);
    reopen();
    return;
  }
  if (it.k === 'd0') {
    subDelay = 0;
    saveTitlePref('delay', 0);
    reopen();
    return;
  }
  if (it.k === 'off') {
    subsOff();
    saveTitlePrefs({ sub: 'off', subUrl: '', subSrc: '', embLang: '' });
  } else if (it.k === 'ext') {
    setExtSub(it.u);
    saveTitlePrefs({ sub: it.lang, subUrl: it.u, subSrc: it.src || '', embLang: '' });
  } else if (it.k === 'emb') {
    setEmbSub(it.idx, it.ti);
    if (it.lang) saveTitlePrefs({ sub: it.lang, subUrl: '', subSrc: '', embLang: it.lang });
  } else if (it.k === 'aud') {
    try {
      for (var j = 0; j < v.audioTracks.length; j++) v.audioTracks[j].enabled = j === it.idx;
      audioChosenAt = Date.now();
      var al = (v.audioTracks[it.idx] && v.audioTracks[it.idx].language) || '';
      if (al) saveTitlePref('aud', al.toLowerCase());
    } catch (e) {}
  }
  var chosen = it.k === 'aud' ? P.audio + ': ' + audioName() : P.subtitles + ': ' + subtitleName();
  closeMenu();
  showToast(chosen);
  if (it.k === 'ext' || it.k === 'emb') holdForSubtitle();
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
  if (techProbed || !HAS_MEDIA_TOOLS) return;
  techProbed = true;
  xhr('/probe?u=' + encodeURIComponent(URL), function (j) {
    if (j) fillBadges(j);
  });
}
var pvT = null;
v.addEventListener('pause', function () {
  if (subHolding) return;
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
  cancelAutoNext();
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
  cancelAutoNext();
  if (isNextEp) nextEp();
  else if (SIMHREF) {
    try {
      saveProgress();
    } catch (e) {}
    location.replace(appUrl(SIMHREF));
  }
}
function checkNp() {
  if (!POPHREF || npDismissed || !v.duration) return;
  var rem = v.duration - v.currentTime;
  if (rem <= 180 && rem > 2 && !npShown) {
    npShown = true;
    paintNp();
    prefetchNext();
  } else if (rem > 180 && npShown) {
    npShown = false;
    npFocus = false;
    paintNp();
  }
}
v.addEventListener('timeupdate', checkNp);
/* While the next-episode panel is up, ask the addons for that episode's sources so the
   local server has them cached (server/addon-cache.js) when the title page opens. */
var nextPrefetched = false;
function prefetchNext() {
  if (nextPrefetched || !isNextEp || !NEXTVID) return;
  nextPrefetched = true;
  var ads = nextEpisodeAddons();
  for (var i = 0; i < ads.length; i++)
    xhr('/addon?u=' + encodeURIComponent(streamUrl(ads[i], TYPE || 'series', NEXTVID)), function () {});
}
/* the addons that answer for the next episode, without the local streaming server's own */
function nextEpisodeAddons() {
  var list = [],
    out = [];
  try {
    list = JSON.parse(localStorage.getItem('addons') || '[]');
  } catch (e) {}
  var ads = streamAddonsIn(list, TYPE || 'series');
  for (var i = 0; i < ads.length; i++)
    if (!/^https?:\/\/(?:127\.0\.0\.1|localhost):11470\//i.test(ads[i].base)) out.push(ads[i]);
  return out;
}
/* The next episode starts from here, with the source that matches this one: no title page,
   no list. Anything that goes wrong (no answer in time, no matching source) falls back to
   the title page, which still holds the preference and offers the list. */
var NEXT_DIRECT_LIMIT_MS = 12000;
function coverForNext() {
  try {
    v.pause();
  } catch (e) {}
  if (startupWatch) clearTimeout(startupWatch);
  mode = 'video';
  menu.className = '';
  bar.className = '';
  npShown = false;
  npFocus = false;
  paintNp();
  subEl.textContent = '';
  load.style.display = '';
  showToast(P.nextLoading, NEXT_DIRECT_LIMIT_MS);
}
function openNextDirect() {
  var ended = false,
    items = [],
    ads = [],
    all = nextEpisodeAddons(),
    limit;
  /* Back while waiting (seek.js exit) already left for the previous screen */
  function giveUp() {
    if (ended || exited) return;
    ended = true;
    location.replace(appUrl(NEXTHREF));
  }
  function play(source) {
    postStreamRef(source, function (ref) {
      if (ended || exited) return;
      if (!ref) return giveUp();
      ended = true;
      clearTimeout(limit);
      forgetNextSource();
      location.replace(
        appUrl(
          '/play?ref=' +
            encodeURIComponent(ref) +
            '&type=' +
            encodeURIComponent(TYPE) +
            '&id=' +
            encodeURIComponent(ID) +
            '&vid=' +
            encodeURIComponent(NEXTVID) +
            '&back=' +
            encodeURIComponent('beta#detail/' + TYPE + '/' + ID + '/' + NEXTVID)
        )
      );
    });
  }
  /* only the addon that gave this source can give its match */
  for (var i = 0; i < all.length; i++) if (all[i].name === ADDON) ads.push(all[i]);
  if (!ads.length) return giveUp();
  coverForNext();
  limit = setTimeout(giveUp, NEXT_DIRECT_LIMIT_MS);
  var pending = ads.length,
    pref = nextSourcePref();
  for (var a = 0; a < ads.length; a++)
    xhr('/addon?u=' + encodeURIComponent(streamUrl(ads[a], TYPE, NEXTVID)), function (j) {
      var st = (j && j.streams) || [];
      for (var k = 0; k < st.length; k++) {
        var item = sourceItem(st[k], ADDON);
        if (item) items.push(item);
      }
      pending--;
      if (pending > 0 || ended) return;
      var match = matchingNextSource(items, pref);
      if (match) play(match);
      else giveUp();
    });
}
function postStreamRef(source, cb) {
  try {
    var x = new XMLHttpRequest();
    x.open('POST', '/streamref', true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      var j = null;
      try {
        j = JSON.parse(x.responseText);
      } catch (e) {}
      cb(j && j.ref);
    };
    x.send(JSON.stringify(streamRefBody(source)));
  } catch (e) {
    cb('');
  }
}
/* When an episode ends the next one starts after a countdown: OK starts it now, Back
   cancels it. After three episodes in a row with nobody touching the remote it asks
   whether anyone is still watching instead of carrying on alone. */
var AUTO_NEXT_SECONDS = 10,
  AUTO_NEXT_LIMIT = 3,
  autoNextT = null;
function autoNextCount() {
  return parseInt(lsGet('bingeAutoCount', '0'), 10) || 0;
}
function setAutoNextCount(n) {
  try {
    localStorage.setItem('bingeAutoCount', String(n));
  } catch (e) {}
}
/* any key pressed in the player means someone is there */
function viewerActive() {
  if (autoNextCount()) setAutoNextCount(0);
}
function startAutoNext() {
  var L = document.getElementById('npL'),
    B = document.getElementById('npB'),
    H = document.getElementById('npH');
  npShown = true;
  npFocus = true;
  showBar();
  if (autoNextCount() >= AUTO_NEXT_LIMIT) {
    L.textContent = P.stillWatching;
    B.textContent = P.keepWatching;
    paintNp();
    return;
  }
  var left = AUTO_NEXT_SECONDS;
  H.textContent = P.countdownHint;
  function tick() {
    if (left <= 0) {
      autoNextT = null;
      setAutoNextCount(autoNextCount() + 1);
      nextEp();
      return;
    }
    B.textContent = P.playNextIn.replace('{0}', left);
    left--;
    autoNextT = setTimeout(tick, 1000);
  }
  tick();
  paintNp();
}
function cancelAutoNext() {
  if (!autoNextT) return;
  clearTimeout(autoNextT);
  autoNextT = null;
  document.getElementById('npB').textContent = P.playNext;
  document.getElementById('npH').textContent = P.dismissHint;
}
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
  xhr('/previews?u=' + encodeURIComponent(URL) + '&dur=' + Math.floor(v.duration), function () {});
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
  im.src = '/preview-frame?u=' + encodeURIComponent(URL) + '&t=' + b;
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
    seekAbs = true;
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
    viewerActive();
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
    if (k === 179 || k === 10252 || key === 'MediaPlayPause') {
      tog();
      e.preventDefault();
      return;
    }
    if (isBackKey(k)) {
      e.preventDefault();
      e.stopPropagation();
      /* leaving now means the next episode was not wanted after all */
      if (nextStarting) forgetNextSource();
      history.back();
      return;
    }
    if (nextStarting) {
      e.preventDefault();
      return;
    }
    if (failShown) {
      if (k === 13) tryAnotherSource();
      e.preventDefault();
      return;
    }
    /* LG remote: red subtitles, green audio, yellow skips 85 s (an intro), blue settings;
       digits jump to 0-90 % of the video, as on YouTube */
    if (mode !== 'menu' && !npFocus) {
      var colour = { 403: 'subsroot', 404: 'audio', 406: 'root' }[k];
      if (colour) {
        openMenu(colour);
        e.preventDefault();
        return;
      }
      if (k === 405) {
        seek(85);
        e.preventDefault();
        return;
      }
      var digit = k >= 48 && k <= 57 ? k - 48 : k >= 96 && k <= 105 ? k - 96 : -1;
      if (digit >= 0 && v.duration) {
        seekTo((v.duration * digit) / 10);
        e.preventDefault();
        return;
      }
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
      if (!restartOffered()) tog();
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
  },
  next: function () {
    nextEp();
  }
};
