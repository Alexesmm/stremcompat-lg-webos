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
  currentEpisode: function () {
    return (this.eps && this.eps[this.epIdx]) || null;
  },
  loadWatched: function () {
    /* LOCAL watched list (state.watchedEpisodes) — never synced */
    this.watchedMap = {};
    if (this.type !== 'series') return;
    var lib = lsJson(PRE + this.id);
    var we = (lib && lib.state && lib.state.watchedEpisodes) || [];
    for (var i = 0; i < we.length; i++) this.watchedMap[we[i]] = 1;
  },
  markWatched: function () {
    for (var i = 0; i < this.eps.length; i++) {
      var v = this.eps[i],
        el = this.epEls[i];
      if (!el) continue;
      var on = !!this.watchedMap[v.id];
      el.className = el.className.replace(/ ?\bw\b/, '') + (on ? ' w' : '');
      var th = el.getElementsByClassName('th')[0];
      if (th) {
        var ex = th.getElementsByClassName('wbadge')[0];
        if (on && !ex) {
          var wb = document.createElement('div');
          wb.className = 'wbadge';
          wb.innerHTML = ICON.check;
          th.appendChild(wb);
        } else if (!on && ex) th.removeChild(ex);
      }
    }
  },
  /* the first released episode not watched yet; once everything released was watched,
     the latest released one (not S1E1, and never an episode that has not aired) */
  firstUnwatched: function () {
    var now = Date.now(),
      latest = null;
    for (var s = 0; s < this.seasons.length; s++) {
      if (this.seasons[s].n === 0) continue;
      var eps = this.seasons[s].eps;
      for (var e = 0; e < eps.length; e++) {
        if (!episodeReleased(eps[e], now)) continue;
        if (!this.watchedMap[eps[e].id]) return eps[e].id;
        latest = eps[e].id;
      }
    }
    if (latest) return latest;
    return this.seasons[0] && this.seasons[0].eps[0] ? this.seasons[0].eps[0].id : null;
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
    /* Movies keep an explicit primary action even though sources auto-open. If the
     viewer dismisses the panel, Watch remains focused and makes recovery obvious. */
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
    /* movies auto-open their streams; series just highlight the resume/first-unwatched episode
     (NO auto-open) so you land on the episode list and pick one yourself */
    if (this.type === 'series') {
      var lib = lsJson(PRE + this.id);
      var av =
        this.vid ||
        (lib && lib.state && lib.state.timeOffset > 60000 && lib.state.video_id) ||
        this.firstUnwatched();
      this.vid = null;
      if (av) {
        this.selectEpisode(av, true); /* noOpen: highlight only */
        if (hasNextSourcePreference(this.id, av)) {
          var nextSelf = this;
          setTimeout(function () {
            if (SCR === 'detail' && !streamsUI.open) nextSelf.openStreams(av);
          }, 250);
        }
      }
    } else if (!this.restored) {
      setTimeout(function () {
        if (SCR === 'detail' && detail.meta === m && !streamsUI.open) self.openStreams(self.id);
      }, 250);
    }
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
  buildSeasons: function () {
    var model = buildEpisodeModel((this.meta && this.meta.videos) || []);
    this.seasons = model.seasons;
    this.linearEps = model.linear;
    if (this.seasonIdx >= this.seasons.length) this.seasonIdx = Math.max(0, this.seasons.length - 1);
    if (this.rangeIdx * 50 >= this.linearEps.length)
      this.rangeIdx = Math.max(0, Math.ceil(this.linearEps.length / 50) - 1);
    this.epIdx = 0;
    this.buildEps();
  },
  addSeasonControl: function (label, act, kind) {
    var host = $('dSeasons'),
      ch = document.createElement('div');
    ch.className = 'schip ' + (kind || '');
    ch.textContent = label;
    host.appendChild(ch);
    this.seasonEls.push(ch);
    this.seasonActs.push(act);
  },
  buildSeasonControls: function () {
    var self = this,
      host = $('dSeasons');
    host.innerHTML = '';
    this.seasonEls = [];
    this.seasonActs = [];
    this.addSeasonControl(
      this.episodeMode === 'season' ? tx('seasonOrder') : tx('continuousOrder'),
      function () {
        var keep = self.currentEpisode();
        self.episodeMode = self.episodeMode === 'season' ? 'continuous' : 'season';
        self.epIdx = 0;
        self.buildEps();
        if (keep) self.selectEpisode(keep.id, true);
      },
      'mode'
    );
    this.addSeasonControl(
      '‹',
      function () {
        if (self.episodeMode === 'season') {
          if (self.seasonIdx > 0) self.seasonIdx--;
        } else if (self.rangeIdx > 0) self.rangeIdx--;
        self.epIdx = 0;
        self.buildEps();
      },
      'arrow'
    );
    var label;
    if (this.episodeMode === 'season') {
      var se = this.seasons[this.seasonIdx];
      label = se ? (se.n === 0 ? tx('specials') : tx('season', se.n)) : tx('season', 1);
    } else {
      /* label the range with the overall numbers its cards show: provider absolute
         numbers can skip, so positions and numbers are not always the same */
      var slice = this.linearEps.slice(this.rangeIdx * 50, this.rangeIdx * 50 + 50);
      label = slice.length
        ? tx('episodeRange', slice[0]._stremAbsolute, slice[slice.length - 1]._stremAbsolute)
        : tx('episodeRange', 0, 0);
    }
    this.addSeasonControl(label, function () {}, 'selector');
    this.addSeasonControl(
      '›',
      function () {
        if (self.episodeMode === 'season') {
          if (self.seasonIdx < self.seasons.length - 1) self.seasonIdx++;
        } else if ((self.rangeIdx + 1) * 50 < self.linearEps.length) self.rangeIdx++;
        self.epIdx = 0;
        self.buildEps();
      },
      'arrow'
    );
    this.addSeasonControl(
      tx('goToEpisode'),
      function () {
        self.jumpEpisode();
      },
      'jump'
    );
    if (this.seasonControlIdx >= this.seasonEls.length) this.seasonControlIdx = 0;
  },
  buildEps: function () {
    var se = this.seasons[this.seasonIdx],
      start = this.rangeIdx * 50;
    var host = $('dEpsInner');
    host.innerHTML = '';
    this.epEls = [];
    this.eps = this.episodeMode === 'continuous' ? this.linearEps.slice(start, start + 50) : se ? se.eps : [];
    this.buildSeasonControls();
    for (var i = 0; i < this.eps.length; i++) {
      var v = this.eps[i];
      var d = document.createElement('div');
      d.className = 'ep';
      var th = document.createElement('div');
      th.className = 'th';
      var actualThumb = episodeImage(v, this.meta),
        thumb = actualThumb || episodeFallback(this.meta, true);
      if (thumb) {
        var im = new Image();
        im._full = thumb;
        im._fallback = episodeFallback(this.meta, true);
        im.onerror = function () {
          if (this._fallback && this.src !== this._fallback) {
            this._full = null;
            this.src = this._fallback;
          }
          this.onerror = null;
        };
        im.src = BLANK_IMG;
        th.appendChild(im);
        if (!actualThumb) th.className += ' fallback';
      }
      d.appendChild(th);
      var bd = document.createElement('div');
      bd.className = 'bd';
      var t = document.createElement('div');
      t.className = 't';
      var epBase =
          this.episodeMode === 'continuous'
            ? tx('absoluteEpisode', v._stremAbsolute || start + i + 1)
            : tx('episode', v._stremSeasonEpisode || i + 1),
        epName = v.name || v.title || '';
      t.textContent =
        !epName || epName.toLowerCase() === epBase.toLowerCase() ? epBase : epBase + '  ·  ' + epName;
      bd.appendChild(t);
      if (v.overview || v.description) {
        var o = document.createElement('div');
        o.className = 'o';
        o.textContent = v.overview || v.description;
        bd.appendChild(o);
      }
      d.appendChild(bd);
      host.appendChild(d);
      this.epEls.push(d);
    }
    this.epIdx = 0;
    this.markWatched();
  },
  jumpEpisode: function () {
    episodeJump.show((this.currentEpisode() && this.currentEpisode()._stremAbsolute) || 1);
  },
  goToEpisodeNumber: function (n) {
    var at = episodeIndexByNumber(this.linearEps, n);
    if (at < 0) {
      toast(tx('episodeNotFound'));
      return false;
    }
    this.episodeMode = 'continuous';
    this.rangeIdx = Math.floor(at / 50);
    this.epIdx = at % 50;
    this.buildEps();
    this.epIdx = at % 50;
    this.zone = 'eps';
    this.paint();
    return true;
  },
  selectEpisode: function (vid, noOpen) {
    if (this.episodeMode === 'continuous') {
      for (var a = 0; a < this.linearEps.length; a++)
        if (this.linearEps[a].id === vid) {
          this.rangeIdx = Math.floor(a / 50);
          this.buildEps();
          this.epIdx = a % 50;
          this.zone = 'eps';
          this.paint();
          if (!noOpen) this.openStreams(vid);
          return;
        }
    }
    for (var s = 0; s < this.seasons.length; s++) {
      var eps = this.seasons[s].eps;
      for (var e = 0; e < eps.length; e++) {
        if (eps[e].id === vid) {
          this.seasonIdx = s;
          this.buildEps();
          this.epIdx = e;
          this.zone = 'eps';
          this.paint();
          if (!noOpen) this.openStreams(vid);
          return;
        }
      }
    }
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
      $('dMeta').textContent = cv
        ? cv._stremAbsolute
          ? tx('seasonAbsoluteEpisode', cv._stremSeason, cv._stremSeasonEpisode, cv._stremAbsolute)
          : tx('seasonEpisode', cv._stremSeason, cv._stremSeasonEpisode)
        : '';
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
