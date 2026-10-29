// Settings and account screen.
/* ================= SETTINGS + ACCOUNT ================= */
function mediaLanguageOptions() {
  return [
    ['', tx('disabled')],
    ['por', tx('portugueseBrazil')],
    ['eng', tx('english')],
    ['spa', tx('spanish')],
    ['fre', tx('french')],
    ['ita', tx('italian')],
    ['ger', tx('german')],
    ['ara', tx('arabic')],
    ['rus', tx('russian')],
    ['tur', tx('turkish')],
    ['pol', tx('polish')],
    ['dut', tx('dutch')],
    ['swe', tx('swedish')],
    ['heb', tx('hebrew')],
    ['hin', tx('hindi')],
    ['jpn', tx('japanese')],
    ['kor', tx('korean')],
    ['chi', tx('chinese')]
  ];
}
/* one recorded problem as '14:32 · Source would not play (Torrentio 1080p)' */
function diagEventLine(e) {
  var d = new Date(e.at),
    hh = (d.getHours() < 10 ? '0' : '') + d.getHours(),
    mm = (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(),
    key = {
      media_error: 'evMediaError',
      media_start_retry: 'evSlowStart',
      streamref_failed: 'evPrepareFailed',
      play_rejected: 'evPlayRejected',
      addon_unavailable: 'evAddonDown',
      network_unreachable: 'evNoNetwork'
    }[e.kind];
  return hh + ':' + mm + '  ·  ' + tx(key || e.kind) + (e.detail ? ' (' + e.detail + ')' : '');
}
var settings = {
  idx: 0,
  els: [],
  defs: [],
  editing: false,
  editOriginal: null,
  enter: function (preserveEdit) {
    if (!preserveEdit) {
      this.editing = false;
      this.editOriginal = null;
    }
    var u = user() || {};
    $('setAcct').getElementsByClassName('em')[0].textContent = u.email || tx('connectedAccount');
    var prem = tx('freeAccount');
    if (u.premium_expire && String(u.premium_expire).indexOf('000') !== 0) {
      var d = new Date(u.premium_expire);
      if (d.getTime() > Date.now()) prem = tx('premiumUntil', d.toLocaleDateString());
    }
    $('setAcct').getElementsByClassName('pl')[0].textContent = prem;
    var langOpts = mediaLanguageOptions(),
      audioOpts = langOpts.slice(1);
    this.defs = [
      { head: tx('sourceGroup') },
      {
        k: 'preferredSourceQuality',
        lb: tx('preferredQuality'),
        opts: [
          ['Auto', tx('automatic')],
          ['4K', '4K'],
          ['1080p', '1080p'],
          ['720p', '720p'],
          ['SD', 'SD']
        ],
        d: 'Auto'
      },
      {
        k: 'preferredSourceLanguage',
        lb: tx('preferredLanguage'),
        opts: [
          ['Auto', tx('anyLanguage')],
          ['pt', 'Português'],
          ['es', 'Español'],
          ['en', 'English'],
          ['fr', 'Français'],
          ['it', 'Italiano'],
          ['de', 'Deutsch']
        ],
        d: 'Auto'
      },
      { head: tx('playbackGroup') },
      {
        k: 'bingeWatch',
        lb: tx('nextEpisode'),
        opts: [
          ['true', tx('enabled')],
          ['false', tx('disabled')]
        ],
        d: 'true'
      },
      {
        k: 'seekStep',
        lb: tx('seekInterval'),
        opts: [
          ['5', '5s'],
          ['10', '10s'],
          ['15', '15s'],
          ['20', '20s'],
          ['30', '30s']
        ],
        d: '10'
      },
      {
        k: 'scrubPreview',
        lb: tx('scrubPreview'),
        opts: [
          ['true', tx('enabled')],
          ['false', tx('disabled')]
        ],
        d: 'false'
      },
      { head: tx('subtitlesGroup') },
      { k: 'subsLang', lb: tx('defaultLanguage'), opts: langOpts, d: 'por' },
      {
        k: 'subtitleSize',
        lb: tx('subtitleSize'),
        opts: [
          ['0', '72%'],
          ['1', '80%'],
          ['2', '100%'],
          ['3', '120%'],
          ['4', '140%'],
          ['5', '160%'],
          ['6', '180%']
        ],
        d: '2'
      },
      {
        k: 'subsColor',
        lb: tx('subtitleColor'),
        opts: [
          ['#ffffff', tx('white')],
          ['#ffe600', tx('yellow')],
          ['#00e5ff', tx('cyan')]
        ],
        d: '#ffffff'
      },
      {
        k: 'subsOutlineColor',
        lb: tx('subtitleOutline'),
        opts: [
          ['#000000', tx('black')],
          ['#ffffff', tx('white')]
        ],
        d: '#000000'
      },
      {
        k: 'subsBgStyle',
        lb: tx('subtitleBackground'),
        opts: [
          ['0', tx('none')],
          ['1', tx('solid')],
          ['.6', tx('transparent')]
        ],
        d: '0'
      },
      {
        k: 'embSubsMode',
        lb: tx('embeddedSubtitles'),
        opts: [
          ['server', tx('extractRecommended')],
          ['native', tx('tvNative')]
        ],
        d: 'server'
      },
      { head: tx('audioGroup') },
      {
        k: 'enableDefaultAudioTrack',
        lb: tx('autoAudio'),
        opts: [
          ['true', tx('enabled')],
          ['false', tx('disabled')]
        ],
        d: 'false'
      },
      { k: 'defaultAudioTrack', lb: tx('defaultAudio'), opts: audioOpts, d: 'por' },
      { head: tx('interfaceGroup') },
      {
        k: UI_LANG_KEY,
        lb: tx('interfaceLanguage'),
        opts: [
          ['en-US', tx('english')],
          ['pt-BR', tx('portugueseBrazil')]
        ],
        d: 'en-US'
      },
      {
        k: 'uiTextSize',
        lb: tx('interfaceTextSize'),
        opts: [
          ['normal', tx('textNormal')],
          ['large', tx('textLarge')]
        ],
        d: 'normal'
      },
      {
        k: 'bgTrailer',
        lb: tx('backgroundTrailers'),
        opts: [
          ['false', tx('disabled')],
          ['true', tx('enabled')]
        ],
        d: 'false'
      },
      { head: tx('historyGroup') },
      { k: '__clearSearches', lb: tx('clearSearches'), action: true },
      { k: '__clearCw', lb: tx('clearCw'), action: true },
      { head: tx('addonsGroup') },
      { k: '__sync', lb: tx('syncAddons'), action: true },
      { head: tx('accountGroup') },
      { k: '__logout', lb: tx('signOut'), action: true },
      { head: tx('maintenanceGroup') },
      { k: '__diag', lb: tx('diagnostics'), action: true },
      { k: '__reload', lb: tx('reloadApp'), action: true }
    ];
    var host = $('setItems');
    host.innerHTML = '';
    this.els = [];
    this.fdefs = [];
    this.idx = 0;
    for (var i = 0; i < this.defs.length; i++) {
      var def = this.defs[i];
      if (def.head) {
        var hd = document.createElement('div');
        hd.className = 'setgrp';
        hd.textContent = def.head;
        host.appendChild(hd);
        continue;
      }
      var d = document.createElement('div');
      d.className = 'set' + (def.action ? ' act' : '');
      var l = document.createElement('div');
      l.className = 'lb';
      l.textContent = def.lb;
      d.appendChild(l);
      var v = document.createElement('div');
      v.className = 'vl';
      v.textContent = def.action ? '' : this.valLabel(def);
      d.appendChild(v);
      host.appendChild(d);
      this.els.push(d);
      this.fdefs.push(def);
    }
    this.paint();
    animIn($('setWrap'));
  },
  syncNow: function () {
    toast(tx('syncing'));
    pullLib(function () {
      invalidateBoards();
    });
    syncAddons(function (changed) {
      toast(changed ? tx('addonsUpdated') : tx('addonsCurrent'));
      if (changed) buildHomeRows(true);
    });
  },
  reloadNow: function () {
    manualRecover();
  },
  /* actions that are not Sync or Reload; the destructive one asks for a second OK */
  runAction: function (k) {
    if (k === '__diag') this.showDiag();
    else if (k === '__logout') this.logout();
    else if (k === '__clearSearches') {
      clearRecentSearches();
      toast(tx('searchesCleared'));
    } else if (k === '__clearCw') {
      if (!this.confirming(k)) return;
      var n = clearContinueWatching();
      toast(n ? tx('cwCleared', n) : tx('nothingToClear'));
    }
  },
  /* true on the second OK within 4 s; the first one turns the value into a prompt */
  confirming: function (k) {
    var row = this.els[this.idx],
      vl = row && row.getElementsByClassName('vl')[0];
    if (this.confirmKey === k && Date.now() < this.confirmUntil) {
      this.confirmKey = '';
      if (vl) vl.textContent = '';
      return true;
    }
    this.confirmKey = k;
    this.confirmUntil = Date.now() + 4000;
    if (vl) {
      vl.textContent = tx('confirmAgain');
      setTimeout(function () {
        vl.textContent = '';
      }, 4000);
    }
    return false;
  },
  /* the diagnostics panel opens under its row; OK again or Back closes it */
  closeDiag: function () {
    var box = $('setDiag');
    if (!box) return false;
    box.parentNode.removeChild(box);
    return true;
  },
  /* Numbers to compare before and after a change, read on the television itself. */
  showDiag: function () {
    if (this.closeDiag()) return;
    var row = this.els[this.idx],
      box = document.createElement('div');
    box.id = 'setDiag';
    box.className = 'setdiag';
    row.parentNode.insertBefore(box, row.nextSibling);
    box.textContent = tx('diagLoading');
    var heap =
        window.performance && performance.memory
          ? Math.round(performance.memory.usedJSHeapSize / 1048576)
          : '—',
      home = window.__STREMIO_HOME_LOAD_MS__ ? (window.__STREMIO_HOME_LOAD_MS__ / 1000).toFixed(1) : '—',
      shown = window.__STREMIO_VISIBLE_MS__ ? (window.__STREMIO_VISIBLE_MS__ / 1000).toFixed(1) : '—';
    xhrJson(
      '/diag',
      function (j) {
        if (!j || !j.server) {
          box.textContent = tx('diagUnavailable');
          return;
        }
        var lines = [
          tx('diagServer', j.server.rssMb, j.server.heapMb, j.uptimeMin),
          tx('diagTv', j.system.availableMb, j.system.totalMb, j.load),
          tx('diagStreaming', j.streamingServer ? tx('diagRunning') : tx('diagStopped')),
          tx('diagInterface', heap, shown, home),
          tx('diagPeak', j.peakRssMb, j.minAvailableMb)
        ];
        var events = j.events || [];
        lines.push(events.length ? tx('diagRecent') : tx('diagNoProblems'));
        for (var ev = 0; ev < events.length && ev < 5; ev++) lines.push(diagEventLine(events[ev]));
        box.textContent = '';
        for (var i = 0; i < lines.length; i++) {
          var line = document.createElement('div');
          line.textContent = lines[i];
          box.appendChild(line);
        }
      },
      5000
    );
  },
  valLabel: function (def) {
    var cur = lsRaw(def.k, def.d);
    for (var i = 0; i < def.opts.length; i++) if (def.opts[i][0] === cur) return def.opts[i][1] + '  ›';
    return def.opts[0][1] + '  ›';
  },
  cycle: function (def, dir) {
    var cur = lsRaw(def.k, def.d),
      ci = 0;
    for (var i = 0; i < def.opts.length; i++) if (def.opts[i][0] === cur) ci = i;
    ci = (ci + dir + def.opts.length) % def.opts.length;
    lsRawSet(def.k, def.opts[ci][0]);
    if (def.k === 'uiTextSize') applyTextSize();
    if (def.k === UI_LANG_KEY) {
      var keep = this.idx;
      setUILanguage(def.opts[ci][0]);
      this.enter(true);
      this.idx = Math.min(keep, this.els.length - 1);
      this.paint();
      return true;
    }
    if (def.k === 'bingeWatch') lsRawSet('enableNextVideo', def.opts[ci][0]);
    return false;
  },
  startEdit: function () {
    var def = this.fdefs[this.idx];
    if (!def || def.action) return;
    this.editing = true;
    this.editOriginal = { k: def.k, v: lsRaw(def.k, def.d) };
    this.paint();
  },
  finishEdit: function () {
    this.editing = false;
    this.editOriginal = null;
    this.paint();
  },
  cancelEdit: function () {
    if (!this.editing) return;
    var old = this.editOriginal,
      idx = this.idx;
    this.editing = false;
    this.editOriginal = null;
    if (old) {
      lsRawSet(old.k, old.v);
      if (old.k === UI_LANG_KEY) {
        setUILanguage(old.v);
        this.enter();
        this.idx = Math.min(idx, this.els.length - 1);
      }
    }
    this.paint();
  },
  logout: function () {
    var ak = authKey();
    toast(tx('signingOut'));
    postJson(API + '/api/logout', { authKey: ak }, function () {}, 4000);
    var kill = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (
        k === 'authKey' ||
        k === 'user' ||
        k === 'addons' ||
        k === 'addonsLastModified' ||
        k === 'blib_migrated' ||
        k.indexOf('lib_') === 0 ||
        k.indexOf('blib_') === 0 ||
        k.indexOf('subs_') === 0 ||
        k.indexOf('tvstream_') === 0 ||
        k.indexOf('beta_') === 0
      )
        kill.push(k);
    }
    for (var j = 0; j < kill.length; j++) {
      try {
        localStorage.removeItem(kill[j]);
      } catch (e) {}
    }
    setTimeout(function () {
      location.reload();
    }, 400);
  },
  focusTop: function () {
    this.editing = false;
    this.editOriginal = null;
    this.idx = 0;
    this.paint();
  },
  paint: function () {
    setF(this.els, topNav.active ? -1 : this.idx);
    for (var c = 0; c < this.els.length; c++)
      this.els[c].className =
        this.els[c].className.replace(/ ?\bediting\b/, '') +
        (this.editing && c === this.idx ? ' editing' : '');
    if ($('setHint')) $('setHint').textContent = tx(this.editing ? 'settingsEditing' : 'settingsHint');
    var el = this.els[this.idx],
      y = 0;
    if (el && el.offsetTop > 620) y = el.offsetTop - 620;
    $('setInner').style.transform = 'translateY(-' + y + 'px)';
    $('setInner').style.webkitTransform = 'translateY(-' + y + 'px)';
  },
  key: function (k) {
    var def = this.fdefs[this.idx];
    if (this.editing) {
      if ((k === 37 || k === 39) && def && !def.action) {
        var changed = this.cycle(def, k === 39 ? 1 : -1);
        if (!changed && this.els[this.idx])
          this.els[this.idx].getElementsByClassName('vl')[0].textContent = this.valLabel(def);
      } else if (k === 13) this.finishEdit();
      this.paint();
      return true;
    }
    if (k === 40) this.idx = Math.min(this.els.length - 1, this.idx + 1);
    else if (k === 38) {
      if (this.idx > 0) this.idx--;
      else {
        topNav.focus();
        return true;
      }
    } else if (k === 37) {
      topNav.focus();
      return true;
    } else if (k === 13 && def) {
      if (def.action) {
        if (def.k === '__sync') this.syncNow();
        else if (def.k === '__reload') this.reloadNow();
        else this.runAction(def.k);
        return true;
      }
      this.startEdit();
      return true;
    }
    this.paint();
    return true;
  }
};
