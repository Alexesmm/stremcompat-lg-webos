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
