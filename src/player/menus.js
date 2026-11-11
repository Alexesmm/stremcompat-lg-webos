// Settings menu: audio, subtitles, embedded tracks and subtitle style.
// This TV delivers Back as a history pop. We keep ONE dummy entry: popstate closes the
// menu/controls (re-pushing to stay), or exits when nothing is open.
try {
  history.pushState({ tv: 1 }, '');
} catch (e) {}
function onPop() {
  goBack();
}
window.addEventListener('popstate', onPop);
// ---- menus (subtitles = Off + external English-first + embedded; audio = embedded) ----
function choiceRow(label, on, tail) {
  return '<div class="mi' + (on ? ' on' : '') + '">' + eh(selectedLabel(label, on)) + (tail || '') + '</div>';
}
function openMenu(view) {
  subView = view;
  menuItems = [];
  var html = '';
  if (view === 'subsroot' || view === 'embedded') ensureEmbTracks();
  if (view === 'root' || view === 'audio') ensureTechProbe();
  if (view === 'root') ensureTorrentFiles();
  if (view === 'episodes') ensureSeasonList();
  if (view === 'sources') ensureSources();
  if (view === 'root') {
    html += '<div class=mh>' + P.settings + '</div>';
    html += '<div class=mi>' + P.audio + ': ' + eh(audioName()) + ' \u203a</div>';
    menuItems.push({ k: 'go', to: 'audio' });
    html += '<div class=mi>' + P.subtitles + ': ' + eh(subtitleName()) + ' \u203a</div>';
    menuItems.push({ k: 'go', to: 'subsroot' });
    if (CAN_LIST_EPISODES) {
      html += '<div class=mi>' + P.episodes + ' \u203a</div>';
      menuItems.push({ k: 'go', to: 'episodes' });
    }
    if (mediaInfo && mediaInfo.chapters) {
      html += '<div class=mi>' + P.chapters + ' \u203a</div>';
      menuItems.push({ k: 'go', to: 'chapters' });
    }
    html += '<div class=mi>' + P.sources + ' \u203a</div>';
    menuItems.push({ k: 'go', to: 'sources' });
    if (!SIMPLE && torrentFileList && torrentFileList.length > 1) {
      html += '<div class=mi>' + P.files + ' \u203a</div>';
      menuItems.push({ k: 'go', to: 'files' });
    }
    if (!SIMPLE && IS_VIDEO_ELEMENT) {
      html +=
        '<div class=mi>' +
        P.picture +
        ': ' +
        (pictureMode === 'zoom' ? P.pictureZoom : P.pictureFit) +
        '</div>';
      menuItems.push({ k: 'picture' });
    }
    if (!SIMPLE && canChangeSpeed()) {
      html += '<div class=mi>' + P.speed + ': ' + speedLabel(v.playbackRate) + ' \u203a</div>';
      menuItems.push({ k: 'go', to: 'speed' });
    }
  } else if (view === 'episodes') {
    html += '<div class=mh>' + P.episodes + '</div>';
    if (!seasonList) html += '<div class=mi style="opacity:.5">' + P.readingTracks + '</div>';
    else if (!seasonList.length) html += '<div class=mi style="opacity:.5">' + P.none + '</div>';
    for (var se = 0; seasonList && se < seasonList.length; se++) {
      var here = seasonList[se].id === VID;
      html += choiceRow(
        tx('episode', seasonList[se].episode) + (seasonList[se].name ? '  ·  ' + seasonList[se].name : ''),
        here
      );
      menuItems.push({ k: 'episode', vid: seasonList[se].id, on: here });
    }
  } else if (view === 'chapters') {
    html += '<div class=mh>' + P.chapters + '</div>';
    var nowIn = currentChapter();
    for (var ch = 0; ch < mediaInfo.chapters.length; ch++) {
      var mark = mediaInfo.chapters[ch];
      html += choiceRow(fmt(mark.t) + (mark.name ? '  ·  ' + mark.name : ''), ch === nowIn);
      menuItems.push({ k: 'chapter', t: mark.t, on: ch === nowIn });
    }
  } else if (view === 'sources') {
    html += '<div class=mh>' + P.sources + '</div>';
    if (!sourceList) html += '<div class=mi style="opacity:.5">' + P.readingTracks + '</div>';
    else if (!sourceList.length) html += '<div class=mi style="opacity:.5">' + P.none + '</div>';
    for (var so = 0; sourceList && so < sourceList.length; so++) {
      var here = sourceList[so].url === URL;
      html += choiceRow(sourceRowText(sourceList[so]), here);
      menuItems.push({ k: 'source', at: so, on: here });
    }
  } else if (view === 'files') {
    html += '<div class=mh>' + P.files + '</div>';
    for (var tf = 0; tf < torrentFileList.length; tf++) {
      var file = torrentFileList[tf];
      html += choiceRow(file.name + '  ·  ' + fileSize(file.size), file.playing);
      menuItems.push({ k: 'file', index: file.index, on: file.playing });
    }
  } else if (view === 'speed') {
    html += '<div class=mh>' + P.speed + '</div>';
    for (var sp = 0; sp < SPEEDS.length; sp++) {
      var inUse = Math.abs(v.playbackRate - SPEEDS[sp]) < 0.01;
      html += choiceRow(speedLabel(SPEEDS[sp]), inUse);
      menuItems.push({ k: 'speed', rate: SPEEDS[sp], on: inUse });
    }
  } else if (view === 'audio') {
    html += '<div class=mh>' + P.audio + '</div>';
    try {
      var order = audioOrder();
      for (var a = 0; a < order.length; a++) {
        var at = v.audioTracks[order[a]];
        html += choiceRow(audioLabel(order[a]), at.enabled);
        menuItems.push({ k: 'aud', idx: order[a], on: at.enabled });
      }
    } catch (e) {}
    if (!menuItems.length) html += '<div class=mi style="opacity:.5">' + P.none + '</div>';
  } else if (view === 'subsroot') {
    html += '<div class=mh>' + P.subtitles + ': ' + eh(subtitleName()) + '</div>';
    var f0 = curSub === 'off';
    html += choiceRow(P.off, f0);
    menuItems.push({ k: 'off', on: f0 });
    /* the row that leads to the current subtitle says so, before opening it */
    var inEmb = curSub.indexOf('emb:') === 0,
      inExt = curSub.indexOf('ext:') === 0;
    html += choiceRow(P.embedded, inEmb, ' \u203a');
    menuItems.push({ k: 'go', to: 'embedded', on: inEmb });
    html += choiceRow(P.external, inExt, ' \u203a');
    menuItems.push({ k: 'go', to: 'external', on: inExt });
    html += '<div class=mi>' + P.style + ' \u203a</div>';
    menuItems.push({ k: 'go', to: 'style' });
    if (inExt) {
      html += '<div class=mi>' + P.delay + ' \u203a</div>';
      menuItems.push({ k: 'go', to: 'delay' });
    }
  } else if (view === 'embedded') {
    html += '<div class=mh>' + P.embedded + '</div>';
    if (embTracksLoading || embTracks === null) {
      html += '<div class=mi style="opacity:.5">' + P.readingTracks + '</div>';
      if (!embReopenArmed) {
        embReopenArmed = true;
        var iv = setInterval(function () {
          if (!embTracksLoading) {
            clearInterval(iv);
            embReopenArmed = false;
            if (subView === 'embedded') reopen();
          }
        }, 400);
      }
    } else if (embErr) {
      html +=
        '<div class=mi style="opacity:.6;white-space:normal;font-size:22px">' +
        eh(embTimeout ? P.tracksStillLoading : embErr) +
        '</div>';
      html += '<div class=mi>' + P.tryAgain + '</div>';
      menuItems.push({ k: 'embretry' });
    } else if (!embTracks.length) {
      html += '<div class=mi style="opacity:.5">' + P.noneInFile + '</div>';
    } else {
      for (var j = 0; j < embTracks.length; j++) {
        var et = embTracks[j];
        var fb = curSub === 'emb:' + et.n;
        html += choiceRow(et.name || P.embedded + ' ' + (j + 1), fb);
        menuItems.push({ k: 'emb', idx: et.n, ti: et.ti, lang: et.lang, on: fb });
      }
    }
  } else if (view === 'external' || view === 'extmore') {
    /* the languages asked for come first; the others wait under "More languages" */
    var more = view === 'extmore';
    html += '<div class=mh>' + P.external + ' \u2014 ' + (more ? P.moreLanguages : P.language) + '</div>';
    if (!extSubs.length) html += '<div class=mi style="opacity:.5">' + P.none + '</div>';
    var seen = {},
      curLang = null,
      anyWanted = false,
      others = 0,
      otherInUse = false;
    for (var i = 0; i < extSubs.length; i++) {
      if (curSub === 'ext:' + extSubs[i].u) curLang = extSubs[i].lang;
      if (wantedSubtitleLanguage(extSubs[i].lang)) anyWanted = true;
    }
    for (var i = 0; i < extSubs.length; i++) {
      var L = extSubs[i].lang;
      if (seen[L]) continue;
      seen[L] = 1;
      if (anyWanted && wantedSubtitleLanguage(L) === more) {
        others++;
        if (L === curLang) otherInUse = true;
        continue;
      }
      html += choiceRow(extSubs[i].name, L === curLang, ' \u203a');
      menuItems.push({ k: 'lang', lang: L, on: L === curLang });
    }
    if (!more && others) {
      html += choiceRow(P.moreLanguages, otherInUse, ' \u203a');
      menuItems.push({ k: 'go', to: 'extmore', on: otherInUse });
    }
  } else if (view === 'extlang') {
    var nm = '';
    for (var i = 0; i < extSubs.length; i++) {
      if (extSubs[i].lang === extLang) {
        nm = extSubs[i].name;
        break;
      }
    }
    html += '<div class=mh>' + eh(nm) + ' ' + P.subtitles.toLowerCase() + '</div>';
    var c = 0;
    for (var i = 0; i < extSubs.length; i++) {
      if (extSubs[i].lang === extLang) {
        c++;
        var fe = curSub === 'ext:' + extSubs[i].u;
        var srcName = extSubs[i].src ? '  ·  ' + extSubs[i].src : '';
        html += choiceRow(nm + ' ' + c + srcName, fe);
        menuItems.push({ k: 'ext', u: extSubs[i].u, lang: extSubs[i].lang, src: extSubs[i].src, on: fe });
      }
    }
  } else if (view === 'style') {
    html += '<div class=mh>' + P.style + '</div>';
    html += '<div class=mi>' + P.bigger + '</div>';
    menuItems.push({ k: 'size+' });
    html += '<div class=mi>' + P.smaller + '</div>';
    menuItems.push({ k: 'size-' });
    html +=
      '<div class=mi>' +
      P.colour +
      ': ' +
      (subColor.toLowerCase() === '#ffe600' ? P.yellow : P.white) +
      '</div>';
    menuItems.push({ k: 'color' });
    html += '<div class=mi>' + P.background + ': ' + (subBgOp > 0 ? P.on : P.off) + '</div>';
    menuItems.push({ k: 'bg' });
    html += '<div class=mi>' + P.higher + '</div>';
    menuItems.push({ k: 'pos+' });
    html += '<div class=mi>' + P.lower + '</div>';
    menuItems.push({ k: 'pos-' });
    html += '<div class=mi>' + P.opacity + ': ' + Math.round(subOpacity * 100) + '%</div>';
    menuItems.push({ k: 'opacity' });
  } else if (view === 'delay') {
    html += '<div class=mh>' + P.delay + ': ' + (subDelay > 0 ? '+' : '') + subDelay.toFixed(1) + 's</div>';
    html += '<div class=mi>' + P.later + '</div>';
    menuItems.push({ k: 'd+' });
    html += '<div class=mi>' + P.earlier + '</div>';
    menuItems.push({ k: 'd-' });
    html += '<div class=mi>' + P.reset + '</div>';
    menuItems.push({ k: 'd0' });
  }
  menu.innerHTML = html;
  menu.className = 'show';
  mode = 'menu';
  /* the list opens on what is in use, not on its first row */
  mIdx = 0;
  for (var r = menuItems.length - 1; r >= 0; r--) if (menuItems[r].on) mIdx = r;
  paintMenu();
}
function paintMenu() {
  var els = menu.querySelectorAll('.mi');
  for (var i = 0; i < els.length; i++)
    els[i].className = 'mi' + (/\bon\b/.test(els[i].className) ? ' on' : '') + (i === mIdx ? ' f' : '');
  if (els[mIdx]) els[mIdx].scrollIntoView(false);
}
function reopen() {
  var keep = mIdx;
  openMenu(subView);
  mIdx = keep;
  paintMenu();
}
function menuBack() {
  if (subView === 'embedded' || subView === 'external' || subView === 'style' || subView === 'delay')
    openMenu('subsroot');
  else if (subView === 'extlang' || subView === 'extmore') openMenu('external');
  else if (
    subView === 'audio' ||
    subView === 'subsroot' ||
    subView === 'episodes' ||
    subView === 'chapters' ||
    subView === 'files' ||
    subView === 'speed'
  )
    openMenu('root');
  else {
    menu.className = '';
    mode = 'controls';
    paintBtns();
  }
}
function chooseMenu() {
  var it = menuItems[mIdx];
  if (!it) {
    menuBack();
    return;
  }
  if (it.k === 'go') {
    openMenu(it.to);
    return;
  }
  if (it.k === 'lang') {
    extLang = it.lang;
    openMenu('extlang');
    return;
  }
  if (it.k === 'embretry') {
    embTracks = null;
    embErr = '';
    ensureEmbTracks();
    reopen();
    return;
  }
  if (it.k === 'size+') {
    subSize = Math.min(76, subSize + 4);
    subEl._t = null;
    reopen();
    return;
  }
  if (it.k === 'size-') {
    subSize = Math.max(20, subSize - 4);
    subEl._t = null;
    reopen();
    return;
  }
  if (it.k === 'color') {
    subColor = subColor.toLowerCase() === '#ffe600' ? '#ffffff' : '#ffe600';
    subEl._t = null;
    reopen();
    return;
  }
  if (it.k === 'bg') {
    subBgOp = subBgOp > 0 ? 0 : 0.6;
    subEl._t = null;
    reopen();
    return;
  }
  if (it.k === 'pos+' || it.k === 'pos-') {
    subBottom = Math.max(2, Math.min(42, subBottom + (it.k === 'pos+' ? 4 : -4)));
    subEl.style.bottom = subBottom + '%';
    keepSetting('subsBottom', subBottom);
    reopen();
    return;
  }
  if (it.k === 'opacity') {
    subOpacity = subOpacity <= 0.45 ? 1 : Math.round((subOpacity - 0.2) * 10) / 10;
    subEl._t = null;
    keepSetting('subsOpacity', subOpacity);
    reopen();
    return;
  }
  if (it.k === 'd+' || it.k === 'd-') {
    subDelay = Math.round((subDelay + (it.k === 'd+' ? 1 : -1) * delayStep()) * 10) / 10;
    saveTitlePref('delay', subDelay);
    reopen();
    return;
  }
  if (it.k === 'picture') {
    togglePicture();
    reopen();
    return;
  }
  if (it.k === 'speed') {
    setSpeed(it.rate);
    closeMenu();
    showToast(P.speed + ': ' + speedLabel(it.rate));
    return;
  }
  if (it.k === 'chapter') {
    closeMenu();
    seekTo(it.t);
    return;
  }
  if (it.k === 'source') {
    closeMenu();
    if (!it.on) playOtherSource(sourceList[it.at]);
    return;
  }
  if (it.k === 'episode' || it.k === 'file') {
    closeMenu();
    if (it.on) return;
    if (it.k === 'episode') goToEpisode(it.vid);
    else playTorrentFile(it.index);
    return;
  }
  if (it.k === 'd0') {
    subDelay = 0;
    saveTitlePref('delay', 0);
    reopen();
    return;
  }
  if (it.k === 'off') {
    subsOff();
    saveTitlePrefs({ sub: 'off', subUrl: '', subSrc: '', embLang: '' });
  } else if (it.k === 'ext') {
    setExtSub(it.u);
    saveTitlePrefs({ sub: it.lang, subUrl: it.u, subSrc: it.src || '', embLang: '' });
  } else if (it.k === 'emb') {
    setEmbSub(it.idx, it.ti);
    if (it.lang) saveTitlePrefs({ sub: it.lang, subUrl: '', subSrc: '', embLang: it.lang });
  } else if (it.k === 'aud') {
    try {
      for (var j = 0; j < v.audioTracks.length; j++) v.audioTracks[j].enabled = j === it.idx;
      audioChosenAt = Date.now();
      var al = (v.audioTracks[it.idx] && v.audioTracks[it.idx].language) || '';
      if (al) saveTitlePref('aud', al.toLowerCase());
    } catch (e) {}
  }
  var chosen = it.k === 'aud' ? P.audio + ': ' + audioName() : P.subtitles + ': ' + subtitleName();
  closeMenu();
  showToast(chosen);
  if (it.k === 'ext' || it.k === 'emb') holdForSubtitle();
}
function keepSetting(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch (e) {}
}
/* a tenth of a second per press; held down, the presses come fast and each one counts for five */
var delayPressedAt = 0,
  delayPresses = 0;
function delayStep() {
  var now = Date.now();
  delayPresses = now - delayPressedAt < 350 ? delayPresses + 1 : 0;
  delayPressedAt = now;
  return delayPresses >= 5 ? 0.5 : 0.1;
}
function closeMenu() {
  menu.className = '';
  mode = 'controls';
  paintBtns();
  showBar();
}
