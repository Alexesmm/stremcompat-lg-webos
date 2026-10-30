// Sidebar navigation.
/* ================= top nav — centered; moving Left/Right auto-loads each page ================= */
function curBoard() {
  return SCR === 'home' ? home : SCR === 'lib' ? lib : null;
}
function resetBoardPosition(board) {
  board.rowIdx = 0;
  for (var i = 0; i < board.rows.length; i++) board.rows[i].col = 0;
  board._act = null;
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
    if (i === this.idx && curBoard()) {
      resetBoardPosition(curBoard());
      this.enterContent();
    } else this.switchTo(i);
  },
  /* OK on a section while a title page is open goes to that section, e.g. Home from a
     series opened on Home, instead of staying on the series */
  key: function (k) {
    if (k === 38) this.switchTo(this.idx - 1);
    else if (k === 40) this.switchTo(this.idx + 1);
    else if (k === 13 && (SCR === 'detail' || SCR === 'sim')) this.switchTo(this.idx);
    else if (k === 13 && curBoard()) this.chooseSection(this.idx);
    else if (k === 39 || k === 13) this.enterContent();
    return true;
  }
};
