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
      row.el.style.display = 'none';
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
