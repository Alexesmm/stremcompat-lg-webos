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
