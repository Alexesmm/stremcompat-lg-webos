// A Nuvio account behind the calls the interface already makes to Stremio's account API
// (stremio-api.js sends here every call whose key starts with "nuvio:"). Nuvio keeps a library,
// progress and watched list per profile; they become Stremio library items on the way in and
// go back to Nuvio on the way out. Experimental: Nuvio's API is not made for other apps.

var crypto = require('crypto');
var fs = require('fs');
var http = require('http');
var https = require('https');
var urlmod = require('url');
var path = require('path');
var { DIR } = require('./config');
var { dbg } = require('./log');
var { fetchAddonJson } = require('./http-util');
var { seriesVideos, setWatched } = require('./watched');

/* the tests point this at a stand-in server */
var BASE = urlmod.parse(process.env.SC_NUVIO_URL || 'https://api.nuvio.tv');
/* published by Nuvio for public clients in its API documentation */
var KEY = 'sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN';
var PAGE = 500;
/* older rows hold seconds: no video lasts 28 800 ms */
var MAX_SECONDS_VALUE = 8 * 60 * 60;
var MIN_DURATION_MS = 60000;
var CACHE_MS = 60000;

/* ---------- sessions, kept on the TV so a restart does not sign out ---------- */
function sessionFile() {
  return path.join(process.env.HOME || DIR, '.stremcompat', 'nuvio-sessions.json');
}
var sessions = null;
function loadSessions() {
  if (sessions) return sessions;
  try {
    sessions = JSON.parse(fs.readFileSync(sessionFile(), 'utf8')) || {};
  } catch (e) {
    sessions = {};
  }
  return sessions;
}
function saveSessions() {
  try {
    fs.mkdirSync(path.dirname(sessionFile()), { recursive: true });
    fs.writeFileSync(sessionFile(), JSON.stringify(sessions));
  } catch (e) {
    dbg('nuvio: sessions not saved: ' + e.message);
  }
}
function sessionOf(key) {
  var id = String(key || '').replace(/^nuvio:/, '');
  return loadSessions()[id] || null;
}

/* ---------- requests ---------- */
/* cb(status, json); status 0 when nothing answered */
function call(method, apiPath, token, body, cb) {
  var raw = body == null ? '' : JSON.stringify(body),
    answered = false;
  function answer(status, json) {
    if (answered) return;
    answered = true;
    cb(status, json);
  }
  var headers = { apikey: KEY, Accept: 'application/json', Authorization: 'Bearer ' + (token || KEY) };
  if (raw) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(raw);
  }
  var request;
  try {
    request = (BASE.protocol === 'http:' ? http : https).request(
      { hostname: BASE.hostname, port: BASE.port, path: apiPath, method: method, headers: headers },
      function (res) {
        var parts = [];
        res.on('data', function (d) {
          parts.push(d);
        });
        res.on('end', function () {
          var json = null;
          try {
            json = JSON.parse(Buffer.concat(parts).toString('utf8') || 'null');
          } catch (e) {}
          answer(res.statusCode, json);
        });
      }
    );
  } catch (e) {
    return answer(0, null);
  }
  request.on('error', function () {
    answer(0, null);
  });
  request.setTimeout(20000, function () {
    answer(0, null);
    request.abort();
  });
  request.end(raw);
}

function keepTokens(session, json) {
  session.access = json.access_token;
  session.refresh = json.refresh_token || session.refresh;
  saveSessions();
}

/* with the session's token, renewed once when it has ended */
function authed(session, method, apiPath, body, cb) {
  call(method, apiPath, session.access, body, function (status, json) {
    if (status !== 401) return cb(status, json);
    call(
      'POST',
      '/auth/v1/token?grant_type=refresh_token',
      null,
      { refresh_token: session.refresh },
      function (s, renewed) {
        if (s !== 200 || !renewed || !renewed.access_token) return cb(401, null);
        keepTokens(session, renewed);
        call(method, apiPath, session.access, body, cb);
      }
    );
  });
}
function rpc(session, name, body, cb) {
  authed(session, 'POST', '/rest/v1/rpc/' + name, body || {}, function (status, json) {
    cb(status >= 200 && status < 300 ? json : null, status);
  });
}

