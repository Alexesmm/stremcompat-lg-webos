// Home, Discover and Library screens.
var home = makeBoard(function (b, keep) {
  loadCatalogRows(b, homeDefs(), true, keep);
});
/* Discover intentionally differs from Home: three compact filters feed one virtualized
   poster grid. This keeps the DOM small while making the section useful on a TV remote. */
var disc = {
  rows: [],
  items: [],
  els: [],
  filterEls: [],
  optionEls: [],
  types: [],
  catalogs: [],
  genres: [],
  menuEl: null,
  typeIdx: 0,
  catalogIdx: 0,
  genreIdx: 0,
  filterIdx: 0,
  optionIdx: 0,
  filterOpen: false,
  idx: 0,
  cols: 6,
  zone: 'filters',
  built: false,
  gen: 0,
  loading: false,
  ended: false,
  skip: 0,
  request: null,
  cacheKey: '',
  enter: function () {
    unloadBoard(home);
    unloadBoard(lib);
    this.zone = 'filters';
    this.filterIdx = 0;
    this.filterOpen = false;
    this.refreshChoices();
    this.renderFilters();
    if (!this.built) {
      this.built = true;
      this.load();
    } else this.paint();
    animIn($('discWrap'));
  },
  /* from a Home row's See all card: the same catalog, all genres */
  openCatalog: function (def) {
    var m = String((def && def.url) || '').match(/^(.*)\/catalog\/([^\/]+)\/([^\/]+)\.json$/);
    this.types = discoverTypes();
    for (var t = 0; t < this.types.length; t++) if (this.types[t].value === def.type) this.typeIdx = t;
    this.catalogs = discoverCatalogs(def.type);
    this.catalogIdx = 0;
    if (m)
      for (var c = 0; c < this.catalogs.length; c++)
        if (
          this.catalogs[c].id === decodeURIComponent(m[3]) &&
          (this.catalogs[c].base === m[1] || this.catalogs[c].base === CIN)
        )
          this.catalogIdx = c;
    this.genreIdx = 0;
    this.idx = 0;
    this.built = false;
    topNav.idx = 2;
    goScr('disc');
  },
  focusTop: function () {
    this.zone = 'filters';
    this.filterIdx = 0;
    this.filterOpen = false;
    this.renderFilters();
    this.paint();
  },
  refreshChoices: function () {
    this.types = discoverTypes();
    if (this.typeIdx >= this.types.length) this.typeIdx = 0;
    var type = this.selectedType();
    this.catalogs = discoverCatalogs(type);
    if (this.catalogIdx >= this.catalogs.length) this.catalogIdx = 0;
    this.genres = discoverGenres(this.catalogs[this.catalogIdx]);
    if (this.genreIdx >= this.genres.length) this.genreIdx = 0;
  },
  selectedType: function () {
    return this.types[this.typeIdx] ? this.types[this.typeIdx].value : 'movie';
  },
  currentCatalog: function () {
    return this.catalogs[this.catalogIdx] || null;
  },
  currentGenre: function () {
    return this.genres[this.genreIdx] || { value: '', label: tx('allGenres') };
  },
  filterOptions: function (i) {
    var out = [],
      n;
    if (i === 0) {
      for (n = 0; n < this.types.length; n++) out.push(this.types[n].label);
      return out;
    }
    if (i === 1) {
      for (n = 0; n < this.catalogs.length; n++) out.push(this.catalogs[n].label);
      return out;
    }
    for (n = 0; n < this.genres.length; n++) out.push(this.genres[n].label);
    return out;
  },
  filterValue: function (i) {
    return i === 0 ? this.typeIdx : i === 1 ? this.catalogIdx : this.genreIdx;
  },
  renderFilters: function () {
    this.refreshChoices();
    var cat = this.currentCatalog(),
      genre = this.currentGenre();
    var hosts = [$('discType'), $('discCatalog'), $('discGenre')],
      labels = [
        this.types[this.typeIdx] ? this.types[this.typeIdx].label : tx('movies'),
        cat ? cat.label : tx('popular'),
        genre.label
      ];
    this.filterEls = [];
    this.optionEls = [];
    this.menuEl = null;
    for (var i = 0; i < hosts.length; i++) {
      hosts[i].innerHTML = '';
      var chip = document.createElement('div');
      chip.className = 'fchip' + (this.filterOpen && i === this.filterIdx ? ' open' : '');
      chip.textContent = labels[i];
      hosts[i].appendChild(chip);
      this.filterEls.push(chip);
      if (this.filterOpen && i === this.filterIdx) {
        var menu = document.createElement('div');
        menu.className = 'fmenu';
        this.menuEl = menu;
        var opts = this.filterOptions(i),
          cur = this.filterValue(i);
        for (var n = 0; n < opts.length; n++) {
          var op = document.createElement('div');
          op.className = 'fopt' + (n === cur ? ' cur' : '');
          op.textContent = opts[n];
          menu.appendChild(op);
          this.optionEls.push(op);
        }
        hosts[i].appendChild(menu);
      }
    }
  },
  openFilter: function () {
    this.filterOpen = true;
    this.optionIdx = this.filterValue(this.filterIdx);
    this.renderFilters();
    this.paint();
  },
  closeFilter: function () {
    if (!this.filterOpen) return false;
    this.filterOpen = false;
    this.renderFilters();
    this.paint();
    return true;
  },
  selectFilter: function () {
    if (this.filterIdx === 0) {
      this.typeIdx = this.optionIdx;
      this.catalogIdx = 0;
      this.genreIdx = 0;
    } else if (this.filterIdx === 1) {
      this.catalogIdx = this.optionIdx;
      this.genreIdx = 0;
    } else this.genreIdx = this.optionIdx;
    this.filterOpen = false;
    this.refreshChoices();
    this.renderFilters();
    this.idx = 0;
    this.load();
  },
  pageUrl: function (offset) {
    var cat = this.currentCatalog(),
      genre = this.currentGenre(),
      extra = [];
    if (!cat) return '';
    if (genre.value) extra.push('genre=' + encodeURIComponent(genre.value));
    if (offset > 0) extra.push('skip=' + offset);
    return (
      cat.base +
      '/catalog/' +
      cat.type +
      '/' +
      encodeURIComponent(cat.id) +
      (extra.length ? '/' + extra.join('&') : '') +
      '.json' +
      (cat.query || '')
    );
  },
  load: function () {
    var cat = this.currentCatalog(),
      genre = this.currentGenre(),
      gen = ++this.gen;
    if (this.request && this.request.abort)
      try {
        this.request.abort();
      } catch (e) {}
    this.request = null;
    this.loading = false;
    this.ended = false;
    this.skip = 0;
    this.items = [];
    this.cacheKey =
      'beta_discover_v3_' + stableHash([(cat && cat.key) || '', genre.value || 'all'].join('|'));
    var cached = lsJson(this.cacheKey);
    if (cached && cached.v === 3 && cached.items && cached.items.length) {
      this.items = cached.items.slice(0, TV_PROFILE.discoverCap || 40);
      this.skip = cached.skip || this.items.length;
      this.ended = !!cached.ended;
      this.renderGrid();
    } else $('discGrid').innerHTML = '<div class="stmsg">' + tx('searching') + '</div>';
    this.requestPage(0, true, gen);
  },
  requestPage: function (offset, refresh, expectedGen) {
    if (this.loading || (this.ended && !refresh)) return;
    var self = this,
      gen = expectedGen == null ? this.gen : expectedGen,
      url = this.pageUrl(offset),
      cap = TV_PROFILE.discoverCap || 40;
    if (!url) return;
    this.loading = true;
    this.request = xhrJson(url, function (j) {
      if (self.gen !== gen) return;
      self.loading = false;
      self.request = null;
      var metas = (j && j.metas) || [],
        incoming = [],
        seen = {},
        i;
      if (refresh) self.ended = false;
      for (i = 0; i < self.items.length; i++) seen[self.items[i].type + ':' + self.items[i].id] = true;
      for (i = 0; i < metas.length; i++) {
        var m = metas[i],
          type = m.type || self.selectedType(),
          id = type + ':' + m.id;
        if (!m.id || seen[id]) continue;
        seen[id] = true;
        incoming.push({
          id: m.id,
          type: type,
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
      if (refresh && offset === 0 && self.items.length) {
        var first = incoming,
          merged = [],
          all = first.concat(self.items),
          dedupe = {};
        for (i = 0; i < all.length && merged.length < cap; i++) {
          var dk = all[i].type + ':' + all[i].id;
          if (!dedupe[dk]) {
            dedupe[dk] = true;
            merged.push(all[i]);
          }
        }
        self.items = merged;
      } else for (i = 0; i < incoming.length && self.items.length < cap; i++) self.items.push(incoming[i]);
      self.skip = Math.max(self.skip, offset + metas.length);
      if (!metas.length || (!incoming.length && offset > 0) || self.items.length >= cap) self.ended = true;
      lsSet(self.cacheKey, { v: 3, t: Date.now(), items: self.items, skip: self.skip, ended: self.ended });
      self.renderGrid();
    });
  },
  maybeLoadMore: function () {
    if (this.zone === 'grid' && !this.loading && !this.ended && this.items.length - this.idx <= this.cols * 2)
      this.requestPage(this.skip, false, this.gen);
  },
  renderGrid: function () {
    var host = $('discGrid');
    host.innerHTML = '';
    this.els = [];
    for (var i = 0; i < this.items.length; i++) {
      var c = makeCard(this.items[i], false, true, false);
      host.appendChild(c);
      this.els.push(c);
    }
    if (!this.items.length && !this.loading)
      host.innerHTML = emptyState(tx('nothingFound'), tx('nothingFoundHint'));
    this.idx = Math.min(this.idx, Math.max(0, this.items.length - 1));
    this.paint();
  },
  focusedItem: function () {
    return this.items[this.idx] || null;
  },
  paint: function () {
    setF(this.filterEls, !topNav.active && this.zone === 'filters' ? this.filterIdx : -1);
    setF(this.els, !topNav.active && this.zone === 'grid' ? this.idx : -1);
    setF(this.optionEls, !topNav.active && this.zone === 'filters' && this.filterOpen ? this.optionIdx : -1);
    if (this.menuEl && this.optionEls[this.optionIdx]) {
      var option = this.optionEls[this.optionIdx],
        top = option.offsetTop,
        bottom = top + option.offsetHeight;
      if (top < this.menuEl.scrollTop) this.menuEl.scrollTop = top;
      else if (bottom > this.menuEl.scrollTop + this.menuEl.clientHeight)
        this.menuEl.scrollTop = bottom - this.menuEl.clientHeight;
    }
    var step = (document.documentElement.clientHeight || 1080) <= 800 ? 192 : 288,
      gridWidth = $('discGridClip').clientWidth || contentWidth();
    this.cols = Math.max(3, Math.floor((gridWidth - 14) / step));
    var row = Math.floor(this.idx / this.cols),
      rowH = (document.documentElement.clientHeight || 1080) <= 800 ? 288 : 420;
    for (var i = 0; i < this.els.length; i++) {
      var imgs = this.els[i].getElementsByTagName('img'),
        near = Math.abs(Math.floor(i / this.cols) - row) <= 1;
      for (var z = 0; z < imgs.length; z++) {
        var im = imgs[z];
        if (near && im._full) {
          im.src = im._full;
          im._full = null;
        } else if (!near && im.src && im.src !== BLANK_IMG) {
          im._full = im.src;
          im.src = BLANK_IMG;
        }
      }
    }
    var y = this.zone === 'grid' ? Math.max(0, row - 1) * rowH : 0;
    $('discGrid').style.transform = 'translateY(-' + y + 'px)';
    $('discGrid').style.webkitTransform = 'translateY(-' + y + 'px)';
    var it = this.focusedItem();
    if (this.zone === 'grid' && it) setBg(bgMid(it));
    else setBg('');
    this.maybeLoadMore();
  },
  key: function (k) {
    if (this.zone === 'filters') {
      if (this.filterOpen) {
        var last = this.filterOptions(this.filterIdx).length - 1;
        if (k === 38) this.optionIdx = Math.max(0, this.optionIdx - 1);
        else if (k === 40) this.optionIdx = Math.min(last, this.optionIdx + 1);
        else if (k === 13) this.selectFilter();
        else if (k === 37 || k === 39) {
          this.filterOpen = false;
          this.filterIdx = Math.max(0, Math.min(2, this.filterIdx + (k === 37 ? -1 : 1)));
          this.renderFilters();
        }
        this.paint();
        return true;
      }
      if (k === 37) {
        if (this.filterIdx === 0) {
          topNav.focus();
          return true;
        }
        this.filterIdx--;
      } else if (k === 39) this.filterIdx = Math.min(2, this.filterIdx + 1);
      else if (k === 38) {
        topNav.focus();
        return true;
      } else if (k === 40) {
        if (this.items.length) this.zone = 'grid';
      } else if (k === 13) {
        this.openFilter();
        return true;
      }
      this.paint();
      return true;
    }
    if (!this.items.length) {
      if (k === 38) this.zone = 'filters';
      this.paint();
      return true;
    }
    var col = this.idx % this.cols;
    if (k === 39) this.idx = Math.min(this.items.length - 1, this.idx + 1);
    else if (k === 37) {
      if (col === 0) {
        topNav.focus();
        return true;
      }
      this.idx--;
    } else if (k === 40) this.idx = Math.min(this.items.length - 1, this.idx + this.cols);
    else if (k === 38) {
      if (this.idx - this.cols >= 0) this.idx -= this.cols;
      else this.zone = 'filters';
    } else if (k === 13) {
      var it = this.focusedItem();
      if (it) openItem(it);
      return true;
    }
    this.paint();
    return true;
  }
};
var lib = makeBoard(function (b, keep) {
  loadLibraryRows(b);
});
