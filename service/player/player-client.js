// Interface and player strings (en-US, pt-BR), shared by both bundles.
/* Adding a language means adding one block here: the interface reads it with tx(),
   the player through playerText() in src/player/strings.js. */
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
    removedFromCw: 'Removed from Continue watching',
    historyGroup: 'History',
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
    tryingNextSource: 'Trying the next source…',
    noOtherSource: 'No other source to try',
    catalogsFailed: 'No catalog could be loaded. Check the connection and your addons.',
    recommendedSource: 'Recommended for this TV',
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
    diagStreaming: 'Streaming server: {0}',
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
    removedFromCw: 'Removido de Continuar assistindo',
    historyGroup: 'Histórico',
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
    tryingNextSource: 'Tentando a próxima fonte…',
    noOtherSource: 'Não há outra fonte para tentar',
    catalogsFailed: 'Nenhum catálogo pôde ser carregado. Verifique a conexão e seus addons.',
    recommendedSource: 'Recomendada para esta TV',
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
    diagStreaming: 'Servidor de streaming: {0}',
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
  }
};
function normalizeUILanguage(value) {
  return value === 'pt-BR' ? 'pt-BR' : 'en-US';
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
function streamAddonsIn(a, type) {
  var out = [];
  a = a || [];
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
    out.push({ name: m.name || 'Addon', base: addonBase(a[i]), query: addonQuery(a[i]) });
  }
  return out;
}
function streamUrl(ad, type, vid) {
  return ad.base + '/stream/' + type + '/' + encodeURIComponent(vid) + '.json' + (ad.query || '');
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
function armStartupWatch() {
  if (startupWatch) clearTimeout(startupWatch);
  startupWatch = setTimeout(function () {
    if (!mediaUsable && !retryStartup('timeout') && ID && BACK.indexOf('beta#detail/') === 0)
      showSourceFailed();
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
  if (!ak || !it || !it._id || (!force && n - lastPush < 60000)) {
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
  if (!v.duration || !ID || sessionDone) return;
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
setInterval(function () {
  if (!v.paused) {
    saveProgress();
    pushLib(false);
  }
}, 10000);
v.addEventListener('pause', function () {
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
  if (!v.duration) return;
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
      finishSession(true);
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
/* elapsed / total, then the time left */
function paintTime(at) {
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
  if (seekTarget >= 0) {
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
function tryAnotherSource() {
  try {
    localStorage.setItem(
      'tvretry_' + ID + '_' + (VID || ID),
      JSON.stringify({ at: Date.now(), addon: ADDON, text: SNAME })
    );
  } catch (e) {}
  location.replace('/' + (BACK || 'beta'));
}
v.addEventListener('error', function () {
  if (retryStartup('error')) return;
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
  paintTime(seekTarget);
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
    saveTitlePref('sub', 'off');
  } else if (it.k === 'ext') {
    setExtSub(it.u);
    for (var x = 0; x < extSubs.length; x++) if (extSubs[x].u === it.u) saveTitlePref('sub', extSubs[x].lang);
  } else if (it.k === 'emb') setEmbSub(it.idx, it.ti);
  else if (it.k === 'aud') {
    try {
      for (var j = 0; j < v.audioTracks.length; j++) v.audioTracks[j].enabled = j === it.idx;
      var al = (v.audioTracks[it.idx] && v.audioTracks[it.idx].language) || '';
      if (al) saveTitlePref('aud', al.toLowerCase());
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
    location.replace(SIMHREF);
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
  var list = [];
  try {
    list = JSON.parse(localStorage.getItem('addons') || '[]');
  } catch (e) {}
  var ads = streamAddonsIn(list, TYPE || 'series');
  for (var i = 0; i < ads.length; i++)
    xhr('/addon?u=' + encodeURIComponent(streamUrl(ads[i], TYPE || 'series', NEXTVID)), function () {});
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
        seek((v.duration * digit) / 10 - (seekTarget >= 0 ? seekTarget : v.currentTime));
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
  }
};
