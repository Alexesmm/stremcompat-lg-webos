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
  timeEl.textContent = fmt(seekTarget) + ' / ' + fmt(v.duration);
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
    saveProgress();
    pushLib(true);
  } catch (e) {}
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
