// Remote key dispatch, long-press OK and the Back button.
function currentFocusedItem() {
  if (topNav.active) return null;
  var b = curBoard();
  if (b) return b.focusedItem();
  if (SCR === 'disc' && disc.zone === 'grid' && !disc.filterOpen) return disc.focusedItem();
  if (SCR === 'sim') return similar.items[similar.idx] || null;
  /* the focused season of a series page, to mark all its episodes */
  if (
    SCR === 'detail' &&
    detail.type === 'series' &&
    detail.zone === 'seasons' &&
    detail.episodeMode !== 'continuous'
  ) {
    var se = detail.seasons && detail.seasons[detail.seasonIdx];
    if (!se || !se.eps || !se.eps.length) return null;
    var vids = [],
      all = true;
    for (var si = 0; si < se.eps.length; si++) {
      vids.push(se.eps[si].id);
      if (!detail.watchedMap[se.eps[si].id]) all = false;
    }
    return {
      season: true,
      type: 'series',
      id: detail.id,
      name: (detail.meta && detail.meta.name) || '',
      seasonN: se.n,
      vids: vids,
      watched: all
    };
  }
  /* the focused episode of a series page, for its watched toggle */
  if (SCR === 'detail' && detail.type === 'series' && detail.zone === 'eps') {
    var ep = detail.currentEpisode();
    return ep
      ? {
          episode: true,
          type: 'series',
          id: detail.id,
          videoId: ep.id,
          name: ep.name || ep.title || (detail.meta && detail.meta.name) || '',
          watched: !!detail.watchedMap[ep.id]
        }
      : null;
  }
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
      if (h.item.episode || h.item.season) detail.key(13);
      else if (SCR === 'sim') goScr('detail', { type: h.item.type, id: h.item.id, vid: null });
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
