// Remote key handling and the remote-debug hook.
// ---- key handling ----
document.addEventListener(
  'keydown',
  function (e) {
    var k = e.keyCode,
      key = e.key || '';
    if (k === 415 || key === 'MediaPlay') {
      setPlaying(true);
      e.preventDefault();
      return;
    }
    if (k === 19 || key === 'MediaPause') {
      setPlaying(false);
      e.preventDefault();
      return;
    }
    if (k === 179 || key === 'MediaPlayPause') {
      tog();
      e.preventDefault();
      return;
    }
    if (k === 461 || k === 8 || k === 27) {
      e.preventDefault();
      e.stopPropagation();
      history.back();
      return;
    }
    showBar();
    if (mode === 'menu') {
      if (k === 38) {
        mIdx = Math.max(0, mIdx - 1);
        paintMenu();
      } else if (k === 40) {
        mIdx = Math.min(menuItems.length - 1, mIdx + 1);
        paintMenu();
      } else if (k === 13) chooseMenu();
      e.preventDefault();
      return;
    }
    if (npFocus) {
      if (k === 13) {
        npGo();
      } else if (k === 38) {
        npFocus = false;
        paintNp();
        mode = 'controls';
        paintBtns();
      } else if (k === 40 || k === 37 || k === 39) {
        dismissNp();
      }
      e.preventDefault();
      return;
    }
    if (mode === 'controls') {
      if (k === 37) {
        bIdx = Math.max(0, bIdx - 1);
        paintBtns();
      } else if (k === 39) {
        bIdx = Math.min(btns.length - 1, bIdx + 1);
        paintBtns();
      } else if (k === 38) {
        mode = 'seek';
        paintBtns();
      } else if (k === 40) {
        mode = 'video';
        paintBtns();
      } else if (k === 13) activateButton();
      e.preventDefault();
      return;
    }
    if (mode === 'seek') {
      if (k === 37) seek(-SEEKSTEP);
      else if (k === 39) seek(SEEKSTEP);
      else if (k === 40) {
        mode = 'controls';
        paintBtns();
      } else if (k === 38) {
        mode = 'video';
        paintBtns();
      } else if (k === 13 && seekTarget >= 0) commitSeek();
      e.preventDefault();
      return;
    }
    if (k === 38) {
      if (npShown) {
        npFocus = true;
        paintNp();
      } else {
        mode = 'controls';
        if (bIdx < 0) bIdx = 1;
        paintBtns();
      }
      e.preventDefault();
      return;
    }
    if (k === 40) {
      mode = 'seek';
      paintBtns();
      e.preventDefault();
      return;
    }
    if (k === 13) {
      if (!restartOffered()) tog();
      e.preventDefault();
    } else if (k === 37) {
      seek(-SEEKSTEP);
      e.preventDefault();
    } else if (k === 39) {
      seek(SEEKSTEP);
      e.preventDefault();
    }
  },
  true
);
showBar();
// remote-debug hook: lets the CDP inspector read player state / drive sub selection
window.__tv = {
  st: function () {
    return {
      cur: curSub,
      subtitle: subtitleName(),
      audio: audioName(),
      mode: mode,
      bIdx: bIdx,
      embN: embN,
      cues: cues ? cues.length : null,
      cf: cues && cues[0] ? cues[0].s : null,
      cl: cues && cues.length ? cues[cues.length - 1].e : null,
      t: v.currentTime,
      paused: v.paused,
      dur: v.duration,
      tracks: embTracks
    };
  },
  emb: function (n) {
    setEmbSub(n);
  },
  ext: function (u) {
    setExtSub(u);
  },
  off: function () {
    subsOff();
  }
};
