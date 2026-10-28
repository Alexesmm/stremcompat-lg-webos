// Title detail screen: actions, seasons, episode ranges and episode list.
var detail = {
  meta: null,
  type: '',
  id: '',
  vid: null,
  zone: 'btns',
  btnIdx: 0,
  btnEls: [],
  btnActs: [],
  baseMeta: '',
  baseDesc: '',
  baseInfo: '',
  seasons: [],
  linearEps: [],
  seasonIdx: 0,
  rangeIdx: 0,
  episodeMode: 'season',
  eps: [],
  epIdx: 0,
  epEls: [],
  seasonEls: [],
  seasonActs: [],
  seasonControlIdx: 0,
  watchedMap: {},
  enter: function (p) {
    p = p || { type: this.type, id: this.id };
    this.type = p.type;
    this.id = p.id;
    this.vid = p.vid || null;
    /* reached with Back: the viewer already saw (or dismissed) the sources */
    this.restored = !!p.restored;
    this.zone = 'btns';
    this.btnIdx = 0;
    this.meta = null;
    this.watchedMap = {};
    this.episodeMode = 'season';
    this.seasonIdx = 0;
    this.rangeIdx = 0;
    this.epIdx = 0;
    this.seasonControlIdx = 0;
    $('dTitle').textContent = '';
    $('dDesc').textContent = '';
    $('dMeta').textContent = '';
    $('dInfo').innerHTML = '';
    /* Reused image nodes must be cleared before the next metadata request. Otherwise
     paint() can reveal the previous title while the replacement is still loading. */
    $('dLogo').style.display = 'none';
    $('dLogo').src = BLANK_IMG;
    $('dPoster').style.display = 'none';
    $('dPoster').src = BLANK_IMG;
    $('dPoster')._detailId = '';
    $('dBtns').innerHTML = '';
    $('dSeasons').style.display = 'none';
    $('dEps').style.display = 'none';
    var self = this;
    getMeta(this.type, this.id, function (m) {
      if (!m) {
        toast(tx('couldNotLoad'));
        return;
      }
      if (SCR !== 'detail' || detail.id !== p.id) return;
      self.meta = m;
      self.render();
      self.loadWatched();
      var keepId = self.currentEpisode() && self.currentEpisode().id;
      enrichEpisodeMetadata(self.type, self.id, m, function (changed) {
        if (!changed || SCR !== 'detail' || detail.id !== p.id) return;
        self.buildSeasons();
        if (keepId) self.selectEpisode(keepId, true);
        self.paint();
      });
    });
  },
  render: function () {
    var m = this.meta;
    $('dTitle').textContent = m.name || '';
    var lg = $('dLogo');
    var mediaId = this.id;
    if (m.logo) {
      var im = new Image();
      im.onload = function () {
        if (detail.meta === m && detail.id === mediaId) {
          lg.src = m.logo;
          lg.style.display = 'block';
          $('dTitle').style.display = 'none';
        }
      };
      im.src = m.logo;
    } else {
      $('dTitle').style.display = 'block';
    }
    if (m.poster) {
      var pi = new Image();
      pi.onload = function () {
        if (detail.meta === m && detail.id === mediaId) {
          var dp = $('dPoster');
          dp.src = m.poster;
          dp._detailId = mediaId;
          if (detail.zone !== 'eps') dp.style.display = 'block';
        }
      };
      pi.src = m.poster;
    }
    var bits = [];
    if (m.releaseInfo || m.year) bits.push(m.releaseInfo || m.year);
    if (m.runtime) bits.push(m.runtime);
    if (m.genres && m.genres.length) bits.push(m.genres.slice(0, 3).join(' · '));
    var rate = m.imdbRating
      ? '<span class="drating">★ ' + esc(m.imdbRating) + '</span>&nbsp;&nbsp;·&nbsp;&nbsp;'
      : '';
    $('dMeta').innerHTML = rate + esc(bits.join('  ·  '));
    var info = '';
    if (m.cast && m.cast.length)
      info +=
        '<div><span class="dlbl">' + tx('cast') + '</span>' + esc(m.cast.slice(0, 5).join(', ')) + '</div>';
    if (m.director && m.director.length)
      info +=
        '<div><span class="dlbl">' +
        tx('director') +
        '</span>' +
        esc(m.director.slice(0, 2).join(', ')) +
        '</div>';
    if (m.writer && m.writer.length)
      info +=
        '<div><span class="dlbl">' +
        tx('writers') +
        '</span>' +
        esc(m.writer.slice(0, 3).join(', ')) +
        '</div>';
    if (m.country) info += '<div><span class="dlbl">' + tx('country') + '</span>' + esc(m.country) + '</div>';
    if (m.awards)
      info +=
        '<div><span class="dlbl">' + tx('awards') + '</span>' + esc(String(m.awards).slice(0, 80)) + '</div>';
    $('dInfo').innerHTML = info;
    $('dDesc').textContent = m.description || '';
    this.baseMeta = $('dMeta').innerHTML;
    this.baseInfo = info;
    this.baseDesc = m.description || '';
    setBg(m.background || bgOf({ id: this.id, poster: m.poster }));
    var bt = $('dBtns');
    bt.innerHTML = '';
    this.btnEls = [];
    this.btnActs = [];
    var self = this;
    this.loadWatched();
    if (this.type === 'series') this.buildSeasons();
    /* Series: the episode to land on is the deep-linked one, then the one in progress,
       then the first released one not watched. */
    var av = null;
    if (this.type === 'series') {
      var lib = lsJson(PRE + this.id);
      av =
        this.vid ||
        (lib && lib.state && lib.state.timeOffset > 60000 && lib.state.video_id) ||
        this.firstUnwatched();
      this.vid = null;
    }
    /* The first button continues or starts what the viewer most likely wants, in one press:
       "Continue S2 E5 · 12 min left", "Play S1 E9" or, for a film, "Continue · 48 min left". */
    var resume = this.resumeInfo(),
      primary = resume && (this.type !== 'series' || !av || resume.videoId === av) ? resume : null;
    if (primary)
      this.addBtn(this.resumeLabel(primary), function () {
        self.playFrom(primary);
      });
    else if (this.type === 'series' && av) {
      var first = { videoId: av, upNext: true };
      this.addBtn(this.resumeLabel(first), function () {
        self.openStreams(av);
      });
    }
    if (this.type !== 'series')
      this.addBtn(tx('watch'), function () {
        self.openStreams(self.id);
      });
    var hasTr = (m.trailers && m.trailers.length) || (m.trailerStreams && m.trailerStreams.length);
    if (hasTr)
      this.addBtn(tx('trailer'), function () {
        self.playTrailer();
      });
    this.addBtn(tx('similar'), function () {
      goScr('sim', { type: self.type, id: self.id, name: m.name });
    });
    this.addBtn(this.inLib() ? tx('inLibrary') : tx('libraryButton'), function () {
      self.toggleLib();
    });
    this.paint();
    if (this.type === 'series') {
      if (av) {
        /* the list scrolls to that episode while the focus stays on the first button */
        this.selectEpisode(av, true);
        this.zone = 'btns';
        this.btnIdx = 0;
        this.paint();
        if (hasNextSourcePreference(this.id, av)) {
          var nextSelf = this;
          setTimeout(function () {
            if (SCR === 'detail' && !streamsUI.open) nextSelf.openStreams(av);
          }, 250);
        }
      }
    }
    /* the player asked for another source after this one failed */
    var retryVid = this.type === 'series' ? av : this.id;
    if (retryVid && hasRetryRequest(this.id, retryVid))
      setTimeout(function () {
        if (SCR === 'detail' && !streamsUI.open) self.openStreams(retryVid);
      }, 250);
    else if (this.type !== 'series' && !this.restored && !primary) {
      /* a new film opens its sources; one in progress, or one the viewer just came back
         from, waits on its Continue / Watch buttons instead */
      setTimeout(function () {
        if (SCR === 'detail' && detail.meta === m && !streamsUI.open) self.openStreams(self.id);
      }, 250);
    }
  },
  /* saved progress worth offering, in the Continue Watching card shape (account.js) */
  resumeInfo: function () {
    var lib = lsJson(PRE + this.id),
      s = lib && lib.state;
    if (!s) return null;
    var c = cwCard(lib);
    if (c.upNext) return c;
    if (!(s.timeOffset > 60000) || watchFinished(s.timeOffset, s.duration)) return null;
    return c;
  },
  resumeLabel: function (c) {
    var pp = String(c.videoId || '').split(':'),
      ep = pp.length >= 3 ? [pp[pp.length - 2], pp[pp.length - 1]] : null;
    if (c.upNext) return ep ? tx('playEpisode', ep[0], ep[1]) : tx('watch');
    var left = c.minutesLeft ? '  ·  ' + tx('cwLeft', c.minutesLeft) : '';
    return (ep ? tx('continueEpisode', ep[0], ep[1]) : tx('continueLabel')) + left;
  },
  /* the same source when it was remembered, otherwise the source list for that video */
  playFrom: function (c) {
    var q = resumeSearch(this.id, c.videoId);
    if (q && !c.upNext)
      playStored(
        q,
        'beta#detail/' + this.type + '/' + this.id + (c.videoId !== this.id ? '/' + c.videoId : '')
      );
    else this.openStreams(c.videoId);
  },
  addBtn: function (label, act) {
    var b = document.createElement('div');
    b.className = 'btn';
    b.textContent = label;
    $('dBtns').appendChild(b);
    this.btnEls.push(b);
    this.btnActs.push(act);
  },
  inLib: function () {
    var it = lsJson(PRE + this.id);
    return !!(it && it.removed === false);
  },
  toggleLib: function () {
    var m = this.meta || {};
    var now = new Date().toISOString();
    var it = lsJson(PRE + this.id);
    if (it && it.removed === false) {
      it.removed = true;
      it._mtime = now;
      lsSet(PRE + this.id, it);
      toast(tx('removedLibrary'));
    } else {
      if (!it)
        it = {
          state: {
            lastWatched: now,
            timeOffset: 0,
            timeWatched: 0,
            overallTimeWatched: 0,
            timesWatched: 0,
            flaggedWatched: 0,
            duration: 0,
            video_id: this.id,
            watched: '',
            noNotif: false,
            season: 0,
            episode: 0,
            watchedEpisodes: []
          },
          _id: this.id,
          _ctime: now
        };
      it.removed = false;
      it.temp = false;
      it._mtime = now;
      it.name = m.name || it.name || '';
      it.type = this.type;
      it.poster = m.poster || it.poster || '';
      it.posterShape = 'poster';
      it.background = m.background || it.background || '';
      it.logo = m.logo || it.logo || '';
      it.year = m.year || it.year || '';
      lsSet(PRE + this.id, it);
      toast(tx('addedLibrary'));
    }
    pushLib(lsJson(PRE + this.id));
    invalidateBoards();
    var lbl = this.inLib() ? tx('inLibrary') : tx('libraryButton');
    for (var i = 0; i < this.btnEls.length; i++) {
      var t = this.btnEls[i].textContent;
      if (t === tx('libraryButton') || t === tx('inLibrary')) this.btnEls[i].textContent = lbl;
    }
  },
  playTrailer: function () {
    var t = trailerIdOf(this.meta);
    if (!t) {
      toast(tx('noTrailer'));
      return;
    }
    ytPlay(t, 'beta#detail/' + this.type + '/' + this.id);
  },
  paint: function () {
    setF(this.btnEls, this.zone === 'btns' ? this.btnIdx : -1);
    var isSeries = this.type === 'series';
    $('dSeasons').style.display = isSeries ? 'block' : 'none';
    $('dEps').style.display = isSeries ? 'block' : 'none';
    for (var i = 0; i < this.seasonEls.length; i++) {
      var base = this.seasonEls[i].className.replace(/ ?\bcur\b/g, '').replace(/ ?\bf\b/g, '');
      this.seasonEls[i].className =
        base + (i === 2 ? ' cur' : '') + (this.zone === 'seasons' && i === this.seasonControlIdx ? ' f' : '');
    }
    setF(this.epEls, this.zone === 'eps' ? this.epIdx : -1);
    for (var ii = 0; ii < this.epEls.length; ii++) {
      var ims = this.epEls[ii].getElementsByTagName('img'),
        near = Math.abs(ii - this.epIdx) <= 2;
      for (var iz = 0; iz < ims.length; iz++) {
        var ei = ims[iz];
        if (near && ei._full) {
          ei.src = ei._full;
          ei._full = null;
        } else if (!near && ei.src && ei.src !== BLANK_IMG) {
          ei._full = ei.src;
          ei.src = BLANK_IMG;
        }
      }
    }
    var step = this.epEls.length > 1 ? this.epEls[1].offsetLeft - this.epEls[0].offsetLeft : 454;
    if (step <= 0) step = (document.documentElement.clientHeight || 1080) <= 800 ? 303 : 454;
    var vis = Math.max(2, Math.floor(contentWidth() / step)),
      x = Math.max(0, this.epIdx - (vis - 2)) * step;
    $('dEpsInner').style.transform = 'translateX(-' + x + 'px)';
    $('dEpsInner').style.webkitTransform = 'translateX(-' + x + 'px)';
    var episodeMode = this.zone === 'eps',
      cv = episodeMode ? this.eps[this.epIdx] : null;
    if (episodeMode) {
      bodyAdd('series-episode');
      $('dInfo').style.display = 'none';
      $('dPoster').style.display = 'none';
      $('dBtns').style.display = 'none';
      $('dDesc').style.display = 'block';
      $('dMeta').textContent = cv ? episodeMetaLine(cv) : '';
      $('dDesc').textContent = (cv && (cv.overview || cv.description)) || '';
      if (cv) setBg(episodeImage(cv, this.meta) || episodeFallback(this.meta, false));
      else if (this.meta) setBg(this.meta.background || '');
    } else {
      bodyRemove('series-episode');
      $('dBtns').style.display = 'block';
      $('dDesc').style.display = 'block';
      $('dInfo').style.display = 'block';
      $('dMeta').innerHTML = this.baseMeta;
      $('dInfo').innerHTML = this.baseInfo;
      $('dDesc').textContent = this.baseDesc;
      var posterReady = this.meta && this.meta.poster && $('dPoster')._detailId === this.id;
      $('dPoster').style.display = posterReady ? 'block' : 'none';
      if (this.meta) setBg(this.meta.background || bgOf({ id: this.id, poster: this.meta.poster }));
    }
  },
  openStreams: function (vid) {
    streamsUI.show(this.type, this.id, vid, this.meta && this.meta.name);
  },
  key: function (k) {
    if (this.zone === 'btns') {
      if (k === 39) this.btnIdx = Math.min(this.btnEls.length - 1, this.btnIdx + 1);
      else if (k === 37) {
        if (this.btnIdx === 0) {
          topNav.focus();
          return true;
        }
        this.btnIdx--;
      } else if (k === 38) {
        topNav.focus();
        return true;
      } /* Up reaches the top tabs from a detail page */ else if (k === 13) {
        var a = this.btnActs[this.btnIdx];
        if (a) a();
      } else if (k === 40) {
        if (this.type === 'series' && this.seasons.length) this.zone = 'seasons';
        else this.openStreams(this.id);
      } /* movie: Down re-opens the streams panel */
      this.paint();
      return true;
    }
    if (this.zone === 'seasons') {
      if (k === 39) this.seasonControlIdx = Math.min(this.seasonEls.length - 1, this.seasonControlIdx + 1);
      else if (k === 37) {
        if (this.seasonControlIdx > 0) this.seasonControlIdx--;
        else {
          topNav.focus();
          return true;
        }
      } else if (k === 38) {
        this.zone = 'btns';
      } else if (k === 40) {
        if (this.eps.length) this.zone = 'eps';
      } else if (k === 13) {
        var act = this.seasonActs[this.seasonControlIdx];
        if (act) act();
      }
      this.paint();
      return true;
    }
    if (this.zone === 'eps') {
      if (k === 39) this.epIdx = Math.min(this.epEls.length - 1, this.epIdx + 1);
      else if (k === 37) {
        if (this.epIdx > 0) this.epIdx--;
        else {
          topNav.focus();
          return true;
        }
      } else if (k === 38) this.zone = 'seasons';
      else if (k === 13) {
        var v = this.eps[this.epIdx];
        if (v) this.openStreams(v.id);
      }
      this.paint();
      return true;
    }
    return true;
  }
};
