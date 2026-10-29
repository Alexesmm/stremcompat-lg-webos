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
    seekAbs = true;
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
