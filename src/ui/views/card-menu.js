// Long-press OK side menu available on every card.
/* ================= unified long-press side menu (any card) ================= */
var cwMenu = {
  open: false,
  idx: 0,
  els: [],
  acts: [],
  it: null,
  /* the panel with a title, a subtitle and no entries yet (show, confirmExit) */
  begin: function (title, sub) {
    this.open = true;
    this.idx = 0;
    this.onBack = null;
    $('cwmItems').innerHTML = '';
    this.els = [];
    this.acts = [];
    $('cwmTitle').textContent = title || '';
    $('cwmSub').textContent = sub;
  },
  add: function (ic, lb, fn) {
    var d = document.createElement('div');
    d.className = 'cwmi';
    d.innerHTML = ic + '<span>' + esc(lb) + '</span>';
    $('cwmItems').appendChild(d);
    this.els.push(d);
    this.acts.push(fn);
  },
  /* Back on the last screen asks before leaving the app, so a few presses too many
     do not close Stremio by accident */
  confirmExit: function () {
    var self = this;
    this.it = null;
    this.begin(tx('exitTitle'), tx('exitSub'));
    this.add(ICON.check, tx('exitStay'), function () {
      self.close();
    });
    this.add(ICON.exit, tx('exitLeave'), function () {
      self.close();
      exitApp();
    });
    $('cwm').style.display = 'block';
    this.paint();
  },
  /* Left or Back: a list opened from another one goes back to it, anything else closes */
  back: function () {
    if (this.onBack) this.onBack();
    else this.close();
  },
  /* Best source asks the quality and the audio language, unless Settings names them. The first
     row, "Audio: Português ›", opens the list of languages (the choice is kept for the next
     time); the other rows start the film. then(quality, language) */
  withBestChoice: function (then) {
    var quality = lsRaw('preferredSourceQuality', 'Ask'),
      askLanguage = lsRaw('preferredSourceLanguage', 'Ask') === 'Ask',
      language = preferredSourceLanguage(),
      self = this;
    if (quality !== 'Ask' && !askLanguage) return then(quality, language);
    function languageName(code) {
      return code === 'Auto' ? tx('anyAudioLanguage') : sourceLanguageName(code);
    }
    function qualities() {
      self.begin(
        tx(quality === 'Ask' ? 'whichQuality' : 'playBest'),
        language === 'Auto' ? tx('bestAudioAny') : tx('bestAudioHint', sourceLanguageName(language))
      );
      if (askLanguage)
        self.add(GLOBE_ICON, tx('sourceLanguageRow', languageName(language)) + '  \u203a', languages);
      var options =
        quality === 'Ask'
          ? [
              ['1080p', '1080p'],
              ['720p', '720p'],
              ['4K', '4K'],
              ['Auto', tx('automatic')]
            ]
          : [[quality, tx('playBest')]];
      options.forEach(function (option) {
        self.add(ICON.bolt, option[1], function () {
          self.close();
          then(option[0], language);
        });
      });
      /* the focus starts on the first quality, the language row stays one step up */
      self.idx = askLanguage ? 1 : 0;
      self.paint();
    }
    function languages() {
      self.begin(tx('audioLanguageTitle'), tx('audioLanguageSub'));
      self.onBack = qualities;
      ['Auto']
        .concat(
          SOURCE_LANGUAGES.map(function (l) {
            return l[0];
          })
        )
        .forEach(function (code, i) {
          if (code === language) self.idx = i;
          self.add(
            code === language ? ICON.check : '<svg viewBox="0 0 24 24"></svg>',
            languageName(code),
            function () {
              language = code;
              lsRawSet('bestLanguage', code);
              qualities();
            }
          );
        });
      self.paint();
    }
    this.it = null;
    $('cwm').style.display = 'block';
    qualities();
  },
  show: function (it) {
    this.it = it;
    var self = this;
    var sub = it.type === 'series' ? tx('seriesOne') : tx('movie');
    if (it.cw && it.videoId && it.videoId.indexOf(':') > 0) {
      var pp = it.videoId.split(':');
      sub = tx('seasonEpisode', pp[pp.length - 2], pp[pp.length - 1]);
    }
    this.begin(it.name, sub);
    function add(ic, lb, fn) {
      self.add(ic, lb, fn);
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
    if (it.cw)
      add(ICON.close, tx('removeFromCw'), function () {
        removeFromCw(it);
        self.close();
        refreshCurBoard();
        toast(tx('removedFromCw'));
      });
    if (it.fresh)
      add(ICON.close, tx('hideNewEpisodes'), function () {
        hideNewEpisodes(it.id);
        self.close();
        buildHomeRows(true);
        toast(tx('newEpisodesHidden'));
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
      this.back();
      return true;
    }
    this.paint();
    return true;
  }
};
