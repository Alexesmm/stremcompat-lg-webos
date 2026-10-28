// Search screen and recent searches.
/* Typing with the remote is slow, so the last searches stay one key away. */
var RECENT_SEARCH_KEY = 'recentSearches',
  RECENT_SEARCH_MAX = 8;
function recentSearches() {
  var list = lsJson(RECENT_SEARCH_KEY);
  return Object.prototype.toString.call(list) === '[object Array]' ? list : [];
}
function rememberSearch(q) {
  var list = recentSearches(),
    out = [q];
  for (var i = 0; i < list.length && out.length < RECENT_SEARCH_MAX; i++)
    if (typeof list[i] === 'string' && list[i].toLowerCase() !== q.toLowerCase()) out.push(list[i]);
  lsSet(RECENT_SEARCH_KEY, out);
}
/* ================= SEARCH ================= */
var search = {
  zone: 'input',
  rows: [],
  rowIdx: 0,
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
            self.run($('sBox').value);
          } else if (e.keyCode === 40) {
            e.preventDefault();
            e.stopPropagation();
            $('sBox').blur();
            if (self.rows.length || self.recent.length) {
              self.zone = self.rows.length ? 'rows' : 'recent';
              self.paint();
            }
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
  },
  enter: function (p) {
    this.wire();
    this.zone = 'input';
    /* Back from a result returns to that result, not to the text box */
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
    this.zone = 'input';
    this.paint();
  } /* nav handed focus down to the box */,
  run: function (q) {
    q = String(q || '').replace(/^\s+|\s+$/g, '');
    if (!q) {
      return;
    }
    this.q = q;
    rememberSearch(q);
    var gen = ++this.gen;
    for (var rq = 0; rq < this.requests.length; rq++)
      if (this.requests[rq] && this.requests[rq].abort)
        try {
          this.requests[rq].abort();
        } catch (e) {}
    this.requests = [];
    var host = $('sRows');
    unloadBoard(this);
    host.innerHTML = '';
    this.rows = [];
    this.rowIdx = 0;
    var self = this;
    $('sHint').textContent = tx('searching');
    var got = 0;
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
        $('sHint').textContent = self.rows.length ? '' : tx('noResults', q);
        if (self.rows.length) {
          self.zone = 'rows';
        }
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
  /* recent searches are offered while there are no results to browse */
  renderRecent: function () {
    var list = this.rows.length ? [] : recentSearches(),
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
    for (var i = 0; i < this.recent.length; i++) {
      var c = document.createElement('div');
      c.className = 'schip';
      c.textContent = this.recent[i];
      host.appendChild(c);
      this.recentEls.push(c);
    }
    this.recentIdx = Math.min(this.recentIdx, this.recent.length - 1);
  },
  runRecent: function (i) {
    var q = this.recent[i];
    if (!q) return;
    $('sBox').value = q;
    this.recentIdx = 0;
    this.zone = 'input';
    this.run(q);
  },
  paint: function () {
    virtualizeBoard(this, this.rowIdx, false);
    $('sBox').className = this.zone === 'input' ? 'f' : '';
    this.renderRecent();
    if (this.zone === 'recent' && !this.recent.length) this.zone = 'input';
    setF(this.recentEls, this.zone === 'recent' ? this.recentIdx : -1);
    for (var r = 0; r < this.rows.length; r++) {
      var row = this.rows[r];
      var active = this.zone === 'rows' && r === this.rowIdx;
      setF(row.cardEls, active ? row.col : -1);
      row.cardsEl.className = row.cardsEl.className.replace(/ ?\bact\b/, '') + (active ? ' act' : '');
      var w = 288,
        vis = Math.max(2, Math.floor(contentWidth() / w));
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
  key: function (k) {
    if (this.zone === 'input') {
      if (k === 13) {
        $('sBox').focus();
        return true;
      }
      if (k === 40 && (this.rows.length || this.recent.length)) {
        this.zone = this.rows.length ? 'rows' : 'recent';
        this.paint();
        return true;
      }
      if (k === 38) {
        topNav.focus();
        return true;
      }
      return true;
    }
    if (this.zone === 'recent') {
      if (k === 39) this.recentIdx = Math.min(this.recentEls.length - 1, this.recentIdx + 1);
      else if (k === 37) {
        if (this.recentIdx === 0) {
          topNav.focus();
          return true;
        }
        this.recentIdx--;
      } else if (k === 38) this.zone = 'input';
      else if (k === 13) {
        this.runRecent(this.recentIdx);
        return true;
      }
      this.paint();
      return true;
    }
    var row = this.rows[this.rowIdx];
    if (!row) {
      this.zone = 'input';
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
        topNav.focus();
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
        this.zone = 'input';
        this.paint();
      }
    } else if (k === 13) {
      var it = row.items[row.col];
      if (it) openItem(it);
    }
    return true;
  }
};
