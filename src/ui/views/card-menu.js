// Long-press OK side menu available on every card.
/* ================= unified long-press side menu (any card) ================= */
var cwMenu = {
  open: false,
  idx: 0,
  els: [],
  acts: [],
  it: null,
  show: function (it) {
    this.it = it;
    this.open = true;
    this.idx = 0;
    var host = $('cwmItems');
    host.innerHTML = '';
    this.els = [];
    this.acts = [];
    var self = this;
    $('cwmTitle').textContent = it.name || '';
    var sub = it.type === 'series' ? tx('seriesOne') : tx('movie');
    if (it.cw && it.videoId && it.videoId.indexOf(':') > 0) {
      var pp = it.videoId.split(':');
      sub = tx('seasonEpisode', pp[pp.length - 2], pp[pp.length - 1]);
    }
    $('cwmSub').textContent = sub;
    function add(ic, lb, fn) {
      var d = document.createElement('div');
      d.className = 'cwmi';
      d.innerHTML = ic + '<span>' + esc(lb) + '</span>';
      host.appendChild(d);
      self.els.push(d);
      self.acts.push(fn);
    }
    add(ICON.play, it.cw ? tx('continueLabel') : tx('watch'), function () {
      self.close();
      openItem(it);
    });
    add(ICON.info, tx('details'), function () {
      self.close();
      goScr('detail', { type: it.type, id: it.id, vid: it.videoId || null });
    });
    add(ICON.similar, tx('similarTitles'), function () {
      self.close();
      goScr('sim', { type: it.type, id: it.id, name: it.name });
    });
    add(ICON.trailer, tx('trailer'), function () {
      self.close();
      trailerFor(it.type, it.id, 'beta');
    });
    if (it.cw)
      add(ICON.check, tx('markWatched'), function () {
        markCwWatched(it);
        self.close();
        refreshCurBoard();
        toast(tx('markedWatched'));
      });
    add(
      libHas(it.id) ? ICON.check : ICON.plus,
      libHas(it.id) ? tx('removeLibrary') : tx('addLibrary'),
      function () {
        libToggle(it);
        self.close();
        refreshCurBoard();
      }
    );
    $('cwm').style.display = 'block';
    this.paint();
  },
  paint: function () {
    setF(this.els, this.idx);
  },
  close: function () {
    this.open = false;
    $('cwm').style.display = 'none';
  },
  key: function (k) {
    if (k === 40) this.idx = Math.min(this.els.length - 1, this.idx + 1);
    else if (k === 38) this.idx = Math.max(0, this.idx - 1);
    else if (k === 13) {
      var a = this.acts[this.idx];
      if (a) a();
      return true;
    } else if (k === 37) {
      this.close();
      return true;
    }
    this.paint();
    return true;
  }
};
