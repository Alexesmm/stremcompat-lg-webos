// Source picker overlay.
/* ================= STREAMS OVERLAY ================= */
var streamsUI = {
  open: false,
  items: [],
  idx: 0,
  els: [],
  groups: [],
  pool: [],
  trimmed: {},
  type: '',
  id: '',
  vid: '',
  seq: 0,
  requestSeq: 0,
  autoPref: null,
  zone: 'list',
  filter: 'All',
  chipIdx: 0,
  chips: [],
  chipEls: [],
  failed: [],
  title: '',
  show: function (type, id, vid, title) {
    var request = ++this.requestSeq;
    this.open = true;
    this.failed = [];
    this.title = title || '';
    this.items = [];
    this.idx = 0;
    this.els = [];
    this.groups = [];
    this.pool = [];
    this.trimmed = {};
    this.type = type;
    this.id = id;
    this.vid = vid;
    this.seq = 0;
    this.autoPref = takeNextSourcePreference(id, vid);
    this.zone = 'list';
    this.filter = 'All';
    this.chipIdx = 0;
    this.chips = [];
    this.chipEls = [];
    $('streams').style.display = 'block';
    $('stChips').innerHTML = '';
    $('stSub').textContent =
      (title || '') +
      (vid && vid.indexOf(':') > 0 ? '  ·  T' + vid.split(':')[1] + ' E' + vid.split(':')[2] : '');
    $('stInner').innerHTML = '<div class="stmsg">' + tx('findingSources') + '</div>';
    var q = resumeSearch(id, vid);
    var self = this;
    if (q) {
      this.push(
        [
          {
            addon: tx('lastSource'),
            name: tx('continuePlayback'),
            title: tx('sameSource'),
            stored: q,
            quality: 'Recent',
            seeders: 999999,
            compatLabels: [],
            compatRank: 0
          }
        ],
        0,
        tx('lastSource')
      );
    }
    fetchStreams(
      type,
      vid,
      function (part, gi, gn) {
        if (self.open && self.requestSeq === request) self.push(part, gi + 1, gn);
      },
      function (total, failed) {
        if (!self.open || self.requestSeq !== request) return;
        self.failed = failed || [];
        if (!self.items.length) {
          $('stInner').innerHTML =
            '<div class="stmsg">' +
            (self.failed.length
              ? esc(tx('addonsNoAnswer', self.failed.join(', '))) + '<br>' + tx('pressOkRetry')
              : tx('noSources')) +
            '</div>';
          return;
        }
        self.rebuild();
        var matched = matchingNextSource(self.all(), self.autoPref);
        self.autoPref = null;
        if (matched) {
          var backHash = 'beta#detail/' + self.type + '/' + self.id + '/' + self.vid;
          playUrl(matched, self.type, self.id, self.vid, backHash);
        }
      }
    );
  },
  push: function (arr, gIdx, gName) {
    if (!this.open) return;
    for (var i = 0; i < arr.length; i++) {
      arr[i]._seq = this.seq++;
      this.pool.push(arr[i]);
    }
    this.compact();
    this.renderChips();
    this.rebuild();
  },
  sourceKey: function (s) {
    return streamSourceKey(s);
  },
  compact: function () {
    var cap = TV_PROFILE.sourceCap || 60;
    var result = compactSourcePool(this.pool, cap);
    this.pool = result.items;
    this.trimmed = result.trimmed;
  },
  all: function () {
    return this.pool.slice(0);
  },
  renderChips: function () {
    var host = $('stChips'),
      allItems = this.all(),
      counts = {},
      order = ['All', '4K', '1440p', '1080p', '720p', 'SD', 'Other'];
    host.innerHTML = '';
    this.chips = [];
    this.chipEls = [];
    for (var n = 0; n < allItems.length; n++) {
      var q = allItems[n].quality || 'Other';
      counts[q] = (counts[q] || 0) + 1;
    }
    for (var i = 0; i < order.length; i++) {
      var key = order[i];
      if (key !== 'All' && !counts[key]) continue;
      var c = document.createElement('div');
      c.className = 'stchip';
      c.textContent =
        qualityLabel(key) + (key === 'All' ? '' : ' ' + counts[key] + (this.trimmed[key] ? '+' : ''));
      host.appendChild(c);
      this.chips.push(key);
      this.chipEls.push(c);
    }
    var k = this.chips.indexOf(this.filter);
    if (k < 0) {
      this.filter = 'All';
      k = 0;
    }
    this.chipIdx = k;
    this.paintChips();
  },
  paintChips: function () {
    for (var i = 0; i < this.chipEls.length; i++) {
      var cur = this.chips[i] === this.filter;
      this.chipEls[i].className =
        'stchip' + (cur ? ' cur' : '') + (this.zone === 'chips' && i === this.chipIdx ? ' f' : '');
    }
  },
  rebuild: function () {
    var sel = this.items[this.idx] || null,
      flat = this.all(),
      self = this,
      pref = lsRaw('preferredSourceQuality', 'Auto');
    flat = flat.filter(function (s) {
      return self.filter === 'All' || s.quality === self.filter;
    });
    flat.sort(function (a, b) {
      if (pref !== 'Auto') {
        var ap = a.quality === pref ? 0 : 1,
          bp = b.quality === pref ? 0 : 1;
        if (ap !== bp) return ap - bp;
      }
      return sourceOrder(a, b);
    });
    var host = $('stInner');
    host.innerHTML = '';
    this.items = [];
    this.els = [];
    /* The list is already ordered by compatibility and seeders; the first source with
       no compatibility warning is named as the one to pick when there is a choice. */
    var rec = -1,
      choices = 0;
    for (var r = 0; r < flat.length; r++) {
      if (flat[r].stored) continue;
      choices++;
      if (rec < 0 && !(flat[r].compatRank > 0)) rec = r;
    }
    if (choices < 2) rec = -1;
    for (var i = 0; i < flat.length; i++) {
      var s = flat[i],
        d = document.createElement('div');
      d.className = 'st';
      if (i === rec) {
        var tag = document.createElement('div');
        tag.className = 'rec';
        tag.textContent = tx('recommendedSource');
        d.appendChild(tag);
      }
      var a = document.createElement('div');
      a.className = 'a';
      a.textContent = s.stored
        ? tx('continuePlayback')
        : qualityLabel(s.quality || 'Other') +
          (s.seeders >= 0 ? '  ·  ' + s.seeders + ' ' + tx('seeders') : '') +
          '  ·  ' +
          (s.addon || 'Addon');
      d.appendChild(a);
      if (s.compatLabels && s.compatLabels.length) {
        var c = document.createElement('div');
        c.className = 'compat';
        c.textContent = tx('compatibilityCheck', s.compatLabels.join(' · '));
        d.appendChild(c);
      }
      var b = document.createElement('div');
      b.className = 'b';
      b.textContent = String(s.title || s.name || '').replace(/\n/g, '  ');
      d.appendChild(b);
      host.appendChild(d);
      this.items.push(s);
      this.els.push(d);
    }
    if (!this.items.length) host.innerHTML = '<div class="stmsg">' + tx('noSourcesQuality') + '</div>';
    if (this.failed.length) {
      var note = document.createElement('div');
      note.className = 'stmsg';
      note.textContent = tx('addonsNoAnswer', this.failed.join(', '));
      host.appendChild(note);
    }
    if (sel) {
      var at = this.items.indexOf(sel);
      this.idx = at >= 0 ? at : Math.min(this.idx, Math.max(0, this.items.length - 1));
    } else this.idx = Math.min(this.idx, Math.max(0, this.items.length - 1));
    this.paint();
  },
  paint: function () {
    setF(this.els, this.zone === 'list' ? this.idx : -1);
    this.paintChips();
    var y = 0,
      el = this.els[this.idx];
    if (el && el.offsetTop > 260) y = el.offsetTop - 260;
    $('stInner').style.transform = 'translateY(-' + y + 'px)';
    $('stInner').style.webkitTransform = 'translateY(-' + y + 'px)';
  },
  close: function () {
    this.open = false;
    this.requestSeq++;
    $('streams').style.display = 'none';
  },
  choose: function () {
    var s = this.items[this.idx];
    if (!s) {
      if (this.failed.length) this.show(this.type, this.id, this.vid, this.title);
      return true;
    }
    var backHash = 'beta#detail/' + this.type + '/' + this.id + (this.vid !== this.id ? '/' + this.vid : '');
    if (s.stored) playStored(s.stored, backHash);
    else playUrl(s, this.type, this.id, this.vid, backHash);
    return true;
  },
  key: function (k) {
    if (this.zone === 'chips') {
      if (k === 39) this.chipIdx = Math.min(this.chipEls.length - 1, this.chipIdx + 1);
      else if (k === 37) this.chipIdx = Math.max(0, this.chipIdx - 1);
      else if (k === 40 || k === 13) {
        if (this.items.length) {
          this.zone = 'list';
          this.paint();
        }
        return true;
      } else return true;
      this.filter = this.chips[this.chipIdx];
      this.idx = 0;
      this.rebuild();
      return true;
    }
    if (k === 40) {
      this.idx = Math.min(this.els.length - 1, this.idx + 1);
      this.paint();
    } else if (k === 38) {
      if (this.idx > 0) {
        this.idx--;
        this.paint();
      } else {
        this.zone = 'chips';
        this.paint();
      }
    } else if (k === 13) {
      return this.choose();
    } else if (k === 37) this.close();
    return true;
  }
};
