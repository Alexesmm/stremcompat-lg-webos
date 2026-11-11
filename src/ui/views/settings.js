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
/* running or stopped; the engine itself only runs while a torrent plays */
function diagStreamingState(j) {
  var f = j.torrentEngine || {};
  if (j.serverAddress)
    return j.serverAddress + '  ·  ' + tx(j.streamingServer ? 'diagRunning' : 'diagStopped');
  if (f.state === 'failed') return tx('diagStreamFailed', 'sc-engine');
  if (f.state === 'no-room') return tx('torrentsNoRoom');
  var where = f.usb ? '  ·  ' + tx('diagOnUsb') : '',
    cache = f.cacheMb != null && f.cacheCapMb ? '  ·  ' + tx('diagCache', f.cacheMb, f.cacheCapMb) : '';
  return tx(f.running ? 'diagRunning' : 'diagEngineReady') + where + cache;
}
/* an option that is only on or off is drawn as a switch, and OK flips it */
function isSwitch(def) {
  return (
    !!def.opts &&
    def.opts.length === 2 &&
    /^(true|false)$/.test(def.opts[0][0]) &&
    /^(true|false)$/.test(def.opts[1][0])
  );
}
/* Settings in two columns, as the big streaming apps lay them out: the groups on the left and
   the options of the chosen group on the right. Moving through the groups shows their options
   at once; Right or OK goes into them and Left comes back. */
