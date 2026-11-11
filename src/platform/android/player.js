// Player side of the Android TV platform: the app's own player (ExoPlayer, android/), behind
// what the player code expects of a <video> element. The app draws the video under the page,
// which is transparent; unlike <video> in the TV's browser, it plays MKV, HEVC and surround sound
// and lists the file's audio and subtitle tracks.
// window.AndroidPlayer takes the orders; the app answers through window.__androidPlayer(event, a, b).
function createVideo() {
  var P = window.AndroidPlayer,
    listeners = {},
    src = '',
    ready = false,
    paused = true,
    ended = false,
    error = null,
    buffering = false,
    wantPlay = true,
    durationMs = 0,
    positionMs = 0,
    startAtMs = -1,
    audio = [],
    onText = null,
    video;
  /* the page's own <video> stays empty and out of sight; the app's video shows through the page */
  var element = document.getElementById('v');
  if (element) element.style.display = 'none';
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  function emit(name) {
    var list = (listeners[name] || []).slice();
    for (var i = 0; i < list.length; i++) {
      try {
        list[i].call(video);
      } catch (e) {}
    }
  }
  function tracks() {
    try {
      return JSON.parse(P.tracks()) || { audio: [], text: [] };
    } catch (e) {
      return { audio: [], text: [] };
    }
  }
  function audioTrack(info) {
    var on = !!info.selected,
      track = { label: info.label || '', language: info.language || '' };
    Object.defineProperty(track, 'enabled', {
      get: function () {
        return on;
      },
      set: function (value) {
        var changed = value && !on;
        on = !!value;
        if (changed) P.selectAudio(info.index);
      }
    });
    return track;
  }
  function readTracks() {
    var list = tracks().audio || [];
    audio = [];
    for (var i = 0; i < list.length; i++) audio.push(audioTrack(list[i]));
  }
  function start() {
    if (!ready || !paused) return;
    P.play();
    paused = false;
    ended = false;
    emit('play');
    if (!buffering) emit('playing');
  }
  function open() {
    ready = false;
    ended = false;
    error = null;
    buffering = false;
    durationMs = 0;
    audio = [];
    if (!src) return P.stop();
    P.open(src, startAtMs >= 0 ? startAtMs : 0);
    if (startAtMs >= 0) positionMs = startAtMs;
    startAtMs = -1;
  }
  /* what the app reports */
  window.__androidPlayer = function (name, a, b) {
    if (name === 'ready') {
      ready = true;
      durationMs = a || 0;
      readTracks();
      emit('loadedmetadata');
      emit('loadeddata');
      emit('canplay');
      /* after the events: a resume position set by them is in place before the first frame */
      setTimeout(function () {
        if (wantPlay) start();
      }, 0);
    } else if (name === 'buffering') {
      buffering = true;
      emit('waiting');
    } else if (name === 'buffered') {
      buffering = false;
      emit('canplay');
      if (!paused) emit('playing');
    } else if (name === 'time') {
      positionMs = a || 0;
      if (b) durationMs = b;
      emit('timeupdate');
    } else if (name === 'seeked') {
      emit('seeked');
      emit('canplay');
      if (!paused && !buffering) emit('playing');
    } else if (name === 'tracks') readTracks();
    else if (name === 'ended') {
      ended = true;
      paused = true;
      emit('pause');
      emit('ended');
    } else if (name === 'error') {
      error = { code: 4, message: String(a || '') };
      paused = true;
      emit('error');
    } else if (name === 'cue' && onText) onText(a || 3000, String(b || ''));
  };
  video = {
    addEventListener: function (name, fn) {
      (listeners[name] = listeners[name] || []).push(fn);
    },
    removeEventListener: function (name, fn) {
      var list = listeners[name] || [],
        at = list.indexOf(fn);
      if (at >= 0) list.splice(at, 1);
    },
    play: function () {
      wantPlay = true;
      if (ended) {
        positionMs = 0;
        open();
      } else start();
    },
    pause: function () {
      wantPlay = false;
      if (!ready || paused) {
        paused = true;
        return;
      }
      P.pause();
      paused = true;
      emit('pause');
    },
    load: function () {},
    removeAttribute: function (name) {
      if (name !== 'src') return;
      src = '';
      ready = false;
      P.stop();
    },
    /* the file's text tracks for the subtitle menu, once the player has read the file */
    textTrackList: function () {
      if (!ready) return null;
      var list = tracks().text || [],
        out = [];
      for (var i = 0; i < list.length; i++)
        out.push({ n: list[i].index, ti: list[i].index, name: list[i].label || list[i].language || '' });
      return out;
    },
    /* n < 0 turns them off; each line then reaches cb(milliseconds, text) */
    selectTextTrack: function (n, cb) {
      onText = n >= 0 ? cb : null;
      P.selectText(n);
    }
  };
  Object.defineProperties(video, {
    src: {
      get: function () {
        return src;
      },
      set: function (u) {
        src = String(u || '');
        wantPlay = true;
        paused = true;
        open();
      }
    },
    currentTime: {
      get: function () {
        return positionMs / 1000;
      },
      set: function (sec) {
        var ms = Math.max(0, Math.round(sec * 1000));
        positionMs = ms;
        if (!ready) startAtMs = ms;
        else {
          emit('seeking');
          P.seek(ms);
        }
      }
    },
    duration: {
      get: function () {
        return durationMs ? durationMs / 1000 : NaN;
      }
    },
    paused: {
      get: function () {
        return paused;
      }
    },
    ended: {
      get: function () {
        return ended;
      }
    },
    error: {
      get: function () {
        return error;
      }
    },
    readyState: {
      get: function () {
        return !ready ? 0 : buffering ? 2 : 4;
      }
    },
    networkState: {
      get: function () {
        return src ? 2 : 0;
      }
    },
    audioTracks: {
      get: function () {
        return audio;
      }
    },
    textTracks: {
      get: function () {
        return [];
      }
    }
  });
  /* without this the sound carries on over the next page */
  window.addEventListener('pagehide', function () {
    P.stop();
  });
  return video;
}
