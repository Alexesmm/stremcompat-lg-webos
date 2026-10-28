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
  /* the side menu follows the section on screen, also when Back returns to it */
  var section = chipTarget.indexOf(name);
  if (section >= 0) topNav.idx = section;
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
      topNav.idx = 1;
      search.reset();
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
  if (topNav.active) bodyAdd('navopen');
  else bodyRemove('navopen');
  for (var i = 0; i < chips.length; i++) {
    var t = chipTarget[i];
    var cur = t === SCR || (t === 'home' && (SCR === 'detail' || SCR === 'sim'));
    var f = topNav.active && i === topNav.idx;
    chips[i].className = 'chip' + (cur ? ' cur' : '') + (f ? ' f' : '');
  }
}
