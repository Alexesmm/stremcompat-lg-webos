// Board engine shared by Home and Library: hero plus horizontally scrolling rows.
/* titles too long for two lines at the hero size use a smaller one (board.css) */
function heroTitleClass(name) {
  return String(name || '').length > 32 ? 'long' : '';
}
/* the hero's info line: 109 min   2026   7.8 [IMDb] */
function heroMetaHtml(m) {
  var html = '';
  function add(text) {
    if (text) html += '<span>' + esc(text) + '</span>';
  }
  add(m.runtime);
  add(m.releaseInfo || m.year);
  if (m.imdbRating) html += '<span>' + esc(m.imdbRating) + '<b class="imdb">IMDb</b></span>';
  return html;
}
window.__STREMIO_HERO_META__ = heroMetaHtml;
/* ================= board engine (Home / Discover / Library share one hero+rows) ================= */
function makeBoard(loader) {
  return {
    rows: [],
    rowIdx: 0,
    built: false,
    heroT: null,
    loader: loader,
    enter: function () {
      var fresh = !this.built;
      if (fresh) {
        this.built = true;
        this.loader(this, false);
      }
      this.mount();
      if (home !== this) unloadBoard(home);
      if (disc !== this) unloadBoard(disc);
      if (lib !== this) unloadBoard(lib);
      this._act = null;
      if (!fresh) this.reveal();
      this.paint(true);
      this.hero();
    },
    rebuild: function () {
      this.built = true;
      this.loader(this, true);
      this.mount();
      this._act = null;
      if (curBoard() === this) {
        this.paint(true);
        this.hero();
      }
    },
    mount: function () {
      var host = $('rows');
      host.innerHTML = '';
      for (var i = 0; i < this.rows.length; i++) host.appendChild(this.rows[i].el);
      paintBoardMessage(this);
    },
    /* replay the staggered entrance every time the board is (re)shown, not just first build */
    reveal: function () {
      var rows = this.rows,
        i;
      for (i = 0; i < rows.length; i++) {
        if (rows[i].el.style.display !== 'none') rows[i].el.className = 'row';
      }
      void $('rows').offsetHeight;
      var d = 0;
      for (i = 0; i < rows.length; i++) {
        if (rows[i].el.style.display === 'none') continue;
        (function (el, delay) {
          setTimeout(function () {
            el.className = 'row in';
          }, delay);
        })(rows[i].el, d);
        d += 70;
      }
    },
    paintRow: function (r, active) {
      var row = this.rows[r];
      if (!row || !row.cardEls) return;
      setFRow(row, active ? row.col : -1);
      this.slideRow(row);
    },
    rowReady: function (row) {
      return !!(row && row.items && row.items.length && row.el.style.display !== 'none');
    },
    findRow: function (from, dir) {
      for (var i = from; i >= 0 && i < this.rows.length; i += dir) if (this.rowReady(this.rows[i])) return i;
      return -1;
    },
    settleRow: function () {
      if (this.rowReady(this.rows[this.rowIdx])) return this.rowIdx;
      var next = this.findRow(this.rowIdx, 1);
      if (next < 0) next = this.findRow(this.rowIdx - 1, -1);
      if (next >= 0) this.rowIdx = next;
      return next;
    },
    paint: function (all) {
      /* O(2 rows) per move — full repaint only when asked */
      if (this.rowIdx >= this.rows.length) this.rowIdx = Math.max(0, this.rows.length - 1);
      var focusOn = curBoard() === this && !topNav.active;
      var settled = this.settleRow();
      var act = focusOn && settled >= 0 ? this.rowIdx : -1;
      if (all || this._act == null) {
        for (var r = 0; r < this.rows.length; r++) this.paintRow(r, r === act);
      } else if (this._act !== act) {
        this.paintRow(this._act, false);
        if (act >= 0) this.paintRow(act, true);
      } else if (act >= 0) this.slideRow(this.rows[act]);
      this._act = act;
      /* rows are the only children of #rows and hidden rows take no space, so the
         focused row's offsetTop equals the height of the rows above it */
      var cur = this.rows[this.rowIdx];
      /* the sidebar taking the focus keeps the rows where they are */
      var t = curBoard() === this && cur ? cur.el.offsetTop : 0;
      $('rows').style.transform = 'translateY(-' + t + 'px)';
      $('rows').style.webkitTransform = 'translateY(-' + t + 'px)';
      virtualizeBoard(this, this.rowIdx, true);
      var self = this;
      if (this._vt) clearTimeout(this._vt);
      this._vt = setTimeout(function () {
        virtualizeBoard(self, self.rowIdx, false);
      }, 260);
    },
    slideRow: function (row) {
      /* the card step is fixed per row: measure it once instead of on every key press */
      var w = row._step || (row.wide ? 454 : 288);
      if (!row._step && row.cardEls && row.cardEls.length > 1) {
        var measured = row.cardEls[1].offsetLeft - row.cardEls[0].offsetLeft;
        if (measured > 0) w = row._step = measured;
      }
      var vis = Math.max(2, Math.floor(contentWidth() / w));
      var off = Math.max(0, row.col - (vis - 2)) * w;
      if (row.col <= 0) off = 0;
      row.cardsEl.style.transform = 'translateX(-' + off + 'px)';
      row.cardsEl.style.webkitTransform = 'translateX(-' + off + 'px)';
    },
    moveH: function (dir) {
      var row = this.rows[this.rowIdx];
      if (!row) return;
      var st = hstep(dir, row.cardsEl);
      var old = row.col;
      row.col = dir > 0 ? Math.min(row.items.length - 1, row.col + st) : Math.max(0, row.col - st);
      if (row.col === old) return;
      setFRow(row, row.col);
      this.slideRow(row);
      this.hero();
    },
    hero: function () {
      var self = this;
      if (this.heroT) clearTimeout(this.heroT);
      this.heroT = setTimeout(function () {
        self.heroApply();
      }, 260);
      prewarmNeighbors(this.rows[this.rowIdx]);
    },
    heroApply: function () {
      if (curBoard() !== this) return; /* a debounced hero must not paint after we left this board */
      var it = this.focusedItem();
      if (!it) {
        return;
      }
      var lg = $('heroLogo'),
        tt = $('heroTitle');
      var self = this;
      /* NEVER flash plain text: keep the previous title until the new item's logo either loads
       (show logo) or fails (only then show text). Logos are prewarmed so this is instant. */
      if (isImdb(it.id)) {
        var lu = 'https://images.metahub.space/logo/medium/' + it.id + '/img';
        var im = new Image();
        im.onload = function () {
          if (self.focusedItem() === it) {
            lg.src = lu;
            lg.style.display = 'block';
            tt.style.display = 'none';
          }
        };
        im.onerror = function () {
          if (self.focusedItem() === it) {
            tt.textContent = it.name || '';
            tt.className = heroTitleClass(it.name);
            tt.style.display = '';
            lg.style.display = 'none';
          }
        };
        im.src = lu;
      } else {
        tt.textContent = it.name || '';
        tt.className = heroTitleClass(it.name);
        tt.style.display = '';
        lg.style.display = 'none';
      }
      $('heroMeta').innerHTML = it.metaHtml || '';
      $('heroDesc').textContent = it.description || '';
      $('heroCast').textContent = it.castLine || '';
      setBg(bgMid(it));
      if (!it.description && it.id) {
        getMeta(it.type, it.id, function (m) {
          if (!m) return;
          it.description = m.description || '';
          it.metaHtml = heroMetaHtml(m);
          it.castLine = m.cast && m.cast.length ? m.cast.slice(0, 3).join(', ') : '';
          if (self.focusedItem() === it) {
            $('heroDesc').textContent = it.description;
            $('heroMeta').innerHTML = it.metaHtml;
            $('heroCast').textContent = it.castLine;
          }
        });
      }
    },
    focusedItem: function () {
      if (this.settleRow() < 0) return null;
      var row = this.rows[this.rowIdx];
      return row.items[row.col] || null;
    },
    key: function (k) {
      if (this.settleRow() < 0) {
        if (k === 37) topNav.focus();
        else if (k === 13 && this.empty) refreshCurBoard();
        return true;
      }
      var row = this.rows[this.rowIdx];
      if (k === 39) this.moveH(1);
      else if (k === 37) {
        if (row.col === 0) topNav.focus();
        else this.moveH(-1);
      } else if (k === 40) {
        var next = this.findRow(this.rowIdx + 1, 1);
        if (next >= 0) {
          this.rowIdx = next;
          this.paint();
          this.hero();
        }
      } else if (k === 38) {
        var prev = this.findRow(this.rowIdx - 1, -1);
        if (prev >= 0) {
          this.rowIdx = prev;
          this.paint();
          this.hero();
        }
      } else if (k === 13) {
        var it = this.focusedItem();
        if (it) openItem(it);
      }
      return true;
    }
  };
}
