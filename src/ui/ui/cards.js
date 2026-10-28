// Card and row construction, with texture virtualization for low-memory TVs.
/* ---- image virtualization: this TV has ~38MB free RAM; keeping EVERY row's decoded
   posters pinned (Discover = 200+) is what caused blockiness then OOM crashes. Only rows
   near the cursor keep real textures; far rows hold a 1px placeholder and reload from the
   HTTP cache when you scroll back. ---- */
var BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
function setRowLoaded(row, on) {
  if (!row || !row.cardsEl) return;
  if (row._loaded === on && on !== true) return;
  row._loaded = on;
  var imgs = row.cardsEl.getElementsByTagName('img');
  for (var i = imgs.length - 1; i >= 0; i--) {
    var im = imgs[i];
    if (!on) {
      if (im.src && im.src !== BLANK_IMG) {
        im._full = im.src;
        im.src = BLANK_IMG;
      }
    } else if (im._full) {
      im.src = im._full;
      im._full = null;
    }
  }
}
function virtualizeBoard(b, center, fast) {
  for (var r = 0; r < b.rows.length; r++) {
    var d = Math.abs(r - center);
    var radius = TV_PROFILE.lowMemory ? (fast ? 0 : 1) : fast ? 1 : 2;
    if (d <= radius) setRowLoaded(b.rows[r], true);
    else if (d > radius) setRowLoaded(b.rows[r], false);
  }
}
function unloadBoard(b) {
  if (!b) return;
  for (var r = 0; r < b.rows.length; r++) setRowLoaded(b.rows[r], false);
}
function makeCard(it, wide, label, eager) {
  var d = document.createElement('div');
  d.className = 'card' + (wide ? ' wide' : '');
  /* dark placeholder only — the title text is HIDDEN until/unless the art fails to load,
     so scrolling never flashes text before the poster paints (that was the glitch) */
  var nm = document.createElement('div');
  nm.className = 'nm';
  nm.textContent = it.name || it.id;
  nm.style.display = 'none';
  d.appendChild(nm);
  var src = wide ? bgSmall(it) : posterOf(it);
  if (src) {
    var img = new Image();
    img.onload = function () {
      d.insertBefore(img, d.firstChild);
      img.onload = null;
    };
    img.onerror = function () {
      if (img.src !== BLANK_IMG) nm.style.display = 'block';
    };
    /* LAZY by default: rows away from the cursor never even START their downloads/decodes
       (the boot flood of ~100 posters was part of the slow/unstable startup) */
    if (eager) img.src = src;
    else {
      img._full = src;
      img.src = BLANK_IMG;
      d.insertBefore(img, d.firstChild);
      img.onload = null;
    }
  } else nm.style.display = 'block';
  if (label && !wide) {
    var tl = document.createElement('div');
    tl.className = 'titlelabel';
    tl.textContent = it.name || '';
    d.appendChild(tl);
  }
  if (!wide && itemWatched(it)) {
    var wb = document.createElement('div');
    wb.className = 'wbadge';
    wb.innerHTML = ICON.check;
    d.appendChild(wb);
  }
  if (wide) {
    var lb = document.createElement('div');
    lb.className = 'cwlabel';
    var epTxt = '';
    if (it.videoId && it.videoId.indexOf(':') > 0) {
      var pp = it.videoId.split(':');
      epTxt = '  S' + pp[pp.length - 2] + ' E' + pp[pp.length - 1];
    }
    lb.textContent = (it.name || '') + epTxt;
    d.appendChild(lb);
    if (it.progress > 0) {
      var pb = document.createElement('div');
      pb.className = 'pbar';
      var fill = document.createElement('div');
      fill.style.width = Math.min(100, Math.round(it.progress * 100)) + '%';
      pb.appendChild(fill);
      d.appendChild(pb);
    }
  }
  return d;
}

/* Static grey cards the size of real ones while a catalog loads, so the board does not
   jump when it arrives. No images and no animation: nothing to decode or repaint. */
function placeholderCards(row) {
  var n = Math.min(8, Math.ceil(contentWidth() / (row.wide ? 454 : 288)) + 1);
  for (var i = 0; i < n; i++) {
    var c = document.createElement('div');
    c.className = 'card ph' + (row.wide ? ' wide' : '');
    row.cardsEl.appendChild(c);
  }
  row.el.className = 'row in';
}
function buildRow(title, items, wide, label, eager) {
  var row = { title: title, items: items, col: 0, wide: !!wide };
  var el = document.createElement('div');
  el.className = 'row';
  var tt = document.createElement('div');
  tt.className = 'rowtitle';
  tt.textContent = title;
  el.appendChild(tt);
  var cards = document.createElement('div');
  cards.className = 'cards';
  el.appendChild(cards);
  row.el = el;
  row.cardsEl = cards;
  row.cardEls = [];
  for (var i = 0; i < items.length; i++) {
    var c = makeCard(items[i], wide, label, eager);
    cards.appendChild(c);
    row.cardEls.push(c);
  }
  return row;
}
