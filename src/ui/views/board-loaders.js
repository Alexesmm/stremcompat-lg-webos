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
/* generic catalog-backed board loader (rows fill in asynchronously, cache-first) */
function loadCatalogRows(board, defs, includeCW, keepFocus) {
  var oldRow = board.rowIdx,
    oldCols = [],
    loadGen = (board._loadGen || 0) + 1;
  board._loadGen = loadGen;
  board.empty = false;
  var waiting = defs.length,
    started = Date.now();
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
      var row = buildRow(def.title, [], false);
      board.rows.push(row);
      /* only the rows that start on screen get placeholders; a rebuild keeps its rows */
      if (!keepFocus && di < 3) placeholderCards(row);
      else row.el.style.display = 'none';
      getCatalogUrl(def.url, def.key, def.type, function (items) {
        if (board._loadGen !== loadGen) return; /* ignore callbacks from a superseded rebuild */
        if (!row.answered) {
          row.answered = true;
          waiting--;
          /* shown by Settings > Diagnostics */
          if (!waiting && board === home) window.__STREMIO_HOME_LOAD_MS__ = Date.now() - started;
        }
        row.items = items.slice(0);
        row.cardsEl.innerHTML = '';
        row.cardEls = [];
        for (var i = 0; i < items.length; i++) {
          var cd = makeCard(items[i], false, false, false);
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
