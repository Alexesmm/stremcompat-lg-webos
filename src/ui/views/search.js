// Search screen: on-screen keyboard, live results and recent searches.
/* Typing with the remote is slow, so the last searches stay one key away. */
var RECENT_SEARCH_KEY = 'recentSearches',
  RECENT_SEARCH_MAX = 8;
function recentSearches() {
  var list = lsJson(RECENT_SEARCH_KEY);
  return Object.prototype.toString.call(list) === '[object Array]' ? list : [];
}
function rememberSearch(q) {
  q = String(q || '').replace(/^\s+|\s+$/g, '');
  if (!q) return;
  var list = recentSearches(),
    out = [q];
  for (var i = 0; i < list.length && out.length < RECENT_SEARCH_MAX; i++)
    if (typeof list[i] === 'string' && list[i].toLowerCase() !== q.toLowerCase()) out.push(list[i]);
  lsSet(RECENT_SEARCH_KEY, out);
}
/* The on-screen keyboard replaces the system one (slow, covers the screen and closed
   after every key on some webOS builds): 6 x 6 letters and digits, then space, delete
   and clear across two columns each. The system keyboard stays one key up, on the box. */
var SEARCH_KEYS = 'abcdefghijklmnopqrstuvwxyz1234567890'.split('').concat(['space', 'del', 'clear']);
function searchKeyPos(i) {
  return i < 36 ? { r: Math.floor(i / 6), c: i % 6 } : { r: 6, c: (i - 36) * 2 };
}
function searchKeyAt(r, c) {
  return r < 6 ? r * 6 + c : 36 + Math.min(2, Math.floor(c / 2));
}
/* ================= SEARCH ================= */
var search = {
  zone: 'keys',
  rows: [],
  rowIdx: 0,
  keyIdx: 0,
  keyEls: [],
  text: '',
  liveT: null,
  recent: [],
  recentEls: [],
  recentIdx: 0,
  recentSig: null,
  q: '',
  gen: 0,
  previewId: '',
  previewT: null,
  requests: [],
  wire: function () {
    var self = this;
    var box = $('sBox');
    if (!box) return;
    if (!box._wired) {
      box._wired = true;
      on(
        box,
        'keydown',
        function (e) {
          if (e.keyCode === 13) {
            e.preventDefault();
            e.stopPropagation();
            $('sBox').blur();
            self.text = $('sBox').value;
            self.run(self.text);
          } else if (e.keyCode === 40) {
            e.preventDefault();
            e.stopPropagation();
            $('sBox').blur();
            self.text = $('sBox').value;
            self.zone = 'keys';
            self.paint();
          } else if (e.keyCode === 461 || e.keyCode === 27) {
            e.preventDefault();
            e.stopPropagation();
            $('sBox').blur();
            self.paint();
          }
        },
        true
      );
    }
    if (!this.keyEls.length) {
      var host = $('sKeys');
      for (var i = 0; i < SEARCH_KEYS.length; i++) {
        var el = document.createElement('div');
        el.className = 'skey' + (i >= 36 ? ' wide' : '');
        host.appendChild(el);
        this.keyEls.push(el);
      }
    }
    this.labelKeys();
  },
  labelKeys: function () {
    for (var i = 0; i < this.keyEls.length; i++) {
      var k = SEARCH_KEYS[i];
      this.keyEls[i].textContent =
        k === 'space' ? tx('keySpace') : k === 'del' ? tx('keyDelete') : k === 'clear' ? tx('keyClear') : k;
    }
  },
  enter: function (p) {
    this.wire();
    this.zone = 'keys';
    /* Back from a result returns to that result, not to the keyboard */
    if (p && p.zone === 'rows' && this.rows.length) {
      this.zone = 'rows';
      this.rowIdx = Math.max(0, Math.min(p.rowIdx || 0, this.rows.length - 1));
    }
    this.paint();
    animIn($('sWrap'));
  },
  enterNav: function () {
    this.wire();
    this.paint();
    animIn($('sWrap'));
  } /* shown but top nav keeps focus */,
  enterInput: function () {
    this.zone = 'keys';
    this.paint();
  } /* nav handed focus down to the keyboard */,
  /* Leaving Search for another section releases its results and decoded posters; the
     recent searches bring a query back with one key. */
  reset: function () {
    if (this.liveT) clearTimeout(this.liveT);
    this.liveT = null;
    this.clearResults();
    this.text = '';
    $('sBox').value = '';
    this.zone = 'keys';
    this.keyIdx = 0;
    this.recentSig = null;
    $('sHint').textContent = tx('searchHint');
    this.preview(null);
  },
  clearResults: function () {
    this.abort();
    ++this.gen;
    unloadBoard(this);
    $('sRows').innerHTML = '';
    this.rows = [];
    this.rowIdx = 0;
    this.q = '';
  },
  abort: function () {
    for (var rq = 0; rq < this.requests.length; rq++)
      if (this.requests[rq] && this.requests[rq].abort)
        try {
          this.requests[rq].abort();
        } catch (e) {}
    this.requests = [];
  },
  press: function (k) {
    if (k === 'space') {
      if (this.text && this.text.charAt(this.text.length - 1) !== ' ') this.text += ' ';
    } else if (k === 'del') this.text = this.text.slice(0, -1);
    else if (k === 'clear') this.text = '';
    else if (this.text.length < 60) this.text += k;
    $('sBox').value = this.text;
    this.scheduleLive();
  },
  /* results follow the typing after a short pause; one letter or none shows recents again */
  scheduleLive: function () {
    var self = this;
    if (this.liveT) clearTimeout(this.liveT);
    this.liveT = null;
    var q = this.text.replace(/^\s+|\s+$/g, '');
    if (q.length < 2) {
      if (this.rows.length || this.q) this.clearResults();
      $('sHint').textContent = tx('searchHint');
      this.paint();
      return;
    }
    this.liveT = setTimeout(function () {
      self.liveT = null;
      if (SCR === 'search') self.run(q, true);
    }, 650);
  },
  /* live: typed on the on-screen keyboard, remembered only once a result is opened */
  run: function (q, live) {
    q = String(q || '').replace(/^\s+|\s+$/g, '');
    if (!q || q === this.q) return;
    this.clearResults();
    this.q = q;
    if (!live) rememberSearch(q);
    var gen = this.gen,
      host = $('sRows'),
      self = this,
      got = 0;
    $('sHint').textContent = tx('searching');
    this.paint();
    function add(title, items) {
      got++;
      if (self.gen !== gen || self.q !== q) return;
      if (items && items.length) {
        var slim = [];
        for (var i = 0; i < Math.min(items.length, 20); i++) {
          var m = items[i];
          slim.push({
            id: m.id,
            type: m.type,
            name: m.name,
            poster: m.poster,
            background: m.background,
            logo: m.logo,
            description: m.description,
            releaseInfo: m.releaseInfo,
            year: m.year,
            runtime: m.runtime,
            imdbRating: m.imdbRating
          });
        }
        var row = buildRow(title, slim, false, true, false);
        row.el.className = 'row in';
        self.rows.push(row);
        host.appendChild(row.el);
      }
      if (got >= 2) {
        $('sHint').textContent = '';
        if (!self.rows.length) host.innerHTML = emptyState(tx('noResults', q), tx('noResultsHint'));
        /* a submitted query moves to the results; live typing keeps the keyboard */
        if (self.rows.length && self.zone === 'input') self.zone = 'rows';
        self.paint();
      }
    }
    this.requests.push(
      xhrJson(CIN + '/catalog/movie/top/search=' + encodeURIComponent(q) + '.json', function (j) {
        add(tx('movies'), (j && j.metas) || []);
      })
    );
    this.requests.push(
      xhrJson(CIN + '/catalog/series/top/search=' + encodeURIComponent(q) + '.json', function (j) {
        add(tx('series'), (j && j.metas) || []);
      })
    );
  },
  preview: function (it) {
    var box = $('sPreview');
    if (!box) return;
    if (this.previewT) {
      clearTimeout(this.previewT);
      this.previewT = null;
    }
    if (!it || this.zone !== 'rows') {
      box.style.display = 'none';
      this.previewId = '';
      return;
    }
    box.style.display = 'block';
    var key = it.type + ':' + it.id;
    this.previewId = key;
    $('spTitle').textContent = it.name || '';
    $('spMeta').textContent = [
      it.releaseInfo || it.year,
      it.runtime,
      it.imdbRating ? 'IMDb ' + it.imdbRating : ''
    ]
      .join('   ')
      .replace(/\s+/g, ' ');
    $('spDesc').textContent = it.description || '';
    if (!it.description || !it.runtime) {
      var self = this;
      this.previewT = setTimeout(function () {
        self.previewT = null;
        if (self.previewId !== key) return;
        getMeta(it.type, it.id, function (m) {
          if (!m || self.previewId !== key) return;
          it.description = m.description || it.description || '';
          it.runtime = m.runtime || it.runtime || '';
          it.releaseInfo = m.releaseInfo || it.releaseInfo || '';
          it.year = m.year || it.year || '';
          it.imdbRating = m.imdbRating || it.imdbRating || '';
          $('spTitle').textContent = m.name || it.name || '';
          $('spMeta').textContent = [
            it.releaseInfo || it.year,
            it.runtime,
            it.imdbRating ? 'IMDb ' + it.imdbRating : ''
          ]
            .join('   ')
            .replace(/\s+/g, ' ');
          $('spDesc').textContent = it.description;
        });
      }, 220);
    }
  },
  /* recent searches are offered while there are no results; the last chip clears them */
  renderRecent: function () {
    var list = this.rows.length || this.q ? [] : recentSearches(),
      sig = UI_LANG + '\n' + list.join('\n');
    if (sig === this.recentSig) return;
    this.recentSig = sig;
    var host = $('sRecent');
    host.innerHTML = '';
    this.recent = list;
    this.recentEls = [];
    if (!this.recent.length) return;
    var lbl = document.createElement('div');
    lbl.className = 'sreclbl';
    lbl.textContent = tx('recentSearches');
    host.appendChild(lbl);
    for (var i = 0; i <= this.recent.length; i++) {
      var c = document.createElement('div');
      c.className = 'schip' + (i === this.recent.length ? ' clear' : '');
      c.textContent = i === this.recent.length ? tx('clearHistory') : this.recent[i];
      host.appendChild(c);
      this.recentEls.push(c);
    }
    this.recentIdx = Math.min(this.recentIdx, this.recentEls.length - 1);
  },
  runRecent: function (i) {
    if (i === this.recent.length) {
      clearRecentSearches();
      this.zone = 'keys';
      this.paint();
      toast(tx('searchesCleared'));
      return;
    }
    var q = this.recent[i];
    if (!q) return;
    this.text = q;
    $('sBox').value = q;
    this.recentIdx = 0;
    this.zone = 'keys';
    this.run(q);
  },
  /* the right-hand column: results if any, otherwise the recent searches */
  toSide: function () {
    if (this.rows.length) this.zone = 'rows';
    else if (this.recentEls.length) this.zone = 'recent';
    else return false;
    this.paint();
    return true;
  },
  paint: function () {
    virtualizeBoard(this, this.rowIdx, false);
    $('sBox').className = this.zone === 'input' ? 'f' : '';
    this.renderRecent();
    if (this.zone === 'recent' && !this.recentEls.length) this.zone = 'keys';
    setF(this.recentEls, this.zone === 'recent' ? this.recentIdx : -1);
    setF(this.keyEls, this.zone === 'keys' && !topNav.active ? this.keyIdx : -1);
    var clipW = $('sRowsClip').clientWidth || contentWidth();
    for (var r = 0; r < this.rows.length; r++) {
      var row = this.rows[r];
      var active = this.zone === 'rows' && r === this.rowIdx;
      setF(row.cardEls, active ? row.col : -1);
      row.cardsEl.className = row.cardsEl.className.replace(/ ?\bact\b/, '') + (active ? ' act' : '');
      var w = 288,
        vis = Math.max(2, Math.floor(clipW / w));
      var off = Math.max(0, row.col - (vis - 2)) * w;
      row.cardsEl.style.transform = 'translateX(-' + off + 'px)';
      row.cardsEl.style.webkitTransform = 'translateX(-' + off + 'px)';
    }
    var y = this.rows[this.rowIdx] ? this.rows[this.rowIdx].el.offsetTop - this.rows[0].el.offsetTop : 0;
    $('sRows').style.transform = 'translateY(-' + y + 'px)';
    $('sRows').style.webkitTransform = 'translateY(-' + y + 'px)';
    /* browsing results -> backdrop follows the focused cover; typing -> faded logo */
    if (this.zone === 'rows') {
      var frow = this.rows[this.rowIdx];
      var fit = frow && frow.items[frow.col];
      $('logobg').className = '';
      if (fit) setBg(bgMid(fit));
      this.preview(fit);
    } else {
      this.preview(null);
      updateLogoBg();
    }
  },
  keysKey: function (k) {
    var p = searchKeyPos(this.keyIdx);
    if (k >= 65 && k <= 90) this.press(String.fromCharCode(k + 32));
    else if (k >= 48 && k <= 57) this.press(String(k - 48));
    else if (k === 8) this.press('del');
    else if (k === 13) this.press(SEARCH_KEYS[this.keyIdx]);
    else if (k === 37) {
      if (p.c === 0) {
        topNav.focus();
        return true;
      }
      this.keyIdx--;
    } else if (k === 39) {
      if (p.r < 6 ? p.c === 5 : this.keyIdx === SEARCH_KEYS.length - 1) return this.toSide() || true;
      this.keyIdx++;
    } else if (k === 38) {
      if (p.r === 0) this.zone = 'input';
      else this.keyIdx = searchKeyAt(p.r - 1, p.c);
    } else if (k === 40 && p.r < 6) this.keyIdx = searchKeyAt(p.r + 1, p.c);
    this.paint();
    return true;
  },
  key: function (k) {
    if (this.zone === 'keys') return this.keysKey(k);
    if (this.zone === 'input') {
      if (k === 13) {
        $('sBox').focus();
        return true;
      }
      if (k === 40) {
        this.zone = 'keys';
        this.paint();
        return true;
      }
      if (k === 37) {
        topNav.focus();
        return true;
      }
      return true;
    }
    if (this.zone === 'recent') {
      if (k === 39) this.recentIdx = Math.min(this.recentEls.length - 1, this.recentIdx + 1);
      else if (k === 37) {
        if (this.recentIdx === 0) this.zone = 'keys';
        else this.recentIdx--;
      } else if (k === 13) {
        this.runRecent(this.recentIdx);
        return true;
      }
      this.paint();
      return true;
    }
    var row = this.rows[this.rowIdx];
    if (!row) {
      this.zone = 'keys';
      this.paint();
      return true;
    }
    if (k === 39) {
      var st = hstep(1, row.cardsEl);
      var o = row.col;
      row.col = Math.min(row.items.length - 1, row.col + st);
      if (row.col !== o) {
        setF1(row.cardEls, o, row.col);
        this.paint();
      }
    } else if (k === 37) {
      if (row.col === 0) {
        this.zone = 'keys';
        this.paint();
        return true;
      }
      var st2 = hstep(-1, row.cardsEl);
      var o2 = row.col;
      row.col = Math.max(0, row.col - st2);
      if (row.col !== o2) {
        setF1(row.cardEls, o2, row.col);
        this.paint();
      }
    } else if (k === 40) {
      if (this.rowIdx < this.rows.length - 1) {
        this.rowIdx++;
        this.paint();
      }
    } else if (k === 38) {
      if (this.rowIdx > 0) {
        this.rowIdx--;
        this.paint();
      } else {
        this.zone = 'keys';
        this.paint();
      }
    } else if (k === 13) {
      var it = row.items[row.col];
      if (it) {
        /* a live query becomes a recent search once one of its results is opened */
        rememberSearch(this.q);
        openItem(it);
      }
    }
    return true;
  }
};
