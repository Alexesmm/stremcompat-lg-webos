// Grid of similar titles.
/* ================= SIMILAR (grid of same-genre titles) ================= */
var similar = {
  items: [],
  els: [],
  idx: 0,
  cols: 6,
  gen: 0,
  enter: function (p) {
    p = p || { type: detail.type, id: detail.id };
    var self = this,
      gen = ++this.gen;
    this.items = [];
    this.els = [];
    this.idx = 0;
    $('simTitle').textContent = tx('similar');
    var host = $('simGrid');
    host.innerHTML =
      '<div style="font-size:27px;color:rgba(255,255,255,.55);padding:40px">' +
      tx('findingSimilar') +
      '</div>';
    getMeta(p.type, p.id, function (m) {
      if (SCR !== 'sim' || self.gen !== gen) return;
      var nm = (m && m.name) || p.name || '';
      if (nm) $('simTitle').textContent = tx('similarTo', nm);
      var g = m && m.genres && m.genres.length ? m.genres[0] : '';
      var u = CIN + '/catalog/' + p.type + '/top' + (g ? '/genre=' + encodeURIComponent(g) : '') + '.json';
      xhrJson(u, function (j) {
        if (SCR !== 'sim' || self.gen !== gen) return;
        var metas = (j && j.metas) || [];
        host.innerHTML = '';
        for (var i = 0; i < metas.length && self.items.length < 30; i++) {
          var mm = metas[i];
          if (mm.id === p.id) continue;
          var it = {
            id: mm.id,
            type: mm.type || p.type,
            name: mm.name,
            poster: mm.poster,
            background: mm.background
          };
          self.items.push(it);
          var cd = makeCard(it, false, true, false);
          host.appendChild(cd);
          self.els.push(cd);
        }
        if (!self.items.length) host.innerHTML = emptyState(tx('nothingFound'), tx('similarEmptyHint'));
        self.idx = Math.max(0, Math.min(p.idx || 0, self.items.length - 1));
        self.paint();
      });
    });
  },
  paint: function () {
    setF(this.els, topNav.active ? -1 : this.idx);
    var rowH = this.els[0] ? this.els[0].offsetHeight + 26 : 470;
    var row = Math.floor(this.idx / this.cols);
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
    var y = Math.max(0, row - 1) * rowH;
    if (row <= 0) y = 0;
    $('simGrid').style.transform = 'translateY(-' + y + 'px)';
    $('simGrid').style.webkitTransform = 'translateY(-' + y + 'px)';
  },
  key: function (k) {
    if (!this.els.length) return true;
    if (k === 39) this.idx = Math.min(this.els.length - 1, this.idx + 1);
    else if (k === 37) {
      if (this.idx > 0) this.idx--;
    } else if (k === 40) this.idx = Math.min(this.els.length - 1, this.idx + this.cols);
    else if (k === 38) {
      if (this.idx - this.cols >= 0) this.idx -= this.cols;
    } else if (k === 13) {
      var it = this.items[this.idx];
      if (it) goScr('detail', { type: it.type, id: it.id, vid: null });
      return true;
    }
    this.paint();
    return true;
  }
};
