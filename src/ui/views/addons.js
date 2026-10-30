// Addons screen.
/* ================= ADDONS =================
   Read-only on the TV for now: account installation remains authoritative, while
   the user can inspect and resync the exact set driving Home and source results. */
var addonPanel = {
  idx: 0,
  els: [],
  list: [],
  enter: function () {
    this.idx = 0;
    this.els = [$('aSync')];
    this.list = addons();
    var host = $('aInner');
    host.innerHTML = '';
    for (var i = 0; i < this.list.length; i++) {
      var ad = this.list[i],
        m = ad.manifest || {},
        d = document.createElement('div');
      d.className = 'addon';
      var n = document.createElement('div');
      n.className = 'an';
      n.textContent = m.name || m.id || 'Addon';
      d.appendChild(n);
      var info = document.createElement('div');
      info.className = 'ai';
      info.textContent = [m.id || '', m.version || '', (m.types || []).join(' · ')]
        .join('   ')
        .replace(/\s+/g, ' ');
      d.appendChild(info);
      host.appendChild(d);
      this.els.push(d);
    }
    if (!this.list.length) {
      var empty = document.createElement('div');
      empty.className = 'stmsg';
      empty.textContent = tx('noAddons');
      host.appendChild(empty);
    }
    this.paint();
    animIn($('aWrap'));
  },
  focusTop: function () {
    topNav.active = false;
    this.idx = 0;
    this.paint();
    topNav.paint();
  },
  paint: function () {
    setF(this.els, topNav.active ? -1 : this.idx);
    var y = 0;
    if (this.idx > 3) {
      var el = this.els[this.idx];
      if (el) y = Math.max(0, el.offsetTop - 220);
    }
    $('aInner').style.transform = 'translateY(-' + y + 'px)';
    $('aInner').style.webkitTransform = 'translateY(-' + y + 'px)';
  },
  syncNow: function () {
    var self = this;
    toast(tx('syncing'));
    syncAddons(function (changed) {
      toast(changed ? tx('addonsUpdated') : tx('addonsCurrent'));
      self.enter();
      invalidateBoards();
    });
  },
  key: function (k) {
    if (k === 40) {
      this.idx = Math.min(this.els.length - 1, this.idx + 1);
      this.paint();
    } else if (k === 38) {
      if (this.idx > 0) {
        this.idx--;
        this.paint();
      }
    } else if (k === 37) topNav.focus();
    else if (k === 13 && this.idx === 0) this.syncNow();
    return true;
  }
};
