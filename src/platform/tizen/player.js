// Player side of the Tizen platform: the TV's own player, behind what the player code expects
// of a <video> element. Unlike <video>, AVPlay plays MKV and lists the file's audio and
// subtitle tracks without FFmpeg.
function createVideo() {
  var A = window.webapis.avplay,
    listeners = {},
    src = '',
    opened = false,
    ready = false,
    paused = true,
    ended = false,
    error = null,
    buffering = false,
    wantPlay = true,
    durationMs = 0,
    positionMs = 0,
    startAtMs = -1,
    seeking = false,
    nextSeekMs = -1,
    audio = [],
    pendingAudio = -1,
    onText = null,
    hiddenAtMs = -1,
    video;
  function emit(name) {
    var list = (listeners[name] || []).slice();
    for (var i = 0; i < list.length; i++) {
      try {
        list[i].call(video);
      } catch (e) {}
    }
  }
  function close() {
    if (!opened) return;
    opened = false;
    ready = false;
    try {
      A.stop();
    } catch (e) {}
    try {
      A.close();
    } catch (e) {}
  }
  function trackInfo(type) {
    var out = [],
      all = [];
    try {
      all = A.getTotalTrackInfo() || [];
    } catch (e) {}
    for (var i = 0; i < all.length; i++) {
      if (all[i].type !== type) continue;
      var extra = {};
      try {
        extra = JSON.parse(all[i].extra_info);
      } catch (e) {}
      out.push({ index: all[i].index, language: extra.language || extra.track_lang || '' });
    }
    return out;
  }
  function selectedAudio() {
    try {
      var current = A.getCurrentStreamInfo() || [];
      for (var i = 0; i < current.length; i++) if (current[i].type === 'AUDIO') return current[i].index;
    } catch (e) {}
    return -1;
  }
  /* Tizen 3 does not change the audio track while paused: it waits for the next play. */
  function chooseAudio(index) {
    if (paused) {
      pendingAudio = index;
      return;
    }
    try {
      A.setSelectTrack('AUDIO', index);
    } catch (e) {}
  }
  function audioTrack(info, on) {
    var track = { label: '', language: info.language };
    Object.defineProperty(track, 'enabled', {
      get: function () {
        return on;
      },
      set: function (value) {
        var changed = value && !on;
        on = !!value;
        if (changed) chooseAudio(info.index);
      }
    });
    return track;
  }
  function readTracks() {
    var infos = trackInfo('AUDIO'),
      current = selectedAudio();
    audio = [];
    for (var i = 0; i < infos.length; i++)
      audio.push(audioTrack(infos[i], current >= 0 ? infos[i].index === current : i === 0));
  }
  function fail(code, message) {
    error = { code: code, message: String(message || '') };
    paused = true;
    emit('error');
  }
  function start() {
    if (!ready || !paused) return;
    try {
      A.play();
    } catch (e) {
      return fail(3, e && e.message);
    }
    paused = false;
    ended = false;
    if (pendingAudio >= 0) {
      chooseAudio(pendingAudio);
      pendingAudio = -1;
    }
    emit('play');
    if (!buffering) emit('playing');
  }
  function seekTo(ms) {
    if (seeking) {
      nextSeekMs = ms;
      return;
    }
    seeking = true;
    positionMs = ms;
    function done() {
      seeking = false;
      if (nextSeekMs >= 0) {
        var next = nextSeekMs;
        nextSeekMs = -1;
        return seekTo(next);
      }
      emit('seeked');
      emit('canplay');
      if (!paused && !buffering) emit('playing');
    }
    emit('seeking');
    try {
      A.seekTo(ms, done, done);
    } catch (e) {
      done();
    }
  }
  var player = {
    onbufferingstart: function () {
      buffering = true;
      emit('waiting');
    },
    onbufferingprogress: function () {},
    onbufferingcomplete: function () {
      buffering = false;
      emit('canplay');
      if (!paused) emit('playing');
    },
    oncurrentplaytime: function (ms) {
      if (seeking) return;
      positionMs = parseInt(ms, 10) || 0;
      emit('timeupdate');
    },
    onstreamcompleted: function () {
      close();
      ended = true;
      paused = true;
      emit('pause');
      emit('ended');
    },
    onerror: function (kind) {
      fail(4, kind);
    },
    onevent: function () {},
    onsubtitlechange: function (duration, text) {
      if (onText) onText(parseInt(duration, 10) || 3000, String(text || ''));
    }
  };
  function open() {
    close();
    ended = false;
    error = null;
    buffering = false;
    durationMs = 0;
    audio = [];
    if (!src) return;
    opened = true;
    try {
      A.open(src);
      A.setListener(player);
      A.setDisplayRect(0, 0, 1920, 1080);
      A.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
      A.prepareAsync(
        function () {
          ready = true;
          try {
            durationMs = A.getDuration() || 0;
          } catch (e) {}
          readTracks();
          if (startAtMs >= 0) {
            positionMs = startAtMs;
            try {
              A.seekTo(startAtMs);
            } catch (e) {}
            startAtMs = -1;
          }
          emit('loadedmetadata');
          emit('loadeddata');
          emit('canplay');
          /* after the events: a resume position set by them is in place before the first frame */
          setTimeout(function () {
            if (wantPlay) start();
          }, 0);
        },
        function (e) {
          fail(4, e && e.message);
        }
      );
    } catch (e) {
      fail(4, e && e.message);
    }
  }
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
      try {
        A.pause();
      } catch (e) {}
      paused = true;
      emit('pause');
    },
    load: function () {},
    removeAttribute: function (name) {
      if (name !== 'src') return;
      src = '';
      close();
    },
    /* the file's text tracks for the subtitle menu, once the player has read the file */
    textTrackList: function () {
      if (!ready) return null;
      var infos = trackInfo('TEXT'),
        out = [];
      for (var i = 0; i < infos.length; i++)
        out.push({
          n: infos[i].index,
          ti: infos[i].index,
          name: infos[i].language || 'Track ' + (i + 1)
        });
      return out;
    },
    /* n < 0 turns them off; each line then reaches cb(milliseconds, text) */
    selectTextTrack: function (n, cb) {
      onText = n >= 0 ? cb : null;
      try {
        A.setSilentSubtitle(n < 0);
      } catch (e) {}
      if (n < 0) return;
      try {
        A.setSelectTrack('TEXT', n);
      } catch (e) {}
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
        if (!ready) {
          startAtMs = ms;
          positionMs = ms;
        } else seekTo(ms);
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
  /* Hidden, the TV takes the decoder back: let it go, and return paused at the same place. */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (!opened) return;
      hiddenAtMs = positionMs;
      close();
    } else if (hiddenAtMs >= 0 && src && !opened) {
      startAtMs = hiddenAtMs;
      hiddenAtMs = -1;
      wantPlay = false;
      paused = true;
      open();
    }
  });
  /* without this the sound carries on over the next page */
  window.addEventListener('pagehide', close);
  window.addEventListener('beforeunload', close);
  return video;
}
