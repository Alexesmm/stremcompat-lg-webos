try{
(function(){
'use strict';
window.__STREMIO_MAIN_PARSED__=true;
window.__STREMIO_PHASE__('M0');
// Service endpoints, the build profile, viewport metrics and DOM/event helpers.
/* ================= utils ================= */
var CIN = 'https://v3-cinemeta.strem.io';
var API = 'https://api.strem.io';
/* Injected by tvserver.js from the build profile; the fallback is the webOS 4 1920x1080 profile. */
var TV_PROFILE = window.__STREMIO_PROFILE__ || {
  id: 'um4-armv7',
  serviceId: 'io.strem.tv.server',
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
// XHR helpers. Addon GETs and Stremio API POSTs go through the local bridges in tvserver.js.
function xhrGetUrl(u) {
  return /^https?:\/\//i.test(String(u || '')) ? '/addon?u=' + encodeURIComponent(u) : u;
}
/* cb(json, failure): failure is null on success, otherwise 'timeout', 'offline'
   (the local service did not answer), 'unavailable' (HTTP error, e.g. the addon
   bridge's 502) or 'invalid' (the body was not JSON). */
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
        cb(failure ? null : j, failure);
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
// Interface strings (en-US, pt-BR) and language switching.
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
    searchHint: 'Press OK to type, then press Down to browse results',
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
    emptyLibrary: 'Your library is empty.<br>Hold OK on a title to add it here.',
    loadingTrailer: 'Loading trailer…',
    trailerUnavailable: 'Trailer unavailable',
    noTrailer: 'No trailer available',
    continueLabel: 'Continue',
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
    cast: 'Cast',
    director: 'Director',
    writers: 'Writers',
    country: 'Country',
    awards: 'Awards',
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
    recommendedSource: 'Recommended for this TV',
    pressOkRetry: 'Press OK to try again',
    lastSource: 'Last source',
    continuePlayback: 'Continue playback',
    sameSource: 'The same source used previously',
    seeders: 'seeders',
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
    reloadingApp: 'Reloading StremCompat…',
    sourceGroup: 'Sources',
    preferredQuality: 'Preferred quality',
    automatic: 'Automatic',
    subtitlesGroup: 'Subtitles',
    subtitleSize: 'Subtitle size',
    defaultLanguage: 'Default language',
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
    accountConnected: 'Account connected! Loading',
    genreAction: 'Action',
    genreComedy: 'Comedy',
    genreSciFi: 'Sci-Fi',
    genreDrama: 'Drama',
    genreHorror: 'Horror'
  },
  'pt-BR': {
    navSearch: 'Buscar',
    navHome: 'Início',
    navDiscover: 'Descobrir',
    navLibrary: 'Biblioteca',
    navAddons: 'Addons',
    navSettings: 'Ajustes',
    searchPlaceholder: 'Buscar filmes e séries',
    searchHint: 'Pressione OK para digitar e seta para baixo para ver resultados',
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
    emptyLibrary: 'Sua biblioteca está vazia.<br>Segure OK em um título para adicioná-lo aqui.',
    loadingTrailer: 'Carregando trailer…',
    trailerUnavailable: 'Trailer indisponível',
    noTrailer: 'Trailer indisponível',
    continueLabel: 'Continuar',
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
    cast: 'Elenco',
    director: 'Direção',
    writers: 'Roteiro',
    country: 'País',
    awards: 'Prêmios',
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
    recommendedSource: 'Recomendada para esta TV',
    pressOkRetry: 'Pressione OK para tentar de novo',
    lastSource: 'Última fonte',
    continuePlayback: 'Continuar reprodução',
    sameSource: 'A mesma fonte usada anteriormente',
    seeders: 'seeders',
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
    reloadingApp: 'Recarregando o StremCompat…',
    sourceGroup: 'Fontes',
    preferredQuality: 'Qualidade preferida',
    automatic: 'Automática',
    subtitlesGroup: 'Legendas',
    subtitleSize: 'Tamanho da legenda',
    defaultLanguage: 'Idioma padrão',
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
    accountConnected: 'Conta conectada! Carregando',
    genreAction: 'Ação',
    genreComedy: 'Comédia',
    genreSciFi: 'Ficção científica',
    genreDrama: 'Drama',
    genreHorror: 'Terror'
  }
};
function normalizeUILanguage(value) {
  return value === 'pt-BR' ? 'pt-BR' : 'en-US';
}
var UI_LANG = normalizeUILanguage(lsRaw(UI_LANG_KEY, 'en-US'));
function tx(key) {
  var args = arguments,
    text = (UI_TEXT[UI_LANG] && UI_TEXT[UI_LANG][key]) || UI_TEXT['en-US'][key] || key;
  return String(text).replace(/\{(\d+)\}/g, function (all, index) {
    var at = parseInt(index, 10) + 1;
    return args[at] == null ? '' : String(args[at]);
  });
}
function uiLanguageLabel(code) {
  return code === 'pt-BR' ? tx('portugueseBrazil') : tx('english');
}
function applyStaticLanguage() {
  var navPairs = {
    chipSearch: 'navSearch',
    chipHome: 'navHome',
    chipDisc: 'navDiscover',
    chipLib: 'navLibrary',
    chipAddons: 'navAddons',
    chipSet: 'navSettings'
  };
  for (var nid in navPairs)
    if (Object.prototype.hasOwnProperty.call(navPairs, nid) && $(nid)) {
      var labels = $(nid).getElementsByClassName('navlabel');
      if (labels.length) labels[0].textContent = tx(navPairs[nid]);
    }
  var pairs = {
    sHint: 'searchHint',
    setHint: 'settingsHint',
    discTitle: 'discoverTitle',
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
  if ($('lgLang')) $('lgLang').textContent = tx('languagePicker', uiLanguageLabel(UI_LANG));
}
function setUILanguage(value) {
  var next = normalizeUILanguage(value);
  UI_LANG = next;
  lsRawSet(UI_LANG_KEY, next);
  applyStaticLanguage();
  try {
    invalidateBoards();
  } catch (e) {}
  return next;
}
window.__STREMIO_UI_LANGUAGE__ = function () {
  return UI_LANG;
};
window.__STREMIO_SET_UI_LANGUAGE__ = setUILanguage;
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
  var done = false,
    bridge = null;
  function finish(ok) {
    if (done) return;
    done = true;
    bridge = null;
    cb(ok);
  }
  try {
    if (typeof PalmServiceBridge === 'undefined') {
      finish(false);
      return;
    }
    bridge = new PalmServiceBridge();
    bridge.onservicecallback = function () {
      finish(true);
    };
    bridge.call('luna://' + TV_PROFILE.serviceId + '/start', '{}');
    setTimeout(function () {
      finish(false);
    }, 2600);
  } catch (e) {
    finish(false);
  }
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
window.__STREMIO_RESUME_CHECK__ = runtimeRecover;
function reloadUi() {
  var url = '/beta?recover=' + Date.now();
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
window.__STREMIO_MANUAL_RECOVER__ = manualRecover;
// Poster, backdrop and icon URLs.
function isImdb(id) {
  return String(id || '').indexOf('tt') === 0;
}
function posterOf(it) {
  if (it.poster) return it.poster;
  return isImdb(it.id) ? 'https://images.metahub.space/poster/small/' + it.id + '/img' : '';
}
var ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  info: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
  similar: '<svg viewBox="0 0 24 24"><path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"/></svg>',
  trailer:
    '<svg viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M9 16.17l-3.88-3.88L3.7 13.7 9 19 21 7l-1.41-1.42z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>'
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
function bgMid(it) {
  var u = String(bgOf(it) || '');
  if (!u) return u;
  return (
    '/bgz?u=' + encodeURIComponent(u.replace(/(images\.metahub\.space\/background\/)[a-z]+\//, '$1medium/'))
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
window.__STREMIO_PHASE__('M1');
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
function cwItems() {
  var out = [],
    lib = allLib();
  for (var i = 0; i < lib.length; i++) {
    var it = lib[i],
      s = it.state || {};
    if (!s.timeOffset || s.timeOffset < 60000) continue;
    if (s.duration && s.timeOffset > s.duration * 0.96) continue;
    if (!it.name) continue;
    out.push(it);
  }
  out.sort(function (a, b) {
    return String(b._mtime || '').localeCompare(String(a._mtime || ''));
  });
  return out.slice(0, 12);
}
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
    var want = [];
    for (var i = 0; i < rows.length; i++) {
      var id = rows[i][0],
        mt = rows[i][1];
      var loc = lsJson(PRE + id);
      if (!loc || String(loc._mtime || '') < String(mt || '')) want.push(id);
      if (want.length >= 150) break;
    }
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
  var ak = authKey();
  if (!ak || !item || !item._id) return;
  postJson(
    API + '/api/datastorePut',
    { authKey: ak, collection: 'libraryItem', changes: [item] },
    function () {},
    9000
  );
}
// Account addon collection.
/* addons: silent pull from the account at every boot (no buttons needed) */
function addons() {
  return lsJson('addons') || [];
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
function addonBase(a) {
  return String(a.transportUrl || '').replace(/\/manifest\.json.*$/, '');
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
    a = addons();
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
window.__STREMIO_DISCOVER_TYPES__ = discoverTypes;
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
function homeCatalogs() {
  var out = [],
    a = addons(),
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
        url: base + '/catalog/' + cat.type + '/' + encodeURIComponent(cat.id) + '.json',
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
    a = addons();
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
  var out = [],
    a = addons();
  for (var i = 0; i < a.length; i++) {
    var m = a[i] && a[i].manifest;
    if (!m) continue;
    var res = m.resources || [],
      okRes = false;
    for (var r = 0; r < res.length; r++) {
      var rr = res[r];
      if (rr === 'stream' || (rr && rr.name === 'stream')) okRes = true;
    }
    if (!okRes) continue;
    var types = m.types || [];
    if (types.length && types.indexOf(type) < 0) {
      /* a stream resource OBJECT with no explicit types means "any type" — don't skip it */
      var allow = false;
      for (var r2 = 0; r2 < res.length; r2++) {
        var rr2 = res[r2];
        if (rr2 && rr2.name === 'stream') {
          if (!rr2.types || !rr2.types.length || rr2.types.indexOf(type) >= 0) allow = true;
        }
      }
      if (!allow) continue;
    }
    out.push({ name: m.name || 'Addon', base: addonBase(a[i]) });
  }
  return out;
}
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
function qualityLabel(value) {
  return value === 'All'
    ? tx('all')
    : value === 'Other'
      ? tx('other')
      : value === 'Recent'
        ? tx('recent')
        : value;
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
  return { labels: labels, rank: rank };
}
window.__STREMIO_STREAM_COMPAT__ = streamCompatibility;
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
window.__STREMIO_COMPACT_SOURCES__ = compactSourcePool;
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
      xhrJson(
        ad.base + '/stream/' + type + '/' + encodeURIComponent(vid) + '.json',
        function (j, failure) {
          if (failure) failed.push(ad.name);
          var st = (j && j.streams) || [];
          var out = [];
          for (var k = 0; k < st.length; k++) {
            var s = st[k];
            var url = s.url,
              h = s.behaviorHints || {};
            if (!url && s.infoHash) url = 'http://127.0.0.1:11470/' + s.infoHash + '/' + (s.fileIdx || 0);
            if (!url) continue;
            var item = {
              addon: ad.name,
              name: s.name || '',
              title: s.title || s.description || '',
              url: url,
              quality: streamQuality(s),
              seeders: streamSeeders(s),
              filename: h.filename || '',
              notWebReady: !!h.notWebReady,
              headers: (h.proxyHeaders && h.proxyHeaders.request) || null
            };
            var compat = streamCompatibility(item);
            item.compatLabels = compat.labels;
            item.compatRank = compat.rank;
            out.push(item);
          }
          total += out.length;
          if (out.length) onPart(out, idx, ad.name);
          pending--;
          if (pending <= 0) onDone(total, failed);
        },
        45000
      ); /* slow debrid addons can take 20-30s; phone/PC wait too — 15s was dropping them */
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
  var body = {
    url: s.url,
    addon: s.addon || '',
    name: s.name || '',
    title: s.title || '',
    filename: s.filename || '',
    quality: s.quality || '',
    compat: (s.compatLabels || []).join(','),
    notWebReady: !!s.notWebReady,
    headers: s.headers || null
  };
  function prepare(attempt) {
    postJson(
      '/streamref',
      body,
      function (j) {
        if (j && j.ref) {
          location.assign('/play?ref=' + encodeURIComponent(j.ref) + tail);
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
  prepare(1);
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
  location.assign('/play' + q + '&back=' + encodeURIComponent(backHash));
}
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
function matchingNextSource(items, pref) {
  if (!pref || !pref.addon || !pref.quality) return null;
  var wanted = sourceTraits((pref.text || '') + ' ' + (pref.compat || '')),
    best = null,
    bestScore = -9999;
  for (var i = 0; i < items.length; i++) {
    var s = items[i];
    if (s.stored || s.addon !== pref.addon || s.quality !== pref.quality) continue;
    var traits = sourceTraits(streamText(s) + ' ' + (s.compatLabels || []).join(' ')),
      score = 0;
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
window.__STREMIO_MATCH_NEXT_SOURCE__ = matchingNextSource;
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
  bgT = null;
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
      $('bg').style.backgroundImage = 'url("' + u + '")';
      $('bg').className = 'on';
      $('bg2').className = '';
      $('bg2').style.backgroundImage = 'none';
    };
    img.onerror = function () {
      if (bgCur !== u) return;
      var m = u.match(/^\/bgz\?u=(.*)$/);
      if (m) {
        var raw = decodeURIComponent(m[1]).replace(
          /(images\.metahub\.space\/background\/)[a-z]+\//,
          '$1small/'
        );
        bgCur = raw;
        var im2 = new Image();
        im2.onload = function () {
          if (bgCur !== raw) return;
          $('bg').style.backgroundImage = 'url("' + raw + '")';
          $('bg').className = 'on';
          $('bg2').className = '';
          $('bg2').style.backgroundImage = 'none';
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
    a = addons();
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
  var bi = 0;
  function tryNext() {
    if (bi >= bases.length) {
      if (!fresh) cb(null);
      return;
    }
    var b = bases[bi++];
    xhrJson(b + '/meta/' + type + '/' + encodeURIComponent(id) + '.json', function (j) {
      var m = j && j.meta;
      if (!m) {
        tryNext();
        return;
      }
      putMetaMem(k, m);
      lsSet('beta_meta_' + k, { t: Date.now(), meta: m });
      capMetaCache(k);
      if (!fresh) cb(m);
    });
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
var BOARD_SCR = { home: 1, lib: 1 };
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
  if (SCR === 'login') {
    try {
      window.close();
    } catch (e) {}
    return;
  }
  if (cwMenu.open) {
    cwMenu.close();
    return;
  }
  if (streamsUI.open) {
    streamsUI.close();
    return;
  }
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
      topNav.idx = 1;
      goScr('home', null, true);
      topNav.active = false;
    } else {
      try {
        window.close();
      } catch (e) {}
    }
    return;
  }
  var prev = backStack.pop();
  if (prev) {
    goScr(prev.name, backParams(prev), true);
    return;
  }
  if (SCR === 'home') {
    topNav.idx = 1;
    topNav.focus();
    return;
  }
  if (SCR !== 'home') {
    topNav.idx = 1;
    goScr('home', null, true);
    return;
  }
  try {
    window.close();
  } catch (e) {}
}

var chips = [$('chipSearch'), $('chipHome'), $('chipDisc'), $('chipLib'), $('chipAddons'), $('chipSet')];
var chipTarget = ['search', 'home', 'disc', 'lib', 'addons', 'set'];
window.__STREMIO_PHASE__('M2');
function paintChips() {
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
  return SCR === 'home' ? home : SCR === 'lib' ? lib : null;
}
var topNav = {
  idx: 1,
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
    if (
      i === this.idx &&
      (BOARD_SCR[SCR] || SCR === 'disc' || SCR === 'search' || SCR === 'addons' || SCR === 'set')
    )
      return;
    this.idx = i;
    var t = chipTarget[i];
    backStack = [];
    scrParams = null;
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
        b.rowIdx = 0;
        b.paint();
        b.hero();
      }
    }
    this.paint();
  },
  key: function (k) {
    if (k === 38) this.switchTo(this.idx - 1);
    else if (k === 40) this.switchTo(this.idx + 1);
    else if (k === 39 || k === 13) this.enterContent();
    return true;
  }
};
// Board engine shared by Home and Library: hero plus horizontally scrolling rows.
/* ================= board engine (Home / Discover / Library share one hero+rows) ================= */
function makeBoard(loader) {
  return {
    rows: [],
    rowIdx: 0,
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
      var focusOn = curBoard() === this && !topNav.active;
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
      var t = focusOn && cur ? cur.el.offsetTop : 0;
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
        self.heroApply();
      }, 260);
      prewarmNeighbors(this.rows[this.rowIdx]);
    },
    heroApply: function () {
      if (curBoard() !== this) return; /* a debounced hero must not paint after we left this board */
      var it = this.focusedItem();
      if (!it) {
        return;
      }
      var lg = $('heroLogo'),
        tt = $('heroTitle');
      var self = this;
      /* NEVER flash plain text: keep the previous title until the new item's logo either loads
       (show logo) or fails (only then show text). Logos are prewarmed so this is instant. */
      if (isImdb(it.id)) {
        var lu = 'https://images.metahub.space/logo/medium/' + it.id + '/img';
        var im = new Image();
        im.onload = function () {
          if (self.focusedItem() === it) {
            lg.src = lu;
            lg.style.display = 'block';
            tt.style.display = 'none';
          }
        };
        im.onerror = function () {
          if (self.focusedItem() === it) {
            tt.textContent = it.name || '';
            tt.style.display = 'block';
            lg.style.display = 'none';
          }
        };
        im.src = lu;
      } else {
        tt.textContent = it.name || '';
        tt.style.display = 'block';
        lg.style.display = 'none';
      }
      $('heroMeta').textContent = it.metaLine || '';
      $('heroDesc').textContent = it.description || '';
      setBg(bgMid(it));
      if (!it.description && it.id) {
        getMeta(it.type, it.id, function (m) {
          if (!m) return;
          it.description = m.description || '';
          it.metaLine = [m.releaseInfo || m.year, m.runtime, m.imdbRating ? 'IMDb ' + m.imdbRating : '']
            .join('   ')
            .replace(/\s+/g, ' ');
          if (self.focusedItem() === it) {
            $('heroDesc').textContent = it.description;
            $('heroMeta').textContent = it.metaLine;
          }
        });
      }
    },
    focusedItem: function () {
      if (this.settleRow() < 0) return null;
      var row = this.rows[this.rowIdx];
      return row.items[row.col] || null;
    },
    key: function (k) {
      if (this.settleRow() < 0) {
        if (k === 38) topNav.focus();
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
        if (prev >= 0) {
          this.rowIdx = prev;
          this.paint();
          this.hero();
        } else {
          topNav.focus();
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
  loadCatalogRows(b, homeDefs(), true, keep);
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
      '.json'
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
      host.innerHTML = '<div class="stmsg">' + tx('nothingFound') + '</div>';
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
    var it = this.focusedItem();
    if (this.zone === 'grid' && it) setBg(bgMid(it));
    else setBg('');
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
      else if (k === 38) {
        topNav.focus();
        return true;
      } else if (k === 40) {
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
  d.className = 'card' + (wide ? ' wide' : '');
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
      if (img.src !== BLANK_IMG) nm.style.display = 'block';
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
  } else nm.style.display = 'block';
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
    var epTxt = '';
    if (it.videoId && it.videoId.indexOf(':') > 0) {
      var pp = it.videoId.split(':');
      epTxt = '  S' + pp[pp.length - 2] + ' E' + pp[pp.length - 1];
    }
    lb.textContent = (it.name || '') + epTxt;
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
/* generic catalog-backed board loader (rows fill in asynchronously, cache-first) */
function loadCatalogRows(board, defs, includeCW, keepFocus) {
  var oldRow = board.rowIdx,
    oldCols = [],
    loadGen = (board._loadGen || 0) + 1;
  board._loadGen = loadGen;
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
      for (var c = 0; c < cw.length; c++) {
        var it = cw[c],
          s2 = it.state || {};
        cwMapped.push({
          id: it._id,
          type: it.type || 'movie',
          name: it.name,
          poster: it.poster,
          background: it.background,
          videoId: s2.video_id || it._id,
          progress: s2.duration > 0 ? s2.timeOffset / s2.duration : 0,
          cw: true
        });
      }
      var r0 = buildRow(tx('continueWatching'), cwMapped, true);
      board.rows.push(r0);
      reveal(r0, 70);
    }
  }
  for (var d = 0; d < defs.length; d++)
    (function (def, di) {
      var row = buildRow(def.title, [], false);
      board.rows.push(row);
      /* only the rows that start on screen get placeholders; a rebuild keeps its rows */
      if (!keepFocus && di < 3) placeholderCards(row);
      else row.el.style.display = 'none';
      getCatalogUrl(def.url, def.key, def.type, function (items) {
        if (board._loadGen !== loadGen) return; /* ignore callbacks from a superseded rebuild */
        row.items = items;
        row.cardsEl.innerHTML = '';
        row.cardEls = [];
        for (var i = 0; i < items.length; i++) {
          var cd = makeCard(items[i], false, false, false);
          row.cardsEl.appendChild(cd);
          row.cardEls.push(cd);
        }
        row.el.style.display = items.length ? '' : 'none';
        if (items.length) reveal(row, 180 + di * 120);
        if (row.col >= items.length) row.col = 0;
        if (curBoard() === board) {
          board.paint(true);
          board.hero();
        }
      });
    })(defs[d], d);
  if (keepFocus) {
    board.rowIdx = Math.min(oldRow, board.rows.length - 1);
    for (var j = 0; j < board.rows.length && j < oldCols.length; j++)
      board.rows[j].col = Math.min(oldCols[j] || 0, Math.max(0, board.rows[j].items.length - 1));
  } else board.rowIdx = 0;
}
/* HOME rows = YOUR addon catalogs (in order); Cinemeta defaults if none configured */
function homeDefs() {
  var cats = homeCatalogs();
  if (!cats.length)
    cats = [
      { title: tx('popularMovies'), type: 'movie', url: CIN + '/catalog/movie/top.json', key: 'cin_m_top' },
      { title: tx('popularSeries'), type: 'series', url: CIN + '/catalog/series/top.json', key: 'cin_s_top' },
      { title: tx('topMovies'), type: 'movie', url: CIN + '/catalog/movie/imdbRating.json', key: 'cin_m_ir' },
      {
        title: tx('topSeries'),
        type: 'series',
        url: CIN + '/catalog/series/imdbRating.json',
        key: 'cin_s_ir'
      }
    ];
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
function loadLibraryRows(board) {
  board.rows = [];
  var cw = cwItems();
  if (cw.length) {
    var m = [];
    for (var c = 0; c < cw.length; c++) {
      var it = cw[c],
        s2 = it.state || {};
      m.push({
        id: it._id,
        type: it.type || 'movie',
        name: it.name,
        poster: it.poster,
        background: it.background,
        videoId: s2.video_id || it._id,
        progress: s2.duration > 0 ? s2.timeOffset / s2.duration : 0,
        cw: true
      });
    }
    var r0 = buildRow(tx('continueWatching'), m, true);
    r0.el.className = 'row in';
    board.rows.push(r0);
  }
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
    e.innerHTML =
      '<div style="font-size:30px;color:rgba(255,255,255,.55);padding:70px 48px 0;line-height:1.5">' +
      tx('emptyLibrary') +
      '</div>';
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
      else toast(tx('trailerUnavailable'));
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
/* a movie counts as watched if it's in watchedEpisodes or finished (>=90%) */
function itemWatched(it) {
  if (!it || !it.id || it.type === 'series') return false;
  var lib = lsJson(PRE + it.id);
  if (!lib || !lib.state) return false;
  var s = lib.state;
  var vid = it.videoId || it.id;
  if (s.watchedEpisodes)
    for (var i = 0; i < s.watchedEpisodes.length; i++) if (s.watchedEpisodes[i] === vid) return true;
  if (s.flaggedWatched && s.duration && s.timeOffset >= s.duration * 0.9) return true;
  return false;
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
function markCwWatched(it) {
  var lib2 = lsJson(PRE + it.id);
  if (!lib2) return;
  var s2 = lib2.state || {};
  var vid = s2.video_id || it.videoId || it.id;
  if (!s2.watchedEpisodes) s2.watchedEpisodes = [];
  var f = false;
  for (var i = 0; i < s2.watchedEpisodes.length; i++) if (s2.watchedEpisodes[i] === vid) f = true;
  if (!f) s2.watchedEpisodes.push(vid);
  s2.flaggedWatched = 1;
  s2.timeOffset = 0;
  lib2.state = s2;
  lib2._mtime = new Date().toISOString();
  lsSet(PRE + it.id, lib2);
  pushLib(lib2);
  invalidateBoards();
}
// Long-press OK side menu available on every card.
/* ================= unified long-press side menu (any card) ================= */
var cwMenu = {
  open: false,
  idx: 0,
  els: [],
  acts: [],
  it: null,
  show: function (it) {
    this.it = it;
    this.open = true;
    this.idx = 0;
    var host = $('cwmItems');
    host.innerHTML = '';
    this.els = [];
    this.acts = [];
    var self = this;
    $('cwmTitle').textContent = it.name || '';
    var sub = it.type === 'series' ? tx('seriesOne') : tx('movie');
    if (it.cw && it.videoId && it.videoId.indexOf(':') > 0) {
      var pp = it.videoId.split(':');
      sub = tx('seasonEpisode', pp[pp.length - 2], pp[pp.length - 1]);
    }
    $('cwmSub').textContent = sub;
    function add(ic, lb, fn) {
      var d = document.createElement('div');
      d.className = 'cwmi';
      d.innerHTML = ic + '<span>' + esc(lb) + '</span>';
      host.appendChild(d);
      self.els.push(d);
      self.acts.push(fn);
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
      this.close();
      return true;
    }
    this.paint();
    return true;
  }
};
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
        if (!self.items.length)
          host.innerHTML =
            '<div style="font-size:27px;color:rgba(255,255,255,.55);padding:40px">' +
            tx('nothingFound') +
            '</div>';
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
function buildEpisodeModel(videos) {
  var bySeason = {},
    order = [],
    i,
    s,
    v,
    eps,
    o,
    sn,
    cursor = 0,
    seasons = [],
    linear = [];
  videos = videos || [];
  for (i = 0; i < videos.length; i++) {
    v = videos[i];
    s = v.season != null ? parseInt(v.season, 10) : 0;
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
    eps.sort(function (a, b) {
      return episodeNumber(a, 0) - episodeNumber(b, 0);
    });
    for (i = 0; i < eps.length; i++) {
      v = eps[i];
      v._stremSeason = sn;
      v._stremSeasonEpisode = episodeNumber(v, i + 1);
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
function episodeImage(v, meta) {
  var u = (v && (v.thumbnail || v.still || v.stillPath || v.still_path)) || '';
  if (u && String(u).charAt(0) === '/') u = 'https://image.tmdb.org/t/p/w500' + u;
  return u;
}
function episodeIndexByNumber(items, n) {
  for (var i = 0; i < (items || []).length; i++) if (items[i]._stremAbsolute === n) return i;
  return -1;
}
window.__STREMIO_EPISODE_INDEX__ = episodeIndexByNumber;
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
      b + '/meta/' + type + '/' + encodeURIComponent(id) + '.json',
      function (j) {
        if (j && j.meta) changed = mergeEpisodeDetails(meta, j.meta) || changed;
        next();
      },
      4500
    );
  }
  next();
}
window.__STREMIO_EPISODE_MODEL__ = buildEpisodeModel;
window.__STREMIO_MERGE_EPISODES__ = mergeEpisodeDetails;
// Title detail screen: actions, seasons, episode ranges and episode list.
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
    $('dPoster').style.display = 'none';
    $('dPoster').src = BLANK_IMG;
    $('dPoster')._detailId = '';
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
  currentEpisode: function () {
    return (this.eps && this.eps[this.epIdx]) || null;
  },
  loadWatched: function () {
    /* LOCAL watched list (state.watchedEpisodes) — never synced */
    this.watchedMap = {};
    if (this.type !== 'series') return;
    var lib = lsJson(PRE + this.id);
    var we = (lib && lib.state && lib.state.watchedEpisodes) || [];
    for (var i = 0; i < we.length; i++) this.watchedMap[we[i]] = 1;
  },
  markWatched: function () {
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
  },
  firstUnwatched: function () {
    for (var s = 0; s < this.seasons.length; s++) {
      if (this.seasons[s].n === 0) continue;
      var eps = this.seasons[s].eps;
      for (var e = 0; e < eps.length; e++) if (!this.watchedMap[eps[e].id]) return eps[e].id;
    }
    return this.seasons[0] && this.seasons[0].eps[0] ? this.seasons[0].eps[0].id : null;
  },
  render: function () {
    var m = this.meta;
    $('dTitle').textContent = m.name || '';
    var lg = $('dLogo');
    var mediaId = this.id;
    if (m.logo) {
      var im = new Image();
      im.onload = function () {
        if (detail.meta === m && detail.id === mediaId) {
          lg.src = m.logo;
          lg.style.display = 'block';
          $('dTitle').style.display = 'none';
        }
      };
      im.src = m.logo;
    } else {
      $('dTitle').style.display = 'block';
    }
    if (m.poster) {
      var pi = new Image();
      pi.onload = function () {
        if (detail.meta === m && detail.id === mediaId) {
          var dp = $('dPoster');
          dp.src = m.poster;
          dp._detailId = mediaId;
          if (detail.zone !== 'eps') dp.style.display = 'block';
        }
      };
      pi.src = m.poster;
    }
    var bits = [];
    if (m.releaseInfo || m.year) bits.push(m.releaseInfo || m.year);
    if (m.runtime) bits.push(m.runtime);
    if (m.genres && m.genres.length) bits.push(m.genres.slice(0, 3).join(' · '));
    var rate = m.imdbRating
      ? '<span class="drating">★ ' + esc(m.imdbRating) + '</span>&nbsp;&nbsp;·&nbsp;&nbsp;'
      : '';
    $('dMeta').innerHTML = rate + esc(bits.join('  ·  '));
    var info = '';
    if (m.cast && m.cast.length)
      info +=
        '<div><span class="dlbl">' + tx('cast') + '</span>' + esc(m.cast.slice(0, 5).join(', ')) + '</div>';
    if (m.director && m.director.length)
      info +=
        '<div><span class="dlbl">' +
        tx('director') +
        '</span>' +
        esc(m.director.slice(0, 2).join(', ')) +
        '</div>';
    if (m.writer && m.writer.length)
      info +=
        '<div><span class="dlbl">' +
        tx('writers') +
        '</span>' +
        esc(m.writer.slice(0, 3).join(', ')) +
        '</div>';
    if (m.country) info += '<div><span class="dlbl">' + tx('country') + '</span>' + esc(m.country) + '</div>';
    if (m.awards)
      info +=
        '<div><span class="dlbl">' + tx('awards') + '</span>' + esc(String(m.awards).slice(0, 80)) + '</div>';
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
    /* Movies keep an explicit primary action even though sources auto-open. If the
     viewer dismisses the panel, Watch remains focused and makes recovery obvious. */
    if (this.type !== 'series')
      this.addBtn(tx('watch'), function () {
        self.openStreams(self.id);
      });
    var hasTr = (m.trailers && m.trailers.length) || (m.trailerStreams && m.trailerStreams.length);
    if (hasTr)
      this.addBtn(tx('trailer'), function () {
        self.playTrailer();
      });
    this.addBtn(tx('similar'), function () {
      goScr('sim', { type: self.type, id: self.id, name: m.name });
    });
    this.addBtn(this.inLib() ? tx('inLibrary') : tx('libraryButton'), function () {
      self.toggleLib();
    });
    this.paint();
    /* movies auto-open their streams; series just highlight the resume/first-unwatched episode
     (NO auto-open) so you land on the episode list and pick one yourself */
    if (this.type === 'series') {
      var lib = lsJson(PRE + this.id);
      var av =
        this.vid ||
        (lib && lib.state && lib.state.timeOffset > 60000 && lib.state.video_id) ||
        this.firstUnwatched();
      this.vid = null;
      if (av) {
        this.selectEpisode(av, true); /* noOpen: highlight only */
        if (hasNextSourcePreference(this.id, av)) {
          var nextSelf = this;
          setTimeout(function () {
            if (SCR === 'detail' && !streamsUI.open) nextSelf.openStreams(av);
          }, 250);
        }
      }
    } else if (!this.restored) {
      setTimeout(function () {
        if (SCR === 'detail' && detail.meta === m && !streamsUI.open) self.openStreams(self.id);
      }, 250);
    }
  },
  addBtn: function (label, act) {
    var b = document.createElement('div');
    b.className = 'btn';
    b.textContent = label;
    $('dBtns').appendChild(b);
    this.btnEls.push(b);
    this.btnActs.push(act);
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
    var lbl = this.inLib() ? tx('inLibrary') : tx('libraryButton');
    for (var i = 0; i < this.btnEls.length; i++) {
      var t = this.btnEls[i].textContent;
      if (t === tx('libraryButton') || t === tx('inLibrary')) this.btnEls[i].textContent = lbl;
    }
  },
  playTrailer: function () {
    var t = trailerIdOf(this.meta);
    if (!t) {
      toast(tx('noTrailer'));
      return;
    }
    ytPlay(t, 'beta#detail/' + this.type + '/' + this.id);
  },
  buildSeasons: function () {
    var model = buildEpisodeModel((this.meta && this.meta.videos) || []);
    this.seasons = model.seasons;
    this.linearEps = model.linear;
    if (this.seasonIdx >= this.seasons.length) this.seasonIdx = Math.max(0, this.seasons.length - 1);
    if (this.rangeIdx * 50 >= this.linearEps.length)
      this.rangeIdx = Math.max(0, Math.ceil(this.linearEps.length / 50) - 1);
    this.epIdx = 0;
    this.buildEps();
  },
  addSeasonControl: function (label, act, kind) {
    var host = $('dSeasons'),
      ch = document.createElement('div');
    ch.className = 'schip ' + (kind || '');
    ch.textContent = label;
    host.appendChild(ch);
    this.seasonEls.push(ch);
    this.seasonActs.push(act);
  },
  buildSeasonControls: function () {
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
        if (self.episodeMode === 'season') {
          if (self.seasonIdx > 0) self.seasonIdx--;
        } else if (self.rangeIdx > 0) self.rangeIdx--;
        self.epIdx = 0;
        self.buildEps();
      },
      'arrow'
    );
    var label;
    if (this.episodeMode === 'season') {
      var se = this.seasons[this.seasonIdx];
      label = se ? (se.n === 0 ? tx('specials') : tx('season', se.n)) : tx('season', 1);
    } else {
      var first = this.rangeIdx * 50 + 1,
        last = Math.min(this.linearEps.length, first + 49);
      label = tx('episodeRange', first, last);
    }
    this.addSeasonControl(label, function () {}, 'selector');
    this.addSeasonControl(
      '›',
      function () {
        if (self.episodeMode === 'season') {
          if (self.seasonIdx < self.seasons.length - 1) self.seasonIdx++;
        } else if ((self.rangeIdx + 1) * 50 < self.linearEps.length) self.rangeIdx++;
        self.epIdx = 0;
        self.buildEps();
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
  },
  buildEps: function () {
    var se = this.seasons[this.seasonIdx],
      start = this.rangeIdx * 50;
    var host = $('dEpsInner');
    host.innerHTML = '';
    this.epEls = [];
    this.eps = this.episodeMode === 'continuous' ? this.linearEps.slice(start, start + 50) : se ? se.eps : [];
    this.buildSeasonControls();
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
      if (v.overview || v.description) {
        var o = document.createElement('div');
        o.className = 'o';
        o.textContent = v.overview || v.description;
        bd.appendChild(o);
      }
      d.appendChild(bd);
      host.appendChild(d);
      this.epEls.push(d);
    }
    this.epIdx = 0;
    this.markWatched();
  },
  jumpEpisode: function () {
    episodeJump.show((this.currentEpisode() && this.currentEpisode()._stremAbsolute) || 1);
  },
  goToEpisodeNumber: function (n) {
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
  },
  selectEpisode: function (vid, noOpen) {
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
        near = Math.abs(ii - this.epIdx) <= 2;
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
      $('dPoster').style.display = 'none';
      $('dBtns').style.display = 'none';
      $('dDesc').style.display = 'block';
      $('dMeta').textContent = cv
        ? cv._stremAbsolute
          ? tx('seasonAbsoluteEpisode', cv._stremSeason, cv._stremSeasonEpisode, cv._stremAbsolute)
          : tx('seasonEpisode', cv._stremSeason, cv._stremSeasonEpisode)
        : '';
      $('dDesc').textContent = (cv && (cv.overview || cv.description)) || '';
      if (cv) setBg(episodeImage(cv, this.meta) || episodeFallback(this.meta, false));
      else if (this.meta) setBg(this.meta.background || '');
    } else {
      bodyRemove('series-episode');
      $('dBtns').style.display = 'block';
      $('dDesc').style.display = 'block';
      $('dInfo').style.display = 'block';
      $('dMeta').innerHTML = this.baseMeta;
      $('dInfo').innerHTML = this.baseInfo;
      $('dDesc').textContent = this.baseDesc;
      var posterReady = this.meta && this.meta.poster && $('dPoster')._detailId === this.id;
      $('dPoster').style.display = posterReady ? 'block' : 'none';
      if (this.meta) setBg(this.meta.background || bgOf({ id: this.id, poster: this.meta.poster }));
    }
  },
  openStreams: function (vid) {
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
      } else if (k === 38) {
        topNav.focus();
        return true;
      } /* Up reaches the top tabs from a detail page */ else if (k === 13) {
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
window.__STREMIO_EPISODE_JUMP__ = episodeJump;
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
  chipIdx: 0,
  chips: [],
  chipEls: [],
  failed: [],
  title: '',
  show: function (type, id, vid, title) {
    var request = ++this.requestSeq;
    this.open = true;
    this.failed = [];
    this.title = title || '';
    this.items = [];
    this.idx = 0;
    this.els = [];
    this.groups = [];
    this.pool = [];
    this.trimmed = {};
    this.type = type;
    this.id = id;
    this.vid = vid;
    this.seq = 0;
    this.autoPref = takeNextSourcePreference(id, vid);
    this.zone = 'list';
    this.filter = 'All';
    this.chipIdx = 0;
    this.chips = [];
    this.chipEls = [];
    $('streams').style.display = 'block';
    $('stChips').innerHTML = '';
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
        if (!self.items.length) {
          $('stInner').innerHTML =
            '<div class="stmsg">' +
            (self.failed.length
              ? esc(tx('addonsNoAnswer', self.failed.join(', '))) + '<br>' + tx('pressOkRetry')
              : tx('noSources')) +
            '</div>';
          return;
        }
        self.rebuild();
        var matched = matchingNextSource(self.all(), self.autoPref);
        self.autoPref = null;
        if (matched) {
          var backHash = 'beta#detail/' + self.type + '/' + self.id + '/' + self.vid;
          playUrl(matched, self.type, self.id, self.vid, backHash);
        }
      }
    );
  },
  push: function (arr, gIdx, gName) {
    if (!this.open) return;
    for (var i = 0; i < arr.length; i++) {
      arr[i]._seq = this.seq++;
      this.pool.push(arr[i]);
    }
    this.compact();
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
    this.paintChips();
  },
  paintChips: function () {
    for (var i = 0; i < this.chipEls.length; i++) {
      var cur = this.chips[i] === this.filter;
      this.chipEls[i].className =
        'stchip' + (cur ? ' cur' : '') + (this.zone === 'chips' && i === this.chipIdx ? ' f' : '');
    }
  },
  rebuild: function () {
    var sel = this.items[this.idx] || null,
      flat = this.all(),
      self = this,
      pref = lsRaw('preferredSourceQuality', 'Auto');
    flat = flat.filter(function (s) {
      return self.filter === 'All' || s.quality === self.filter;
    });
    flat.sort(function (a, b) {
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
    /* The list is already ordered by compatibility and seeders; the first source with
       no compatibility warning is named as the one to pick when there is a choice. */
    var rec = -1,
      choices = 0;
    for (var r = 0; r < flat.length; r++) {
      if (flat[r].stored) continue;
      choices++;
      if (rec < 0 && !(flat[r].compatRank > 0)) rec = r;
    }
    if (choices < 2) rec = -1;
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
      a.textContent = s.stored
        ? tx('continuePlayback')
        : qualityLabel(s.quality || 'Other') +
          (s.seeders >= 0 ? '  ·  ' + s.seeders + ' ' + tx('seeders') : '') +
          '  ·  ' +
          (s.addon || 'Addon');
      d.appendChild(a);
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
    if (sel) {
      var at = this.items.indexOf(sel);
      this.idx = at >= 0 ? at : Math.min(this.idx, Math.max(0, this.items.length - 1));
    } else this.idx = Math.min(this.idx, Math.max(0, this.items.length - 1));
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
    this.requestSeq++;
    $('streams').style.display = 'none';
  },
  choose: function () {
    var s = this.items[this.idx];
    if (!s) {
      if (this.failed.length) this.show(this.type, this.id, this.vid, this.title);
      return true;
    }
    var backHash = 'beta#detail/' + this.type + '/' + this.id + (this.vid !== this.id ? '/' + this.vid : '');
    if (s.stored) playStored(s.stored, backHash);
    else playUrl(s, this.type, this.id, this.vid, backHash);
    return true;
  },
  key: function (k) {
    if (this.zone === 'chips') {
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
      this.idx = 0;
      this.rebuild();
      return true;
    }
    if (k === 40) {
      this.idx = Math.min(this.els.length - 1, this.idx + 1);
      this.paint();
    } else if (k === 38) {
      if (this.idx > 0) {
        this.idx--;
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
// Search screen and recent searches.
/* Typing with the remote is slow, so the last searches stay one key away. */
var RECENT_SEARCH_KEY = 'recentSearches',
  RECENT_SEARCH_MAX = 8;
function recentSearches() {
  var list = lsJson(RECENT_SEARCH_KEY);
  return Object.prototype.toString.call(list) === '[object Array]' ? list : [];
}
function rememberSearch(q) {
  var list = recentSearches(),
    out = [q];
  for (var i = 0; i < list.length && out.length < RECENT_SEARCH_MAX; i++)
    if (typeof list[i] === 'string' && list[i].toLowerCase() !== q.toLowerCase()) out.push(list[i]);
  lsSet(RECENT_SEARCH_KEY, out);
}
/* ================= SEARCH ================= */
var search = {
  zone: 'input',
  rows: [],
  rowIdx: 0,
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
          if (e.keyCode === 13) {
            e.preventDefault();
            e.stopPropagation();
            $('sBox').blur();
            self.run($('sBox').value);
          } else if (e.keyCode === 40) {
            e.preventDefault();
            e.stopPropagation();
            $('sBox').blur();
            if (self.rows.length || self.recent.length) {
              self.zone = self.rows.length ? 'rows' : 'recent';
              self.paint();
            }
          } else if (e.keyCode === 461 || e.keyCode === 27) {
            e.preventDefault();
            e.stopPropagation();
            $('sBox').blur();
            self.paint();
          }
        },
        true
      );
    }
  },
  enter: function (p) {
    this.wire();
    this.zone = 'input';
    /* Back from a result returns to that result, not to the text box */
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
    this.zone = 'input';
    this.paint();
  } /* nav handed focus down to the box */,
  run: function (q) {
    q = String(q || '').replace(/^\s+|\s+$/g, '');
    if (!q) {
      return;
    }
    this.q = q;
    rememberSearch(q);
    var gen = ++this.gen;
    for (var rq = 0; rq < this.requests.length; rq++)
      if (this.requests[rq] && this.requests[rq].abort)
        try {
          this.requests[rq].abort();
        } catch (e) {}
    this.requests = [];
    var host = $('sRows');
    unloadBoard(this);
    host.innerHTML = '';
    this.rows = [];
    this.rowIdx = 0;
    var self = this;
    $('sHint').textContent = tx('searching');
    var got = 0;
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
        $('sHint').textContent = self.rows.length ? '' : tx('noResults', q);
        if (self.rows.length) {
          self.zone = 'rows';
        }
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
  /* recent searches are offered while there are no results to browse */
  renderRecent: function () {
    var list = this.rows.length ? [] : recentSearches(),
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
    for (var i = 0; i < this.recent.length; i++) {
      var c = document.createElement('div');
      c.className = 'schip';
      c.textContent = this.recent[i];
      host.appendChild(c);
      this.recentEls.push(c);
    }
    this.recentIdx = Math.min(this.recentIdx, this.recent.length - 1);
  },
  runRecent: function (i) {
    var q = this.recent[i];
    if (!q) return;
    $('sBox').value = q;
    this.recentIdx = 0;
    this.zone = 'input';
    this.run(q);
  },
  paint: function () {
    virtualizeBoard(this, this.rowIdx, false);
    $('sBox').className = this.zone === 'input' ? 'f' : '';
    this.renderRecent();
    if (this.zone === 'recent' && !this.recent.length) this.zone = 'input';
    setF(this.recentEls, this.zone === 'recent' ? this.recentIdx : -1);
    for (var r = 0; r < this.rows.length; r++) {
      var row = this.rows[r];
      var active = this.zone === 'rows' && r === this.rowIdx;
      setF(row.cardEls, active ? row.col : -1);
      row.cardsEl.className = row.cardsEl.className.replace(/ ?\bact\b/, '') + (active ? ' act' : '');
      var w = 288,
        vis = Math.max(2, Math.floor(contentWidth() / w));
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
  key: function (k) {
    if (this.zone === 'input') {
      if (k === 13) {
        $('sBox').focus();
        return true;
      }
      if (k === 40 && (this.rows.length || this.recent.length)) {
        this.zone = this.rows.length ? 'rows' : 'recent';
        this.paint();
        return true;
      }
      if (k === 38) {
        topNav.focus();
        return true;
      }
      return true;
    }
    if (this.zone === 'recent') {
      if (k === 39) this.recentIdx = Math.min(this.recentEls.length - 1, this.recentIdx + 1);
      else if (k === 37) {
        if (this.recentIdx === 0) {
          topNav.focus();
          return true;
        }
        this.recentIdx--;
      } else if (k === 38) this.zone = 'input';
      else if (k === 13) {
        this.runRecent(this.recentIdx);
        return true;
      }
      this.paint();
      return true;
    }
    var row = this.rows[this.rowIdx];
    if (!row) {
      this.zone = 'input';
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
        topNav.focus();
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
        this.zone = 'input';
        this.paint();
      }
    } else if (k === 13) {
      var it = row.items[row.col];
      if (it) openItem(it);
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
      } else topNav.focus();
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
var settings = {
  idx: 0,
  els: [],
  defs: [],
  editing: false,
  editOriginal: null,
  enter: function (preserveEdit) {
    if (!preserveEdit) {
      this.editing = false;
      this.editOriginal = null;
    }
    var u = user() || {};
    $('setAcct').getElementsByClassName('em')[0].textContent = u.email || tx('connectedAccount');
    var prem = tx('freeAccount');
    if (u.premium_expire && String(u.premium_expire).indexOf('000') !== 0) {
      var d = new Date(u.premium_expire);
      if (d.getTime() > Date.now()) prem = tx('premiumUntil', d.toLocaleDateString());
    }
    $('setAcct').getElementsByClassName('pl')[0].textContent = prem;
    var langOpts = mediaLanguageOptions(),
      audioOpts = langOpts.slice(1);
    this.defs = [
      { head: tx('interfaceGroup') },
      {
        k: UI_LANG_KEY,
        lb: tx('interfaceLanguage'),
        opts: [
          ['en-US', tx('english')],
          ['pt-BR', tx('portugueseBrazil')]
        ],
        d: 'en-US'
      },
      { head: tx('maintenanceGroup') },
      { k: '__reload', lb: tx('reloadApp'), action: true },
      { head: tx('sourceGroup') },
      {
        k: 'preferredSourceQuality',
        lb: tx('preferredQuality'),
        opts: [
          ['Auto', tx('automatic')],
          ['4K', '4K'],
          ['1080p', '1080p'],
          ['720p', '720p'],
          ['SD', 'SD']
        ],
        d: 'Auto'
      },
      { head: tx('subtitlesGroup') },
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
      { k: 'subsLang', lb: tx('defaultLanguage'), opts: langOpts, d: 'por' },
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
        k: 'embSubsMode',
        lb: tx('embeddedSubtitles'),
        opts: [
          ['server', tx('extractRecommended')],
          ['native', tx('tvNative')]
        ],
        d: 'server'
      },
      { head: tx('audioGroup') },
      {
        k: 'enableDefaultAudioTrack',
        lb: tx('autoAudio'),
        opts: [
          ['true', tx('enabled')],
          ['false', tx('disabled')]
        ],
        d: 'false'
      },
      { k: 'defaultAudioTrack', lb: tx('defaultAudio'), opts: audioOpts, d: 'por' },
      { head: tx('playbackGroup') },
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
        k: 'bingeWatch',
        lb: tx('nextEpisode'),
        opts: [
          ['true', tx('enabled')],
          ['false', tx('disabled')]
        ],
        d: 'true'
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
      {
        k: 'scrubPreview',
        lb: tx('scrubPreview'),
        opts: [
          ['true', tx('enabled')],
          ['false', tx('disabled')]
        ],
        d: 'false'
      },
      { head: tx('addonsGroup') },
      { k: '__sync', lb: tx('syncAddons'), action: true },
      { head: tx('accountGroup') },
      { k: '__logout', lb: tx('signOut'), action: true }
    ];
    var host = $('setItems');
    host.innerHTML = '';
    this.els = [];
    this.fdefs = [];
    this.idx = 0;
    for (var i = 0; i < this.defs.length; i++) {
      var def = this.defs[i];
      if (def.head) {
        var hd = document.createElement('div');
        hd.className = 'setgrp';
        hd.textContent = def.head;
        host.appendChild(hd);
        continue;
      }
      var d = document.createElement('div');
      d.className = 'set' + (def.action ? ' act' : '');
      var l = document.createElement('div');
      l.className = 'lb';
      l.textContent = def.lb;
      d.appendChild(l);
      var v = document.createElement('div');
      v.className = 'vl';
      v.textContent = def.action ? '' : this.valLabel(def);
      d.appendChild(v);
      host.appendChild(d);
      this.els.push(d);
      this.fdefs.push(def);
    }
    this.paint();
    animIn($('setWrap'));
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
    if (def.k === UI_LANG_KEY) {
      var keep = this.idx;
      setUILanguage(def.opts[ci][0]);
      this.enter(true);
      this.idx = Math.min(keep, this.els.length - 1);
      this.paint();
      return true;
    }
    if (def.k === 'bingeWatch') lsRawSet('enableNextVideo', def.opts[ci][0]);
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
        this.enter();
        this.idx = Math.min(idx, this.els.length - 1);
      }
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
    this.idx = 0;
    this.paint();
  },
  paint: function () {
    setF(this.els, topNav.active ? -1 : this.idx);
    for (var c = 0; c < this.els.length; c++)
      this.els[c].className =
        this.els[c].className.replace(/ ?\bediting\b/, '') +
        (this.editing && c === this.idx ? ' editing' : '');
    if ($('setHint')) $('setHint').textContent = tx(this.editing ? 'settingsEditing' : 'settingsHint');
    var el = this.els[this.idx],
      y = 0;
    if (el && el.offsetTop > 620) y = el.offsetTop - 620;
    $('setInner').style.transform = 'translateY(-' + y + 'px)';
    $('setInner').style.webkitTransform = 'translateY(-' + y + 'px)';
  },
  key: function (k) {
    var def = this.fdefs[this.idx];
    if (this.editing) {
      if ((k === 37 || k === 39) && def && !def.action) {
        var changed = this.cycle(def, k === 39 ? 1 : -1);
        if (!changed && this.els[this.idx])
          this.els[this.idx].getElementsByClassName('vl')[0].textContent = this.valLabel(def);
      } else if (k === 13) this.finishEdit();
      this.paint();
      return true;
    }
    if (k === 40) this.idx = Math.min(this.els.length - 1, this.idx + 1);
    else if (k === 38) {
      if (this.idx > 0) this.idx--;
      else {
        topNav.focus();
        return true;
      }
    } else if (k === 37) {
      topNav.focus();
      return true;
    } else if (k === 13 && def) {
      if (def.action) {
        if (def.k === '__sync') this.syncNow();
        else if (def.k === '__reload') this.reloadNow();
        else if (def.k === '__logout') this.logout();
        return true;
      }
      this.startEdit();
      return true;
    }
    this.paint();
    return true;
  }
};
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
          self.toggleLanguage();
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
            if (e.keyCode === 13 || e.keyCode === 40) {
              e.preventDefault();
              e.stopPropagation();
              el.blur();
              self.zone = next;
              self.paint();
            } else if (e.keyCode === 461 || e.keyCode === 27) {
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
  toggleLanguage: function () {
    setUILanguage(UI_LANG === 'en-US' ? 'pt-BR' : 'en-US');
    this.setStatus(this.statusKey);
    this.paint();
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
    xhrJson('https://link.stremio.com/api/create', function (j) {
      if (self.pollGen !== gen) return;
      if (!j || !j.code) {
        self.started = false;
        self.setStatus('qrUnavailable');
        return;
      }
      self.qrCode = j.code;
      $('lgQrImg').src = j.qrcode;
      $('lgCode').textContent = j.code;
      self.setStatus('waitingPhone');
      self.schedulePoll(gen);
    });
  },
  schedulePoll: function (gen) {
    var self = this;
    if (this.suspended || !this.qrCode || this.poll || this.polling || gen !== this.pollGen) return;
    this.poll = setTimeout(function () {
      self.poll = null;
      self.pollOnce(gen);
    }, 2500);
  },
  pollOnce: function (gen) {
    if (this.suspended || this.polling || gen !== this.pollGen || !this.qrCode) return;
    this.polling = true;
    var self = this;
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
    postJson(API + '/api/login', { email: em, password: pw }, function (r) {
      var res = r && r.result;
      if (!res || !res.authKey) {
        $('lgErr').textContent = (r && r.error && r.error.message) || tx('signInFailed');
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
    if (email) email.className = 'lgin' + (this.zone === 'email' ? ' f' : '');
    if (pass) pass.className = 'lgin' + (this.zone === 'pass' ? ' f' : '');
    if (button) button.className = this.zone === 'btn' ? 'f' : '';
  },
  key: function (k) {
    if (this.zone === 'lang') {
      if (k === 37 || k === 39 || k === 13) this.toggleLanguage();
      else if (k === 40) {
        this.zone = 'email';
        this.paint();
      }
      return true;
    }
    if (k === 40) {
      this.zone = this.zone === 'email' ? 'pass' : this.zone === 'pass' ? 'btn' : 'btn';
      this.paint();
    } else if (k === 38) {
      this.zone = this.zone === 'btn' ? 'pass' : this.zone === 'pass' ? 'email' : 'lang';
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
    i = pointerIndex(target, streamsUI.chipEls);
    if (i >= 0) {
      streamsUI.zone = 'chips';
      streamsUI.chipIdx = i;
      streamsUI.paint();
      if (activate) {
        streamsUI.filter = streamsUI.chips[i];
        streamsUI.idx = 0;
        streamsUI.rebuild();
      }
      return true;
    }
    i = pointerIndex(target, streamsUI.els);
    if (i < 0) return false;
    streamsUI.zone = 'list';
    streamsUI.idx = i;
    streamsUI.paint();
    if (activate) streamsUI.choose();
    return true;
  }
  i = pointerIndex(target, chips);
  if (i >= 0) {
    if (activate) topNav.switchTo(i);
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
  if (SCR === 'set') {
    i = pointerIndex(target, settings.els);
    if (i >= 0) {
      if (!settings.editing || settings.idx === i) {
        settings.idx = i;
        settings.paint();
      }
      if (activate) {
        def = settings.fdefs[i];
        if (def.action) {
          if (def.k === '__sync') settings.syncNow();
          else if (def.k === '__reload') settings.reloadNow();
          else if (def.k === '__logout') settings.logout();
        } else if (!settings.editing) settings.startEdit();
        else if (settings.idx === i) {
          var rerendered = settings.cycle(def, 1);
          if (!rerendered)
            settings.els[settings.idx].getElementsByClassName('vl')[0].textContent = settings.valLabel(def);
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
  if (lsRaw('bgTrailer', 'false') !== 'true') return; /* Off by default on the low-memory 2019 TV */
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
window.__STREMIO_PHASE__('M3');
on(
  document,
  'keydown',
  function (e) {
    var k = e.keyCode;
    idleTouch();
    var a = document.activeElement;
    if (a === $('sBox') || a === $('lgEmail') || a === $('lgPass'))
      return; /* typing: inputs manage themselves */
    if (episodeJump.open) {
      e.preventDefault();
      e.stopPropagation();
      if (k === 461 || k === 8 || k === 27) episodeJump.close();
      else episodeJump.key(k);
      return;
    }
    if (k === 461 || k === 8 || k === 27) {
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
      if (fi) {
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

window.__STREMIO_PHASE__('M4');
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
function boot() {
  try {
    window.__STREMIO_PHASE__('B0');
    if (!user()) {
      window.__STREMIO_PHASE__('L0');
      showScr('login');
      login.enter();
      window.__STREMIO_BOOT_DONE__ = true;
      window.__STREMIO_PHASE__('READY');
      $('boot').style.display = 'none';
      return;
    }
    var h = location.hash || '';
    var m = h.match(/^#detail\/([^\/]+)\/([^\/]+)(?:\/(.+))?$/);
    var ms = h.match(/^#sim\/([^\/]+)\/([^\/]+)$/);
    showScr('home');
    home.enter();
    if (m) {
      goScr('detail', { type: m[1], id: m[2], vid: m[3] ? decodeURIComponent(m[3]) : null });
    } else if (ms) {
      goScr('sim', { type: ms[1], id: ms[2] });
    }
    try {
      history.replaceState(history.state, '', '/beta');
    } catch (e) {}
    setTimeout(function () {
      window.__STREMIO_BOOT_DONE__ = true;
      window.__STREMIO_PHASE__('READY');
      $('boot').style.display = 'none';
    }, 120);
    /* silent account syncs: library (Continue Watching / watched) + addon collection */
    setTimeout(function () {
      pullLib(function () {
        invalidateBoards();
        if (SCR === 'home' || SCR === 'lib') refreshCurBoard();
      });
    }, 700);
    setTimeout(function () {
      syncAddons(function (changed) {
        if (changed) {
          toast(tx('addonsUpdated'));
          buildHomeRows(true);
        }
      });
    }, 900);
    /* the long-press menu has no visible entry point: explain it once, on Home */
    setTimeout(function () {
      if (lsRaw('holdOkHintShown', '') || SCR !== 'home' || streamsUI.open || cwMenu.open) return;
      lsRawSet('holdOkHintShown', '1');
      toast(tx('holdOkHint'), 6000);
    }, 4000);
  } catch (error) {
    window.__STREMIO_BOOT_ERROR__((error && error.message) || String(error), 'BOOT');
  }
}
/* This script is the last parser-blocking element in body, so every UI node already
   exists. Boot synchronously: old webOS WebAppManager builds can miss a late
   DOMContentLoaded listener after navigating from the packaged bootstrap to localhost. */
window.__STREMIO_PHASE__('B_CALL');
boot();
})();
}catch(error){window.__STREMIO_BOOT_ERROR__(error&&error.message||String(error),'TOP');}