/* ---------- signing in, profiles and leaving ---------- */
function login(email, password, cb) {
  call(
    'POST',
    '/auth/v1/token?grant_type=password',
    null,
    { email: email, password: password },
    function (status, json) {
      if (status === 429)
        return cb({ error: { code: 429, message: 'Too many attempts. Try again in a minute.' } });
      if (!json || !json.access_token)
        return cb({
          error: { code: status || 0, message: status ? 'Wrong email or password' : 'Nuvio did not answer' }
        });
      var id = crypto.randomBytes(12).toString('hex');
      loadSessions()[id] = {
        access: json.access_token,
        refresh: json.refresh_token,
        uid: (json.user && json.user.id) || id,
        email: (json.user && json.user.email) || email,
        profile: 1,
        primaryAddons: true
      };
      saveSessions();
      cb({ result: { authKey: 'nuvio:' + id, user: userOf(loadSessions()[id]) } });
    }
  );
}
/* The interface keeps each profile's library apart by the start of this id (account.js libPrefix) */
function userOf(session) {
  return { _id: 'nv' + ('0' + session.profile).slice(-2) + session.uid, email: session.email };
}
function profiles(key, cb) {
  var session = sessionOf(key);
  if (!session) return cb(null);
  rpc(session, 'sync_pull_profiles', null, function (rows) {
    if (!rows) return cb(null);
    cb(
      rows
        .map(function (row) {
          return {
            index: Number(row.profile_index) || 1,
            name: String(row.name || ''),
            primaryAddons: !!row.uses_primary_addons,
            /* the PIN is not checked here yet, so a protected profile cannot be opened */
            locked: !!row.pin_enabled,
            current: (Number(row.profile_index) || 1) === session.profile
          };
        })
        .sort(function (a, b) {
          return a.index - b.index;
        })
    );
  });
}
function chooseProfile(key, index, cb) {
  var session = sessionOf(key);
  if (!session) return cb(false);
  profiles(key, function (list) {
    var found = null;
    (list || []).forEach(function (p) {
      if (p.index === Number(index)) found = p;
    });
    if (!found || found.locked) return cb(false);
    session.profile = found.index;
    session.primaryAddons = found.primaryAddons || found.index === 1;
    delete titleCache[key];
    saveSessions();
    cb(true);
  });
}
/* only this TV's session ends: other devices stay signed in */
function logout(key, cb) {
  var id = String(key || '').replace(/^nuvio:/, ''),
    session = loadSessions()[id];
  if (!session) return cb({ result: { success: true } });
  call('POST', '/auth/v1/logout?scope=local', session.access, {}, function () {
    delete sessions[id];
    delete titleCache[key];
    saveSessions();
    cb({ result: { success: true } });
  });
}

/* ---------- the profile's titles as Stremio library items ---------- */
function toMs(value) {
  if (value == null || value === '') return 0;
  var n = Number(value);
  if (!isNaN(n)) return n;
  var parsed = Date.parse(value);
  return isNaN(parsed) ? 0 : parsed;
}
function iso(ms) {
  return new Date(ms || Date.now()).toISOString();
}
function pages(session, name, body, pageField, cb, out) {
  out = out || [];
  rpc(session, name, body, function (rows, status) {
    if (!rows) return cb(out.length ? out : null, status);
    out = out.concat(rows);
    if (rows.length < PAGE || !pageField) return cb(out);
    body[pageField] += pageField === 'p_page' ? 1 : PAGE;
    pages(session, name, body, pageField, cb, out);
  });
}
/* library, progress and watched of the profile, as one record per title */
function pullTitles(session, cb) {
  var p = session.profile,
    got = {},
    left = 3,
    failed = 0;
  function done(name) {
    return function (rows, status) {
      if (!rows) failed = status || 1;
      got[name] = rows || [];
      if (--left) return;
      if (failed && !got.library.length && !got.progress.length) return cb(null, failed);
      cb(collect(got));
    };
  }
  pages(
    session,
    'sync_pull_library',
    { p_profile_id: p, p_limit: PAGE, p_offset: 0 },
    'p_offset',
    done('library')
  );
  pages(
    session,
    'sync_pull_watch_progress',
    { p_profile_id: p, p_since_last_watched: 0, p_limit: 5000 },
    null,
    done('progress')
  );
  pages(
    session,
    'sync_pull_watched_items',
    { p_profile_id: p, p_page: 1, p_page_size: PAGE },
    'p_page',
    done('watched')
  );
}
function collect(got) {
  var titles = {};
  function title(row) {
    var id = String(row.content_id || '').trim();
    if (!id) return null;
    if (!titles[id])
      titles[id] = {
        id: id,
        type: row.content_type || 'movie',
        name: '',
        poster: '',
        background: '',
        shape: 'poster',
        addedAt: 0,
        inLibrary: false,
        latest: null,
        episodes: [],
        movieWatchedAt: 0
      };
    if (!titles[id].name) titles[id].name = row.name || row.title || '';
    return titles[id];
  }
  got.library.forEach(function (row) {
    var t = title(row);
    if (!t) return;
    t.inLibrary = true;
    t.addedAt = toMs(row.added_at);
    t.poster = row.poster || '';
    t.background = row.background || '';
    t.shape = String(row.poster_shape || 'poster').toLowerCase();
    t.year = row.release_info || '';
  });
  got.progress.forEach(function (row) {
    var t = title(row);
    if (!t) return;
    var at = toMs(row.last_watched);
    if (t.latest && t.latest.at >= at) return;
    var position = Number(row.position) || 0,
      duration = Number(row.duration) || 0;
    if (duration > 0 && duration <= MAX_SECONDS_VALUE) {
      position *= 1000;
      duration *= 1000;
    }
    t.latest = {
      at: at,
      position: position,
      duration: duration,
      season: row.season == null ? null : Number(row.season),
      episode: row.episode == null ? null : Number(row.episode),
      videoId: row.video_id || ''
    };
  });
  got.watched.forEach(function (row) {
    var t = title(row);
    if (!t) return;
    var at = toMs(row.watched_at);
    if (row.season == null || row.episode == null) t.movieWatchedAt = Math.max(t.movieWatchedAt, at);
    else t.episodes.push({ season: Number(row.season), episode: Number(row.episode), at: at });
  });
  return titles;
}
function itemOf(t) {
  var latest = t.latest,
    lastAt = Math.max(t.addedAt, latest ? latest.at : 0, t.movieWatchedAt),
    videoId = latest && latest.videoId ? latest.videoId : t.id;
  if (t.type === 'series' && latest && latest.season != null && !/:\d+:\d+$/.test(videoId))
    videoId = t.id + ':' + latest.season + ':' + latest.episode;
  return {
    _id: t.id,
    type: t.type,
    name: t.name || t.id,
    poster: t.poster,
    background: t.background,
    posterShape: t.shape,
    year: t.year || '',
    removed: !t.inLibrary,
    temp: !t.inLibrary,
    _ctime: iso(t.addedAt || lastAt),
    _mtime: iso(lastAt),
    state: {
      lastWatched: latest ? iso(latest.at) : '',
      timeOffset: latest ? Math.round(latest.position) : 0,
      duration: latest ? Math.round(latest.duration) : 0,
      video_id: latest ? videoId : '',
      season: latest && latest.season != null ? latest.season : 0,
      episode: latest && latest.episode != null ? latest.episode : 0,
      timesWatched: t.movieWatchedAt ? 1 : 0,
      flaggedWatched: t.movieWatchedAt ? 1 : 0,
      timeWatched: 0,
      overallTimeWatched: 0,
      noNotif: false,
      watched: ''
    }
  };
}
/* A series' watched episodes become Stremio's watched field, over Cinemeta's episode list
   (watched.js). Only IMDb series have one, and a list that cannot be had leaves it empty. */