var settings = {
  idx: 0,
  els: [],
  defs: [],
  cats: [],
  catEls: [],
  catIdx: 0,
  zone: 'cats',
  editing: false,
  editOriginal: null,
  enter: function (preserveEdit) {
    if (!preserveEdit) {
      this.editing = false;
      this.editOriginal = null;
    }
    var u = user() || {};
    $('setAcct').getElementsByClassName('em')[0].textContent = u.email || tx('connectedAccount');
    var prem = tx(isNuvioAccount() ? 'nuvioAccountLabel' : 'freeAccount');
    if (u.premium_expire && String(u.premium_expire).indexOf('000') !== 0) {
      var d = new Date(u.premium_expire);
      if (d.getTime() > Date.now()) prem = tx('premiumUntil', d.toLocaleDateString());
    }
    $('setAcct').getElementsByClassName('pl')[0].textContent = prem;
    var langOpts = mediaLanguageOptions(),
      audioOpts = langOpts.slice(1),
      backupOpts = [['', tx('none')]].concat(audioOpts);
    this.defs = [
      { head: tx('playbackGroup'), id: 'playback' },
      {
        k: 'preferredSourceQuality',
        lb: tx('preferredQuality'),
        opts: [
          ['Ask', tx('qualityAsk')],
          ['Auto', tx('automatic')],
          ['4K', '4K'],
          ['1080p', '1080p'],
          ['720p', '720p'],
          ['SD', 'SD']
        ],
        d: 'Ask'
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
      { head: tx('subtitlesGroup'), id: 'subtitles' },
      { k: 'subsLang', lb: tx('defaultLanguage'), opts: langOpts, d: defaultMediaLanguage() },
      { k: 'subsLang2', lb: tx('backupLanguage'), opts: backupOpts, d: '' },
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
        k: 'assStyle',
        lb: tx('assStyle'),
        opts: [
          ['false', tx('disabled')],
          ['true', tx('enabled')]
        ],
        d: 'false'
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
      { head: tx('audioGroup'), id: 'audio' },
      {
        k: 'enableDefaultAudioTrack',
        lb: tx('autoAudio'),
        opts: [
          ['true', tx('enabled')],
          ['false', tx('disabled')]
        ],
        d: 'false'
      },
      { k: 'defaultAudioTrack', lb: tx('defaultAudio'), opts: audioOpts, d: defaultMediaLanguage() },
      { k: 'defaultAudioTrack2', lb: tx('backupLanguage'), opts: backupOpts, d: '' },
      { head: tx('interfaceGroup'), id: 'interface' },
      {
        k: UI_LANG_KEY,
        lb: tx('interfaceLanguage'),
        opts: Object.keys(UI_LANGUAGES).map(function (code) {
          return [code, UI_LANGUAGES[code]];
        }),
        d: UI_LANG
      },
      {
        k: 'uiMode',
        lb: tx('uiModeLabel'),
        opts: [
          ['full', tx('modeFull')],
          ['simple', tx('modeSimple')]
        ],
        d: 'full'
      },
      {
        k: 'uiLook',
        lb: tx('uiLookLabel'),
        opts: [
          ['standard', tx('lookStandard')],
          ['light', tx('lookLight')]
        ],
        d: uiLook()
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
      { head: tx('accountGroup'), id: 'account' },
      { k: '__profile', lb: tx('nuvioProfile'), action: true },
      { k: '__sync', lb: tx('syncAddons'), action: true },
      { head: tx('historyGroup'), id: 'history' },
      {
        k: 'noHistory',
        lb: tx('noHistory'),
        opts: [
          ['false', tx('disabled')],
          ['true', tx('enabled')]
        ],
        d: 'false'
      },
      { k: '__clearSearches', lb: tx('clearSearches'), action: true },
      { k: '__clearCw', lb: tx('clearCw'), action: true },
      { k: '__showNew', lb: tx('showHiddenNewEpisodes'), action: true },
      {
        k: 'torrentsOnUsb',
        lb: tx('torrentsOnUsb'),
        opts: [
          ['false', tx('disabled')],
          ['true', tx('enabled')]
        ],
        d: 'false'
      },
      { k: '__clearCache', lb: tx('clearTorrentCache'), action: true },
      { head: tx('maintenanceGroup'), id: 'maintenance' },
      { k: '__server', lb: tx('serverAddress'), action: true, info: true },
      { k: '__diag', lb: tx('diagnostics'), action: true },
      { k: '__speed', lb: tx('testConnection'), action: true },
      { k: '__reload', lb: tx('reloadApp'), action: true },
      { head: tx('signOut'), id: 'logout' },
      { k: '__logout', lb: tx('signOut'), action: true }
    ];
    /* profiles exist only on Nuvio accounts */
    if (!isNuvioAccount())
      this.defs = this.defs.filter(function (d) {
        return d.k !== '__profile';
      });
    /* Simple keeps what most people change: languages, subtitle size, the look and the account */
    if (simpleMode()) {
      var essential =
        /^(subsLang|subsLang2|subtitleSize|enableDefaultAudioTrack|defaultAudioTrack|bingeWatch|preferredSourceQuality|uiLanguage|uiMode|uiLook|uiTextSize|__profile|__logout|__diag|__reload)$/;
      this.defs = this.defs.filter(function (d) {
        return d.head || essential.test(d.k || '');
      });
      /* a heading with nothing under it goes too */
      this.defs = this.defs.filter(function (d, i, all) {
        return !d.head || (all[i + 1] && !all[i + 1].head);
      });
    }
    /* these depend on FFmpeg or on memory only the LG packages can spare */
    if (!HAS_MEDIA_TOOLS)
      for (var nf = this.defs.length - 1; nf >= 0; nf--)
        if (/^(scrubPreview|embSubsMode|bgTrailer|torrentsOnUsb|__clearCache)$/.test(this.defs[nf].k || ''))
          this.defs.splice(nf, 1);
    var oldCats = this.cats;
    this.cats = [];
    for (var i = 0; i < this.defs.length; i++) {
      var def = this.defs[i];
      if (def.head) this.cats.push({ name: def.head, id: def.id || '', items: [] });
      else if (this.cats.length) this.cats[this.cats.length - 1].items.push(def);
    }
    this.cats = this.cats.filter(function (c) {
      return c.items.length;
    });
    var keepCat = preserveEdit && oldCats.length ? oldCats[this.catIdx].id : '',
      keepKey = preserveEdit && this.fdefs && this.fdefs[this.idx] ? this.fdefs[this.idx].k : '';
    var catHost = $('setCats');
    catHost.innerHTML = '';
    this.catEls = [];
    for (var c = 0; c < this.cats.length; c++) {
      var el = document.createElement('div');
      el.className = 'setcat' + (this.cats[c].id === 'logout' ? ' out' : '');
      el.textContent = this.cats[c].name;
      if (this.cats[c].id === keepCat) this.catIdx = c;
      catHost.appendChild(el);
      this.catEls.push(el);
    }
    if (!preserveEdit) {
      this.catIdx = 0;
      this.zone = 'cats';
    }
    this.catIdx = Math.min(this.catIdx, this.cats.length - 1);
    this.showCat();
    for (var f = 0; f < this.fdefs.length; f++) if (this.fdefs[f].k === keepKey) this.idx = f;
    this.paint();
    this.showServerAddress();
    animIn($('setWrap'));
  },
  /* the options of the chosen group, as cards; the account card heads the Account group */
  showCat: function () {
    var cat = this.cats[this.catIdx],
      host = $('setItems');
    host.innerHTML = '';
    this.els = [];
    this.fdefs = [];
    this.idx = 0;
    $('setAcct').style.display = cat.id === 'account' || cat.id === 'logout' ? '' : 'none';
    var hd = document.createElement('div');
    hd.className = 'setgrp';
    hd.textContent = cat.name;
    host.appendChild(hd);
    for (var i = 0; i < cat.items.length; i++) {
      var def = cat.items[i],
        d = document.createElement('div'),
        l = document.createElement('div'),
        v = document.createElement('div');
      d.className =
        'set' + (def.action ? ' act' : '') + (def.info ? ' info' : '') + (def.k === '__logout' ? ' out' : '');
      l.className = 'lb';
      l.textContent = def.lb;
      d.appendChild(l);
      v.className = 'vl';
      d.appendChild(v);
      host.appendChild(d);
      this.els.push(d);
      this.fdefs.push(def);
      this.paintValue(i);
    }
    this.paintServerAddress();
    this.paint();
  },
  /* a switch for on and off, otherwise the chosen value */
  paintValue: function (i) {
    var def = this.fdefs[i],
      v = this.els[i] && this.els[i].getElementsByClassName('vl')[0];
    if (!v || def.action) return;
    if (isSwitch(def)) {
      v.className = 'vl sw' + (lsRaw(def.k, def.d) === 'true' ? ' on' : '');
      v.textContent = '';
    } else v.textContent = this.valLabel(def);
  },
  /* Account from the profile item of the side menu */
  openCategory: function (id) {
    for (var c = 0; c < this.cats.length; c++)
      if (this.cats[c].id === id) {
        this.catIdx = c;
        this.showCat();
        this.zone = 'items';
        topNav.active = false;
        topNav.paint();
        this.paint();
      }
  },
  /* OK on an option: an action runs, a switch flips, anything else starts editing */
  activate: function () {
    var def = this.fdefs[this.idx];
    if (!def) return;
    if (def.action) {
      if (def.k === '__sync') this.syncNow();
      else if (def.k === '__reload') this.reloadNow();
      else this.runAction(def.k);
    } else if (isSwitch(def)) {
      if (!this.cycle(def, 1)) this.paintValue(this.idx);
    } else this.startEdit();
  },
  /* the value of the address row comes from the local server */
  serverAddress: '',
  showServerAddress: function () {
    var self = this;
    xhrJson(
      '/serverconfig',
      function (j) {
        self.serverAddress = (j && j.address) || '';
        self.paintServerAddress();
      },
      3000
    );
  },
  paintServerAddress: function () {
    if (!this.fdefs) return;
    for (var i = 0; i < this.fdefs.length; i++)
      if (this.fdefs[i].k === '__server')
        this.els[i].getElementsByClassName('vl')[0].textContent =
          this.serverAddress.replace(/^https?:\/\//, '') || tx('serverHere');
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
    if (k === '__server') {
      var self = this;
      serverPanel.show(this.serverAddress, function (address) {
        self.serverAddress = address;
        self.paintServerAddress();
      });
    } else if (k === '__diag') this.showDiag();
    else if (k === '__profile') openProfile();
    else if (k === '__logout') this.logout();
    else if (k === '__clearSearches') {
      clearRecentSearches();
      toast(tx('searchesCleared'));
    } else if (k === '__speed') {
      toast(tx('testingConnection'), 12000);
      xhrJson(
        '/speedtest',
        function (j) {
          if (!j || j.latencyMs == null) return toast(tx('connectionFailed', (j && j.error) || '—'), 6000);
          var line = tx('connectionLatency', j.latencyMs);
          if (j.mbps != null) line += '  ·  ' + tx('connectionSpeed', j.mbps, j.host);
          toast(line, 9000);
        },
        20000
      );
    } else if (k === '__clearCache') {
      xhrJson(
        '/clearcache',
        function (j) {
          if (!j) toast(tx('diagUnavailable'));
          else if (j.running) toast(tx('cacheInUse'));
          else toast(j.mb ? tx('cacheCleared', j.mb) : tx('nothingToClear'));
        },
        8000
      );
    } else if (k === '__showNew') {
      var hiddenCount = hiddenNewEpisodes().length;
      lsSet(NEW_EPISODES_HIDDEN, []);
      toast(hiddenCount ? tx('newEpisodesShown', hiddenCount) : tx('nothingToClear'));
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
      home = window.__SC_HOME_LOAD_MS__ ? (window.__SC_HOME_LOAD_MS__ / 1000).toFixed(1) : '—',
      shown = window.__SC_VISIBLE_MS__ ? (window.__SC_VISIBLE_MS__ / 1000).toFixed(1) : '—';
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
          j.disk ? tx('diagDisk', j.disk.freeMb, j.disk.totalMb) : '',
          tx('diagStreaming', diagStreamingState(j)),
          j.nativeProbe ? 'Native code: ' + j.nativeProbe : '',
          tx('diagInterface', heap, shown, home),
          tx('diagPeak', j.peakRssMb, j.minAvailableMb),
          smoothnessLine()
        ];
        var events = j.events || [];
        lines.push(events.length ? tx('diagRecent') : tx('diagNoProblems'));
        for (var ev = 0; ev < events.length && ev < 5; ev++) lines.push(diagEventLine(events[ev]));
        box.textContent = '';
        for (var i = 0; i < lines.length; i++) {
          if (!lines[i]) continue;
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
    if (def.k === 'uiLook') applyLook();
    if (def.k === 'uiMode' || def.k === UI_LANG_KEY) {
      if (def.k === UI_LANG_KEY) setUILanguage(def.opts[ci][0]);
      this.enter(true);
      return true;
    }
    if (def.k === 'bingeWatch') lsRawSet('enableNextVideo', def.opts[ci][0]);
    /* the server chooses where torrents go */
    if (def.k === 'torrentsOnUsb')
      xhrJson('/torrentplace?usb=' + (def.opts[ci][0] === 'true' ? '1' : '0'), function () {}, 5000);
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
        this.enter(true);
      } else this.paintValue(idx);
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
        k === 'profileFace' ||
        k === 'newEpisodes' ||
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
    this.zone = 'cats';
    this.paint();
  },
  paint: function () {
    var onCats = !topNav.active && this.zone === 'cats';
    for (var g = 0; g < this.catEls.length; g++)
      this.catEls[g].className =
        'setcat' +
        (this.cats[g].id === 'logout' ? ' out' : '') +
        (g === this.catIdx ? (onCats ? ' f' : ' cur') : '');
    setF(this.els, topNav.active || this.zone !== 'items' ? -1 : this.idx);
    for (var c = 0; c < this.els.length; c++)
      this.els[c].className =
        this.els[c].className.replace(/ ?\bediting\b/, '') +
        (this.editing && c === this.idx ? ' editing' : '');
    if ($('setHint')) $('setHint').textContent = tx(this.editing ? 'settingsEditing' : 'settingsHint');
    var el = this.els[this.idx],
      y = 0,
      /* the focus stops at this height of the screen, whatever its resolution */
      stop = Math.round($('setPane').clientHeight * 0.63);
    if (this.zone === 'items' && el && el.offsetTop > stop) y = el.offsetTop - stop;
    $('setInner').style.transform = 'translateY(-' + y + 'px)';
    $('setInner').style.webkitTransform = 'translateY(-' + y + 'px)';
  },
  key: function (k) {
    var def = this.fdefs[this.idx];
    if (this.editing) {
      if ((k === 37 || k === 39) && def && !def.action) {
        if (!this.cycle(def, k === 39 ? 1 : -1)) this.paintValue(this.idx);
      } else if (k === 13) this.finishEdit();
      this.paint();
      return true;
    }
    if (this.zone === 'cats') {
      if (k === 40 || k === 38) {
        var next = Math.max(0, Math.min(this.cats.length - 1, this.catIdx + (k === 40 ? 1 : -1)));
        if (next !== this.catIdx) {
          this.catIdx = next;
          this.showCat();
        }
      } else if (k === 37) {
        topNav.focus();
        return true;
      } else if (k === 39 || k === 13) this.zone = 'items';
      this.paint();
      return true;
    }
    if (k === 40) this.idx = Math.min(this.els.length - 1, this.idx + 1);
    else if (k === 38) {
      if (this.idx > 0) this.idx--;
    } else if (k === 37) this.zone = 'cats';
    else if (k === 13 && def) {
      this.activate();
      return true;
    }
    this.paint();
    return true;
  }
};
