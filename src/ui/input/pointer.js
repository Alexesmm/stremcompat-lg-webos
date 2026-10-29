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
          else settings.runAction(def.k);
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