function fillWatched(item, t, cb) {
  if (t.type !== 'series' || !t.episodes.length || !/^tt\d+$/.test(t.id)) return cb();
  seriesVideos(t.id, function (videos) {
    if (!videos) return cb();
    var field = '';
    t.episodes.forEach(function (e) {
      videos.forEach(function (v) {
        if (Number(v.season) === e.season && Number(v.episode != null ? v.episode : v.number) === e.episode)
          field = setWatched(field, videos, v.id, true) || field;
      });
    });
    item.state.watched = field;
    cb();
  });
}

var titleCache = {};
/* the profile's items, read at most once a minute */
function items(key, session, cb) {
  var hit = titleCache[key];
  if (hit && Date.now() - hit.at < CACHE_MS) return cb(hit.items);
  pullTitles(session, function (titles, status) {
    if (!titles) return cb(null, status);
    var list = [],
      waiting = 1;
    function settled() {
      if (--waiting) return;
      titleCache[key] = { at: Date.now(), items: list };
      cb(list);
    }
    Object.keys(titles).forEach(function (id) {
      var item = itemOf(titles[id]);
      list.push(item);
      waiting++;
      fillWatched(item, titles[id], settled);
    });
    settled();
  });
}

/* ---------- Stremio library items back to Nuvio ---------- */
function episodeOf(item) {
  var state = item.state || {},
    m = String(state.video_id || '').match(/:(\d+):(\d+)$/);
  if (m) return { season: Number(m[1]), episode: Number(m[2]) };
  if (item.type === 'series' && state.episode > 0)
    return { season: state.season > 0 ? state.season : 1, episode: state.episode };
  return { season: null, episode: null };
}
/* Adds and updates; nothing is deleted on Nuvio from here. */
function put(key, session, changes, cb) {
  var library = [],
    progress = [],
    watched = [];
  (changes || []).forEach(function (item) {
    if (!item || !item._id || (item.type !== 'movie' && item.type !== 'series')) return;
    var state = item.state || {},
      at = toMs(state.lastWatched) || toMs(item._mtime) || Date.now(),
      ep = episodeOf(item);
    if (!item.removed && !item.temp) {
      var row = {
        content_id: item._id,
        content_type: item.type,
        name: item.name || item._id,
        poster_shape: String(item.posterShape || 'poster').toUpperCase(),
        added_at: toMs(item._ctime) || Date.now()
      };
      if (item.poster) row.poster = item.poster;
      if (item.background) row.background = item.background;
      if (item.year) row.release_info = String(item.year);
      library.push(row);
    }
    if (state.timeOffset > 0 && state.duration >= MIN_DURATION_MS) {
      var entry = {
        content_id: item._id,
        content_type: item.type,
        video_id: state.video_id || item._id,
        position: Math.round(state.timeOffset),
        duration: Math.round(state.duration),
        last_watched: at
      };
      if (ep.season != null) {
        entry.season = ep.season;
        entry.episode = ep.episode;
      }
      progress.push(entry);
    }
    if (state.flaggedWatched) {
      var seen = {
        content_id: item._id,
        content_type: item.type,
        title: item.name || item._id,
        watched_at: at
      };
      if (item.type === 'series' && ep.season != null) {
        seen.season = ep.season;
        seen.episode = ep.episode;
      }
      if (item.type === 'movie' || ep.season != null) watched.push(seen);
    }
  });
  var p = session.profile,
    jobs = [];
  if (library.length) jobs.push(['sync_push_library_items', { p_profile_id: p, p_items: library }]);
  if (progress.length) jobs.push(['sync_push_watch_progress', { p_profile_id: p, p_entries: progress }]);
  if (watched.length) jobs.push(['sync_push_watched_items', { p_profile_id: p, p_items: watched }]);
  delete titleCache[key];
  var ok = true;
  (function next() {
    var job = jobs.shift();
    if (!job) return cb({ result: { success: ok } });
    rpc(session, job[0], job[1], function (json, status) {
      if (status < 200 || status >= 300) ok = false;
      next();
    });
  })();
}

