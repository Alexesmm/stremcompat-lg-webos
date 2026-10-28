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
function openMenu(view) {
  subView = view;
  menuItems = [];
  var html = '';
  if (view === 'subsroot' || view === 'embedded') ensureEmbTracks();
  if (view === 'root') {
    html += '<div class=mh>' + P.settings + '</div>';
    html += '<div class=mi>' + P.audio + ': ' + eh(audioName()) + ' \u203a</div>';
    menuItems.push({ k: 'go', to: 'audio' });
    html += '<div class=mi>' + P.subtitles + ': ' + eh(subtitleName()) + ' \u203a</div>';
    menuItems.push({ k: 'go', to: 'subsroot' });
  } else if (view === 'audio') {
    html += '<div class=mh>' + P.audio + '</div>';
    try {
      for (var a = 0; a < v.audioTracks.length; a++) {
        var at = v.audioTracks[a],
          al = at.label || at.language || P.audio + ' ' + (a + 1);
        html +=
          '<div class="mi' + (at.enabled ? ' on' : '') + '">' + eh(selectedLabel(al, at.enabled)) + '</div>';
        menuItems.push({ k: 'aud', idx: a });
      }
    } catch (e) {}
    if (!menuItems.length) html += '<div class=mi style="opacity:.5">' + P.none + '</div>';
  } else if (view === 'subsroot') {
    html += '<div class=mh>' + P.subtitles + ': ' + eh(subtitleName()) + '</div>';
    var f0 = curSub === 'off';
    html += '<div class="mi' + (f0 ? ' on' : '') + '">' + eh(selectedLabel(P.off, f0)) + '</div>';
    menuItems.push({ k: 'off' });
    html += '<div class=mi>' + P.embedded + ' \u203a</div>';
    menuItems.push({ k: 'go', to: 'embedded' });
    html += '<div class=mi>' + P.external + ' \u203a</div>';
    menuItems.push({ k: 'go', to: 'external' });
    html += '<div class=mi>' + P.style + ' \u203a</div>';
    menuItems.push({ k: 'go', to: 'style' });
    if (curSub.indexOf('ext:') === 0) {
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
      html += '<div class=mi style="opacity:.6;white-space:normal;font-size:22px">' + eh(embErr) + '</div>';
    } else if (!embTracks.length) {
      html += '<div class=mi style="opacity:.5">' + P.noneInFile + '</div>';
    } else {
      for (var j = 0; j < embTracks.length; j++) {
        var et = embTracks[j];
        var fb = curSub === 'emb:' + et.n;
        html += '<div class="mi' + (fb ? ' on' : '') + '">' + eh(selectedLabel(et.name, fb)) + '</div>';
        menuItems.push({ k: 'emb', idx: et.n, ti: et.ti });
      }
    }
  } else if (view === 'external') {
    html += '<div class=mh>' + P.external + ' \u2014 ' + P.language + '</div>';
    if (!extSubs.length) html += '<div class=mi style="opacity:.5">' + P.none + '</div>';
    var seen = {};
    for (var i = 0; i < extSubs.length; i++) {
      var L = extSubs[i].lang;
      if (!seen[L]) {
        seen[L] = 1;
        html += '<div class=mi>' + eh(extSubs[i].name) + ' \u203a</div>';
        menuItems.push({ k: 'lang', lang: L });
      }
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
        html += '<div class="mi' + (fe ? ' on' : '') + '">' + eh(selectedLabel(nm + ' ' + c, fe)) + '</div>';
        menuItems.push({ k: 'ext', u: extSubs[i].u });
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
  mIdx = 0;
  paintMenu();
}
function paintMenu() {
  var els = menu.querySelectorAll('.mi');
  for (var i = 0; i < els.length; i++) els[i].className = 'mi' + (i === mIdx ? ' f' : '');
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
  else if (subView === 'extlang') openMenu('external');
  else if (subView === 'audio' || subView === 'subsroot') openMenu('root');
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
  if (it.k === 'd+') {
    subDelay += 0.5;
    reopen();
    return;
  }
  if (it.k === 'd-') {
    subDelay -= 0.5;
    reopen();
    return;
  }
  if (it.k === 'd0') {
    subDelay = 0;
    reopen();
    return;
  }
  if (it.k === 'off') subsOff();
  else if (it.k === 'ext') setExtSub(it.u);
  else if (it.k === 'emb') setEmbSub(it.idx, it.ti);
  else if (it.k === 'aud') {
    try {
      for (var j = 0; j < v.audioTracks.length; j++) v.audioTracks[j].enabled = j === it.idx;
    } catch (e) {}
  }
  var chosen = it.k === 'aud' ? P.audio + ': ' + audioName() : P.subtitles + ': ' + subtitleName();
  closeMenu();
  showToast(chosen);
}
function closeMenu() {
  menu.className = '';
  mode = 'controls';
  paintBtns();
  showBar();
}
