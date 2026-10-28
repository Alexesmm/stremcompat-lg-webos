// Title detail screen: seasons, overall episode ranges, the episode list and watched marks.
detail.currentEpisode = function () {
  return (this.eps && this.eps[this.epIdx]) || null;
};
detail.loadWatched = function () {
  /* LOCAL watched list (state.watchedEpisodes) — never synced */
  this.watchedMap = {};
  if (this.type !== 'series') return;
  var lib = lsJson(PRE + this.id);
  var we = (lib && lib.state && lib.state.watchedEpisodes) || [];
  for (var i = 0; i < we.length; i++) this.watchedMap[we[i]] = 1;
};
detail.markWatched = function () {
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
};
/* the first released episode not watched yet; once everything released was watched,
   the latest released one (not S1E1, and never an episode that has not aired) */
detail.firstUnwatched = function () {
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
};
detail.buildSeasons = function () {
  var model = buildEpisodeModel((this.meta && this.meta.videos) || []);
  this.seasons = model.seasons;
  this.linearEps = model.linear;
  if (this.seasonIdx >= this.seasons.length) this.seasonIdx = Math.max(0, this.seasons.length - 1);
  if (this.rangeIdx * 50 >= this.linearEps.length)
    this.rangeIdx = Math.max(0, Math.ceil(this.linearEps.length / 50) - 1);
  this.epIdx = 0;
  this.buildEps();
};
detail.addSeasonControl = function (label, act, kind) {
  var host = $('dSeasons'),
    ch = document.createElement('div');
  ch.className = 'schip ' + (kind || '');
  ch.textContent = label;
  host.appendChild(ch);
  this.seasonEls.push(ch);
  this.seasonActs.push(act);
};
detail.buildSeasonControls = function () {
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
};
/* Coming soon before release, New during the first week */
function episodeBadge(v, now) {
  var at = releasedTime(v);
  if (!at) return '';
  if (at > now) return tx('badgeSoon');
  return now - at < 7 * 86400000 ? tx('badgeNew') : '';
}
detail.buildEps = function () {
  var se = this.seasons[this.seasonIdx],
    start = this.rangeIdx * 50;
  var host = $('dEpsInner');
  host.innerHTML = '';
  this.epEls = [];
  this.eps = this.episodeMode === 'continuous' ? this.linearEps.slice(start, start + 50) : se ? se.eps : [];
  this.buildSeasonControls();
  /* progress of the episode being watched, and release badges */
  var lib = lsJson(PRE + this.id),
    st = (lib && lib.state) || {},
    now = Date.now();
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
    var badge = episodeBadge(v, now);
    if (badge) {
      var bg = document.createElement('div');
      bg.className = 'epbadge';
      bg.textContent = badge;
      th.appendChild(bg);
    }
    if (
      v.id === st.video_id &&
      st.duration > 0 &&
      st.timeOffset > 60000 &&
      !watchFinished(st.timeOffset, st.duration)
    ) {
      var pb = document.createElement('div');
      pb.className = 'pbar';
      var pf = document.createElement('div');
      pf.style.width = Math.min(100, Math.round((st.timeOffset / st.duration) * 100)) + '%';
      pb.appendChild(pf);
      th.appendChild(pb);
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
    d.appendChild(bd);
    host.appendChild(d);
    this.epEls.push(d);
  }
  this.epIdx = 0;
  this.markWatched();
};
detail.jumpEpisode = function () {
  episodeJump.show((this.currentEpisode() && this.currentEpisode()._stremAbsolute) || 1);
};
detail.goToEpisodeNumber = function (n) {
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
};
detail.selectEpisode = function (vid, noOpen) {
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
};