/* ---------- the profile's addons, with their manifests ---------- */
var manifests = {};
function manifestUrl(url) {
  var clean = String(url || '')
    .trim()
    .replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(clean)) return '';
  if (/\/manifest\.json(\?.*)?$/i.test(clean)) return clean;
  var parts = clean.split('?');
  return parts[0].replace(/\/+$/, '') + '/manifest.json' + (parts[1] ? '?' + parts[1] : '');
}
function addonCollection(session, cb) {
  var profile = session.primaryAddons ? 1 : session.profile;
  authed(
    session,
    'GET',
    '/rest/v1/addons?select=*&profile_id=eq.' + profile + '&order=sort_order',
    null,
    function (status, rows) {
      if (status < 200 || status >= 300 || !rows) return cb({ error: { code: status, message: 'addons' } });
      var list = rows
        .filter(function (row) {
          return row.enabled !== false && manifestUrl(row.url);
        })
        .map(function (row) {
          return manifestUrl(row.url);
        });
      var addons = new Array(list.length),
        left = list.length;
      if (!left) return cb({ result: { addons: [] } });
      list.forEach(function (url, i) {
        function keep(manifest) {
          if (manifest && manifest.id) addons[i] = { transportUrl: url, manifest: manifest, flags: {} };
          if (--left) return;
          cb({ result: { addons: addons.filter(Boolean) } });
        }
        if (manifests[url]) return keep(manifests[url]);
        fetchAddonJson(url, function (manifest) {
          if (manifest && manifest.id) manifests[url] = manifest;
          keep(manifest);
        });
      });
    }
  );
}

/* ---------- the account API calls, answered as Stremio answers them ---------- */
function expired() {
  return { error: { code: 1, message: 'Session expired. Sign in again.' } };
}
function nuvioApi(apiPath, body, cb) {
  if (apiPath === '/api/login') return login(String(body.email || ''), String(body.password || ''), cb);
  var key = body.authKey,
    session = sessionOf(key);
  if (apiPath === '/api/logout') return logout(key, cb);
  if (!session) return cb(expired());
  if (apiPath === '/api/getUser') return cb({ result: userOf(session) });
  if (apiPath === '/api/addonCollectionGet') return addonCollection(session, cb);
  if (apiPath === '/api/datastorePut') return put(key, session, body.changes, cb);
  items(key, session, function (list, status) {
    if (!list)
      return cb(
        status === 401 ? expired() : { error: { code: status || 0, message: 'Nuvio did not answer' } }
      );
    if (apiPath === '/api/datastoreMeta')
      return cb({
        result: list.map(function (item) {
          return [item._id, Date.parse(item._mtime)];
        })
      });
    var wanted = body.all ? null : {};
    (body.ids || []).forEach(function (id) {
      if (wanted) wanted[id] = 1;
    });
    cb({
      result: list.filter(function (item) {
        return !wanted || wanted[item._id];
      })
    });
  });
}

module.exports = {
  chooseProfile: chooseProfile,
  isNuvioKey: function (key) {
    return /^nuvio:/.test(String(key || ''));
  },
  nuvioApi: nuvioApi,
  profiles: profiles
};
