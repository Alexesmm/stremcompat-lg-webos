'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var sourceHas = require('./lib/source-check').sourceHas;

var source = fs.readFileSync(path.join(__dirname, '..', 'service', 'interface.js'), 'utf8');

function element(id) {
  var el = {
    id: id || '',
    className: '',
    style: {},
    value: '',
    innerHTML: '',
    textContent: '',
    children: [],
    offsetHeight: 100,
    offsetTop: 0,
    parentNode: null,
    appendChild: function (child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild: function () {},
    insertBefore: function () {},
    addEventListener: function () {},
    getElementsByClassName: function (name) {
      if (name === 'navlabel') {
        if (!this._navLabel) this._navLabel = element(this.id + '-label');
        return [this._navLabel];
      }
      return [element()];
    },
    getElementsByTagName: function () {
      return [];
    },
    querySelector: function (selector) {
      if (selector === '.navlabel') {
        if (!this._navLabel) this._navLabel = element(this.id + '-label');
        return this._navLabel;
      }
      return null;
    },
    focus: function () {},
    blur: function () {},
    pause: function () {},
    load: function () {},
    attributes: {},
    setAttribute: function (name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute: function (name) {
      return this.attributes[name] || null;
    },
    removeAttribute: function (name) {
      delete this.attributes[name];
    }
  };
  return el;
}

function run(storage, expectedScreen, missingIds, expectedLanguage) {
  var elements = {};
  var body = element('body');
  missingIds = missingIds || {};
  function get(id) {
    if (missingIds[id]) return null;
    if (!elements[id]) elements[id] = element(id);
    return elements[id];
  }
  var document = {
    body: body,
    activeElement: null,
    getElementById: get,
    createElement: function (tag) {
      return element(tag);
    },
    addEventListener: function () {}
  };
  var failure = null;
  var context = {
    document: document,
    localStorage: storage,
    location: { hash: '', reload: function () {}, replace: function () {} },
    history: { state: null, pushState: function () {}, replaceState: function () {}, back: function () {} },
    navigator: { userAgent: 'QtWebEngine/5.2.1 Chrome/38.0.2125.122 WebAppManager' },
    XMLHttpRequest: function () {
      this.open = function () {};
      this.send = function () {};
      this.abort = function () {};
      this.setRequestHeader = function () {};
    },
    Image: function () {
      return element('img');
    },
    /* short timers run at once, and so does the 7 s limit of the opening screen (no catalog answers here) */
    setTimeout: function (callback, delay) {
      if ((delay || 0) < 500 || delay === 7000) callback();
      return 1;
    },
    clearTimeout: function () {},
    setInterval: function () {
      return 1;
    },
    clearInterval: function () {},
    console: console
  };
  context.window = context;
  context.window.addEventListener = function () {};
  context.window.__SC_PHASE__ = function (phase) {
    context.phase = phase;
  };
  context.window.__SC_BOOT_ERROR__ = function (message, line) {
    failure = String(line) + ': ' + String(message);
  };
  vm.runInNewContext(source, context, { filename: 'interface.js', timeout: 2000 });
  assert.strictEqual(failure, null, failure || 'unexpected startup failure');
  assert.strictEqual(context.window.__SC_BOOT_DONE__, true);
  expectedLanguage = expectedLanguage || 'en-US';
  assert.strictEqual(context.window.__SC_UI_LANGUAGE__(), expectedLanguage, 'unexpected interface language');
  assert.strictEqual(
    get('chipSearch').querySelector('.navlabel').textContent,
    expectedLanguage === 'pt-BR' ? 'Buscar' : 'Search'
  );
  assert.strictEqual(get('chipAddons').querySelector('.navlabel').textContent, 'Addons');
  assert.strictEqual(
    get('lgQrTitle').textContent,
    expectedLanguage === 'pt-BR' ? 'Entrar pelo celular' : 'Sign in with your phone'
  );
  var passElement = get('lgPass');
  if (passElement)
    assert.strictEqual(
      passElement.getAttribute('placeholder'),
      expectedLanguage === 'pt-BR' ? 'Senha' : 'Password'
    );
  assert.ok(
    get('lgLang').innerHTML.indexOf(expectedLanguage === 'pt-BR' ? 'Português (Brasil)' : 'English') >= 0,
    'language picker label was not localized'
  );
  assert.ok(/\bon\b/.test(get(expectedScreen).className), expectedScreen + ' was not shown');
  assert.strictEqual(get('boot').style.display, 'none');
  if (expectedScreen === 'scrLogin') {
    assert.ok(/\blogin\b/.test(body.className), 'login body state was not enabled');
    assert.strictEqual(get('logobg').className, '', 'login watermark was not disabled');
  } else {
    assert.ok(!/\blogin\b/.test(body.className), 'login body state leaked into authenticated UI');
  }
  return { context: context, get: get, body: body };
}

function memoryStorage(initial) {
  var values = initial || {};
  return {
    get length() {
      return Object.keys(values).length;
    },
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    setItem: function (key, value) {
      values[key] = String(value);
    },
    removeItem: function (key) {
      delete values[key];
    },
    key: function (index) {
      return Object.keys(values)[index] || null;
    }
  };
}

function emptyStorage() {
  return memoryStorage();
}

function unavailableStorage() {
  var storage = {
    getItem: function () {
      throw new Error('storage unavailable');
    },
    setItem: function () {
      throw new Error('storage unavailable');
    },
    key: function () {
      throw new Error('storage unavailable');
    }
  };
  Object.defineProperty(storage, 'length', {
    get: function () {
      throw new Error('storage unavailable');
    }
  });
  return storage;
}

function accountStorage() {
  return memoryStorage({
    user: JSON.stringify({ _id: 'test-user', email: 'test@example.com' }),
    authKey: JSON.stringify('test-auth-key'),
    addons: '[]',
    signedInFor40: '1'
  });
}

var firstRun = run(emptyStorage(), 'scrLogin', null, 'en-US');
/* the first start of 4.0: two questions, and skipping keeps what the TV had */
(function () {
  function setup(stored, lowMemory) {
    var data = Object.assign({}, stored),
      els = {},
      body = { className: '' };
    var ctx = {
      TV_PROFILE: { lowMemory: !!lowMemory },
      lsRaw: function (k, d) {
        return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : d;
      },
      lsRawSet: function (k, v) {
        data[k] = String(v);
      },
      user: function () {
        return { _id: 'u' };
      },
      profilePanel: { open: false },
      tx: function (k) {
        return k;
      },
      $: function (id) {
        return (
          els[id] || (els[id] = { style: {}, innerHTML: '', textContent: '', appendChild: function () {} })
        );
      },
      document: {
        createElement: function () {
          return { appendChild: function () {}, style: {} };
        },
        body: body
      },
      setF: function () {},
      bodyAdd: function (n) {
        if ((' ' + body.className + ' ').indexOf(' ' + n + ' ') < 0)
          body.className = (body.className + ' ' + n).trim();
      },
      bodyRemove: function (n) {
        body.className = (' ' + body.className + ' ').replace(' ' + n + ' ', ' ').trim();
      }
    };
    vm.runInNewContext(
      fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'views', 'setup.js'), 'utf8'),
      ctx
    );
    ctx.data = data;
    ctx.body = body;
    return ctx;
  }
  var fresh = setup({});
  fresh.setupPanel.maybeShow();
  assert.strictEqual(fresh.setupPanel.open, true, 'the first start of 4.0 did not ask anything');
  fresh.setupPanel.choose(0);
  fresh.setupPanel.choose(1);
  assert.strictEqual(fresh.data.uiMode, 'simple', 'Simple was not kept');
  assert.strictEqual(fresh.data.uiLook, 'light', 'Light was not kept');
  assert.strictEqual(fresh.setupPanel.open, false, 'the questions did not close after the second answer');
  assert.ok(
    /\blite\b/.test(fresh.body.className) && fresh.TV_PROFILE.lowMemory,
    'Light did not take effect at once'
  );
  var oldModern = setup({ uiLook: 'modern' });
  oldModern.applyLook();
  assert.ok(
    oldModern.uiLook() === 'standard' && !/lite/.test(oldModern.body.className),
    'a TV that chose the removed modern look did not get the standard one'
  );
  assert.strictEqual(setup({}).uiLook(), 'standard', 'a TV that never chose did not keep the standard look');
  var again = setup({ setupDone: '1' });
  again.setupPanel.maybeShow();
  assert.strictEqual(again.setupPanel.open, false, 'the questions came back after being answered');
  var skipped = setup({}, true);
  skipped.setupPanel.maybeShow();
  skipped.setupPanel.choose(2);
  assert.strictEqual(skipped.data.uiMode, undefined, 'skipping changed how the app is used');
  assert.strictEqual(skipped.uiLook(), 'light', 'a small TV that skipped lost its light look');
  assert.strictEqual(skipped.simpleMode(), false, 'skipping did not keep the complete mode');
  assert.strictEqual(skipped.data.setupDone, '1', 'skipping did not count as answered');
})();
/* going back to a season returns to the episode it was left on */
(function () {
  var ctx = { detail: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'views', 'detail-episodes.js'), 'utf8'),
    ctx
  );
  var d = ctx.detail;
  d.id = 'tt3';
  d.episodeMode = 'season';
  d.seasonIdx = 0;
  d.epIdx = 6;
  d.buildEps = function () {
    d.eps = new Array(d.seasonIdx === 0 ? 10 : 4);
    d.epIdx = 0;
  };
  d.switchEpisodeList(function () {
    d.seasonIdx = 1;
  });
  assert.strictEqual(d.epIdx, 0, 'a season never opened did not start at its first episode');
  d.epIdx = 3;
  d.switchEpisodeList(function () {
    d.seasonIdx = 0;
  });
  assert.strictEqual(d.epIdx, 6, 'going back to a season lost the episode it was left on');
  d.switchEpisodeList(function () {
    d.seasonIdx = 1;
  });
  assert.strictEqual(d.epIdx, 3, 'the other season lost its episode');
})();
/* the remote meter in Diagnostics: the typical and slowest answer, and late frames */
(function () {
  var frames = [],
    clock = 0;
  var meter = {
    window: {},
    performance: {
      now: function () {
        return clock;
      }
    },
    Date: {
      now: function () {
        return clock;
      }
    },
    Math: Math,
    tx: function (k, a, b, c) {
      return [a, b, c].join(' ');
    }
  };
  meter.window.requestAnimationFrame = meter.requestAnimationFrame = function (f) {
    frames.push(f);
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'core', 'smoothness.js'), 'utf8'),
    meter
  );
  assert.strictEqual(meter.smoothnessLine(), '', 'the meter spoke before any key');
  [40, 60, 300].forEach(function (wait) {
    clock += 1000;
    meter.noteKey();
    var start = clock;
    /* the frames that answer the key, then the frame watch runs out */
    for (var f = 0; frames.length && f < 200; f++) {
      clock = f < 3 ? start + wait : clock + 17;
      frames.shift()(clock);
    }
  });
  assert.strictEqual(
    meter.smoothnessLine().split(' ').slice(0, 2).join(' '),
    '60 300',
    'the typical and slowest answers are wrong'
  );
})();
assert.strictEqual(
  typeof firstRun.context.__SC_RESUME_CHECK__,
  'function',
  'runtime resume recovery hook is missing'
);
assert.strictEqual(
  typeof firstRun.context.__SC_MANUAL_RECOVER__,
  'function',
  'manual recovery hook is missing'
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(firstRun.context.__SC_STREAM_COMPAT__({ title: 'AV1 2160p' }))),
  { labels: ['AV1'], rank: 3 }
);
assert.deepStrictEqual(
  JSON.parse(
    JSON.stringify(firstRun.context.__SC_STREAM_COMPAT__({ title: 'Dolby Vision HDR10 HEVC Main10 DTS' }))
  ),
  { labels: ['Dolby Vision', 'HEVC 10-bit', 'DTS'], rank: 0 }
);
var manySources = [],
  qualities = ['4K', '1080p', '720p', 'SD', 'Other'];
for (var si = 0; si < 80; si++)
  manySources.push({
    url: 'https://media.example/' + si,
    quality: qualities[si % qualities.length],
    seeders: 80 - si,
    compatRank: si % 13 === 0 ? 2 : 0,
    _seq: si
  });
var compacted = firstRun.context.__SC_COMPACT_SOURCES__(manySources, 12);
assert.ok(compacted.items.length <= 12, 'global source budget was exceeded');
qualities.forEach(function (quality) {
  assert.ok(
    compacted.items.some(function (item) {
      return item.quality === quality;
    }),
    'source sampling lost ' + quality
  );
});
/* a torrent addon with many seeded sources leaves room for a debrid addon, whose links have no seeders */
var mixedSources = [];
for (var mi = 0; mi < 90; mi++)
  mixedSources.push({
    url: 'https://t.example/' + mi,
    quality: '1080p',
    seeders: 500 - mi,
    addon: 'Torrents',
    _seq: mi
  });
for (mi = 0; mi < 12; mi++)
  mixedSources.push({ url: 'https://d.example/' + mi, quality: '1080p', addon: 'Debrid', _seq: 100 + mi });
var mixed = firstRun.context.__SC_COMPACT_SOURCES__(mixedSources, 60).items;
assert.strictEqual(mixed.length, 60, 'the source budget was not used');
assert.ok(
  mixed.filter(function (item) {
    return item.addon === 'Debrid';
  }).length >= 12,
  'a debrid addon was pushed off the source list'
);
/* addons that all report seeders keep the ranking they had before */
var seededOnly = mixedSources.slice(0, 90).concat(
  mixedSources.slice(0, 40).map(function (item, n) {
    return { url: 'https://u.example/' + n, quality: '1080p', seeders: 10, addon: 'Other', _seq: 200 + n };
  })
);
assert.ok(
  firstRun.context.__SC_COMPACT_SOURCES__(seededOnly, 60).items.every(function (item) {
    return item.addon === 'Torrents';
  }),
  'addons with seeders lost their ranking'
);
assert.ok(
  !sourceHas(source, "location.assign('/play?u='"),
  'beta player fallback leaked a source URL into browser history'
);
assert.ok(
  !sourceHas(source, 'self.poll=setInterval'),
  'QR polling still allows overlapping interval requests'
);
assert.ok(
  sourceHas(source, "if(this.type!=='series')this.addBtn(tx(simpleMode()?'sourcesButton':'watch')"),
  'movie details do not expose an explicit Watch action, or the whole list in Simple'
);
assert.ok(
  sourceHas(source, 'detail.meta===m&&detail.id===mediaId'),
  'late detail artwork can overwrite the current title'
);
assert.ok(
  sourceHas(source, 'function queuePointerHover(target)'),
  'Magic Remote hover navigation is not debounced'
);
assert.ok(sourceHas(source, "def.k==='__reload'"), 'Settings recovery action is not wired');
assert.ok(
  sourceHas(source, "$('bg2').style.backgroundImage='none'"),
  'inactive backdrop texture is not released'
);
var episodeModel = firstRun.context.__SC_EPISODE_MODEL__([
  { id: 'show:2:2', season: 2, episode: 2, title: 'Later' },
  { id: 'show:0:1', season: 0, episode: 1, title: 'Special' },
  { id: 'show:1:2', season: 1, episode: 2, title: 'Second' },
  { id: 'show:1:1', season: 1, episode: 1, title: 'First' },
  { id: 'show:2:1', season: 2, episode: 1, title: 'Third', absoluteEpisode: 101 }
]);
assert.strictEqual(episodeModel.seasons[0].n, 1, 'regular seasons were not sorted before specials');
assert.strictEqual(
  episodeModel.seasons[episodeModel.seasons.length - 1].n,
  0,
  'specials were not placed last'
);
assert.strictEqual(episodeModel.linear.length, 4, 'specials leaked into continuous episode order');
assert.strictEqual(episodeModel.linear[0]._stremAbsolute, 1, 'continuous numbering did not start at one');
assert.strictEqual(
  episodeModel.linear[2]._stremAbsolute,
  101,
  'provider absolute episode number was not preserved'
);
assert.strictEqual(
  firstRun.context.__SC_EPISODE_INDEX__(episodeModel.linear, 101),
  2,
  'overall episode lookup did not find the requested episode'
);
assert.strictEqual(
  firstRun.context.__SC_EPISODE_INDEX__(episodeModel.linear, 999),
  -1,
  'overall episode lookup accepted a missing episode'
);
var longSeason = [];
for (var le = 0; le < 30; le++) longSeason.push({ id: 'long:1:x' + le, season: 1, title: 'Untitled ' + le });
longSeason.push({ id: 'long:1:x3', season: 1, title: 'Duplicate of 3' });
longSeason.unshift({ id: 'long:1:2', season: 1, episode: 2 }, { id: 'long:1:1', season: 1, episode: 1 });
var longModel = firstRun.context.__SC_EPISODE_MODEL__(longSeason);
assert.strictEqual(longModel.linear.length, 32, 'a video listed twice was counted twice');
assert.strictEqual(longModel.linear[0].id, 'long:1:1', 'numbered episodes did not come first');
assert.strictEqual(longModel.linear[2].id, 'long:1:x0', 'unnumbered episodes lost the order the addon sent');
assert.strictEqual(longModel.linear[31].id, 'long:1:x29', 'unnumbered episodes were reordered');
assert.strictEqual(
  longModel.linear[2]._stremSeasonEpisode,
  3,
  'an unnumbered episode reused an existing number'
);
assert.strictEqual(
  longModel.linear[31]._stremAbsolute,
  32,
  'overall numbering skipped or repeated an episode'
);
var flatModel = firstRun.context.__SC_EPISODE_MODEL__([
  { id: 'ch:a', title: 'A' },
  { id: 'ch:b', title: 'B' }
]);
assert.strictEqual(flatModel.linear.length, 2, 'a series without seasons had no overall numbering');
assert.strictEqual(flatModel.seasons[0].n, 1, 'a series without seasons was shown as specials');
assert.ok(
  !sourceHas(source, 'window.prompt('),
  'episode jump still depends on an unsupported browser prompt'
);
assert.strictEqual(typeof firstRun.context.__SC_EPISODE_JUMP__, 'object', 'in-app episode keypad is missing');
firstRun.context.__SC_EPISODE_JUMP__.show(12);
firstRun.context.__SC_EPISODE_JUMP__.press(6);
firstRun.context.__SC_EPISODE_JUMP__.press(10);
assert.strictEqual(
  firstRun.context.__SC_EPISODE_JUMP__.value,
  '70',
  'episode keypad did not replace the suggested number and append digits'
);
firstRun.context.__SC_EPISODE_JUMP__.close();
var cwCard = firstRun.context.__SC_CW_CARD__;
var ep22 = 22 * 60000,
  movie = 120 * 60000;
var watching = cwCard({
  _id: 'tt5',
  type: 'series',
  name: 'Show',
  state: { video_id: 'tt5:2:5', timeOffset: 10 * 60000, duration: ep22 }
});
assert.strictEqual(watching.minutesLeft, 12, 'Continue Watching minutes left are wrong');
assert.strictEqual(watching.upNext, false, 'an episode in progress was treated as finished');
firstRun.context.localStorage.setItem('tvnext_tt5_tt5:2:5', 'tt5:2:6');
var done = cwCard({
  _id: 'tt5',
  type: 'series',
  name: 'Show',
  state: { video_id: 'tt5:2:5', timeOffset: ep22 - 90000, duration: ep22 }
});
assert.strictEqual(
  done.upNext && done.videoId,
  'tt5:2:6',
  'a finished episode did not become its next episode'
);
assert.strictEqual(
  cwCard({
    _id: 'm',
    type: 'movie',
    state: { video_id: 'm', timeOffset: movie - 10 * 60000, duration: movie }
  }).upNext,
  false,
  'ten minutes before the end of a film counted as finished'
);
assert.strictEqual(
  cwCard({ _id: 'c', type: 'movie', state: { video_id: 'c', timeOffset: 65000, duration: 600000 } })
    .minutesLeft,
  9,
  'minutes left were not rounded'
);
var pointer = cwCard({
  _id: 'tt8',
  type: 'series',
  name: 'Other',
  state: { video_id: 'tt8:1:4', timeOffset: 1, duration: 0 }
});
assert.strictEqual(
  pointer.upNext && pointer.videoId,
  'tt8:1:4',
  'the next episode set by another Stremio app was not offered'
);
assert.strictEqual(
  cwCard({ _id: 'm2', type: 'movie', state: { video_id: 'm2', timeOffset: 1, duration: 0 } }).upNext,
  false,
  'a film at the start became an up next card'
);
var tagText = firstRun.context
  .__SC_SOURCE_TAGS__({
    name: 'Torrentio 4k',
    title: 'Show.2160p.WEB-DL.DDP5.1.DV.HDR10.HEVC 24.5 GB',
    quality: '4K',
    seeders: 532
  })
  .map(function (x) {
    return x.t;
  })
  .join(',');
assert.strictEqual(tagText, '4K,HDR,DV,24.5 GB,532 seeds', 'source tags were not read from the stream text');
var langsOf = function (title, name) {
  return firstRun.context.__SC_STREAM_LANGUAGES__({ name: name || 'Torrentio', title: title }).join(',');
};
assert.strictEqual(
  langsOf('Show.S01E01.1080p\n👤 12 💾 1.2 GB\nMulti Audio / 🇬🇧 / 🇮🇹'),
  'en,it,multi',
  'flags and multi audio were not read'
);
assert.strictEqual(
  langsOf('Filme.2023.1080p.WEB-DL.DUAL.5.1 Dublado'),
  'pt-BR,multi',
  'a Brazilian dubbed release was not detected'
);
assert.strictEqual(
  langsOf('Pelicula 1080p 🇲🇽 Latino', 'Latam'),
  'es-419',
  'Latin American Spanish was not detected'
);
assert.strictEqual(
  langsOf('The.Movie.2160p.WEB-DL.DDP5.1.HEVC'),
  '',
  'a release without language words got a language'
);
assert.strictEqual(
  langsOf('Lost.Italy.Germany.1080p'),
  '',
  'country names in a title were read as languages'
);
/* The language filter keeps exactly the sources of 1.3.0: detection is unchanged, Multi Subs
   sources only get a subtitle tag. Expected groups are the ones 1.3.0 produced. */
var langSamples = [
  [
    'Torrentio',
    '[Erai-raws] One Piece - 1180 [1080p CR WEBRip HEVC AAC][MultiSub]\n\uD83D\uDC64 167 \uD83D\uDCBE 710 MB NyaaSi Multi Subs / \uD83C\uDDEC\uD83C\uDDE7 / \uD83C\uDDE7\uD83C\uDDF7 / \uD83C\uDDEA\uD83C\uDDF8 / \uD83C\uDDEB\uD83C\uDDF7 / \uD83C\uDDE9\uD83C\uDDEA',
    'en,pt-BR,es,fr,de,multi',
    true
  ],
  [
    'Torrentio',
    'Show.S01E01.1080p\nMulti Audio / \uD83C\uDDEC\uD83C\uDDE7 / \uD83C\uDDEE\uD83C\uDDF9',
    'en,it,multi',
    false
  ],
  ['Torrentio', 'Filme.2023.1080p.WEB-DL.DUAL.5.1 Dublado', 'pt-BR,multi', false],
  ['Latam', 'Pelicula 720p \uD83C\uDDF2\uD83C\uDDFD Latino', 'es-419', false],
  ['Torrentio', 'The.Movie.2023.2160p.WEB-DL.DDP5.1.HEVC', '', false],
  [
    'Torrentio',
    'Anime 1080p Multi-Subs Dual Audio / \uD83C\uDDEF\uD83C\uDDF5 / \uD83C\uDDFA\uD83C\uDDF8',
    'ja,en,multi',
    false
  ]
];
langSamples.forEach(function (sample) {
  var src = { name: sample[0], title: sample[1] };
  assert.strictEqual(
    firstRun.context.__SC_STREAM_LANGUAGES__(src).join(','),
    sample[2],
    'language detection changed for: ' + sample[1]
  );
  assert.strictEqual(
    firstRun.context.__SC_SUBTITLE_LANGUAGES_ONLY__(src),
    sample[3],
    'subtitle-only flags misread for: ' + sample[1]
  );
});
var subTags = firstRun.context.__SC_SOURCE_TAGS__({
  name: 'Torrentio',
  title: '1080p',
  quality: '1080p',
  langs: ['en', 'pt-BR', 'es', 'multi'],
  subLangsOnly: true
});
assert.strictEqual(
  subTags[1].c + ':' + subTags[1].t,
  'sublang:SUBS EN · PT-BR +1',
  'Multi Subs flags were not tagged as subtitles'
);
var heroHtml = firstRun.context.__SC_HERO_META__({ runtime: '109 min', year: '2026', imdbRating: '7.8' });
assert.ok(/109 min.*2026.*7\.8.*IMDb/.test(heroHtml), 'the hero info line is out of order: ' + heroHtml);
assert.strictEqual(
  firstRun.context.__SC_HERO_META__({ runtime: '<b>' }).indexOf('<b>'),
  -1,
  'hero metadata was not escaped'
);
var compatOf = firstRun.context.__SC_STREAM_COMPAT__;
var rarSource = compatOf({
  name: 'Torrentio',
  title: 'Movie.2020.1080p.WEB',
  filename: 'Movie.2020.1080p.WEB.rar',
  url: 'http://127.0.0.1:11470/abc/0'
});
assert.ok(
  rarSource.rank === 4 && rarSource.labels.indexOf('RAR') >= 0,
  'a .rar source was not moved to the end with a warning'
);
assert.strictEqual(
  compatOf({ name: 'Debrid', title: 'Show pack', url: 'https://cdn.example/files/show.part1.zip?token=1' })
    .rank,
  4,
  'a .zip link was not recognised'
);
var rarbg = compatOf({
  name: 'Torrentio',
  title: 'Movie.2020.1080p.WEBRip.x264-RARBG',
  filename: 'Movie.2020.1080p.WEBRip.x264-RARBG.mp4'
});
assert.ok(rarbg.rank === 0 && rarbg.labels.indexOf('RAR') < 0, 'a RARBG release was mistaken for an archive');
var afterFail = firstRun.context.__SC_NEXT_AFTER_FAILURE__(
  [
    { stored: 'q', addon: 'Last' },
    { addon: 'Torrentio', name: 'A', title: 'broken' },
    { addon: 'Torrentio', name: 'B', title: 'good' }
  ],
  { addon: 'Torrentio', text: 'A broken' }
);
assert.strictEqual(afterFail && afterFail.name, 'B', 'the failed source was offered again');
var afterFailLines = firstRun.context.__SC_NEXT_AFTER_FAILURE__(
  [
    { addon: 'Torrentio', name: 'Torrentio\n1080p', title: 'file\n2 GB' },
    { addon: 'Torrentio', name: 'Torrentio\n720p', title: 'other' }
  ],
  { addon: 'Torrentio', text: 'Torrentio 1080p file 2 GB' }
);
assert.strictEqual(
  afterFailLines && afterFailLines.title,
  'other',
  'a source with line breaks in its name was offered again after failing'
);
var newEp = firstRun.context.__SC_FIRST_NEW_EPISODE__(
  {
    videos: [
      { id: 's:1:1', season: 1, episode: 1, released: '2020-01-01T00:00:00Z' },
      { id: 's:2:1', season: 2, episode: 1, released: '2021-03-01T00:00:00Z' },
      { id: 's:2:2', season: 2, episode: 2, released: '2021-03-08T00:00:00Z' },
      { id: 's:0:5', season: 0, episode: 5, released: '2021-03-02T00:00:00Z' },
      { id: 's:2:3', season: 2, episode: 3, released: '2999-01-01T00:00:00Z' }
    ]
  },
  { lastWatched: '2021-02-01T00:00:00Z', watchedEpisodes: ['s:2:1'] }
);
assert.strictEqual(newEp && newEp.id, 's:2:2', 'new episodes ignored watched, special or unaired rules');
assert.strictEqual(newEp.count, 1, 'new episode count is wrong');
var mtimeMs = firstRun.context.__SC_MTIME_MS__;
assert.strictEqual(
  mtimeMs('2026-10-28T12:00:00.000Z'),
  Date.parse('2026-10-28T12:00:00.000Z'),
  'an ISO library time was not read as a time'
);
assert.strictEqual(
  mtimeMs(1793000000000),
  1793000000000,
  'a millisecond library time from datastoreMeta was changed'
);
assert.ok(
  mtimeMs('2026-10-28T12:00:00.000Z') > mtimeMs(1700000000000),
  'library times are still compared as text'
);
var fromBits = firstRun.context.__SC_WATCHED_FROM_BITS__;
var bitVideos = [
  { id: 's:1:1', season: 1, episode: 1 },
  { id: 's:1:2', season: 1, episode: 2 },
  { id: 's:1:3', season: 1, episode: 3 },
  { id: 's:0:1', season: 0, episode: 1 }
];
assert.strictEqual(
  Object.keys(fromBits({ anchor: 's:1:2', alen: 3, bits: [0, 1, 1, 0] }, bitVideos))
    .sort()
    .join(),
  's:1:1,s:1:2',
  'watched episodes from other Stremio apps were not read'
);
bitVideos.push({ id: 's:0:2', season: 0, episode: 2 });
assert.strictEqual(
  Object.keys(fromBits({ anchor: 's:1:2', alen: 3, bits: [0, 1, 1, 0] }, bitVideos))
    .sort()
    .join(),
  's:1:1,s:1:2',
  'the watched field was not shifted to its anchor episode'
);
assert.strictEqual(
  Object.keys(fromBits({ anchor: 'gone', alen: 3, bits: [1, 1, 1] }, bitVideos)).length,
  0,
  'an unknown anchor marked episodes as watched'
);
var baseEpisodes = { videos: [{ id: 'show:1:1', season: 1, episode: 1 }] };
assert.strictEqual(
  firstRun.context.__SC_MERGE_EPISODES__(baseEpisodes, {
    videos: [{ id: 'show:1:1', season: 1, episode: 1, thumbnail: '/still.jpg', overview: 'Overview' }]
  }),
  true,
  'metadata enrichment did not report a change'
);
assert.strictEqual(
  baseEpisodes.videos[0].thumbnail,
  '/still.jpg',
  'metadata enrichment did not fill a missing thumbnail'
);
var nextMatch = firstRun.context.__SC_MATCH_NEXT_SOURCE__(
  [
    { addon: 'Other', quality: '1080p', title: 'H264 AAC', seeders: 900, compatRank: 0 },
    { addon: 'Torrentio', quality: '4K', title: 'HEVC 10bit DDP WEB-DL', seeders: 20, compatRank: 0 },
    { addon: 'Torrentio', quality: '4K', title: 'H264 AAC', seeders: 200, compatRank: 0 }
  ],
  { addon: 'Torrentio', quality: '4K', text: 'HEVC 10bit DDP WEB-DL', compat: 'HEVC 10-bit' }
);
assert.strictEqual(
  nextMatch.title,
  'HEVC 10bit DDP WEB-DL',
  'next episode did not prefer the closest safe source traits'
);
firstRun.context.localStorage.setItem('noHistory', 'true');
firstRun.context.__SC_REMEMBER_SEARCH__('private title');
assert.ok(
  String(firstRun.context.localStorage.getItem('recentSearches') || '').indexOf('private title') < 0,
  'a search was remembered with Do not save history on'
);
firstRun.context.localStorage.removeItem('noHistory');
var srvPanel = firstRun.context.__SC_SERVER_PANEL__;
srvPanel.show('http://192.168.0.5:11470', function () {});
assert.strictEqual(srvPanel.text, '192.168.0.5:11470', 'the current address was not offered for editing');
srvPanel.key(40);
assert.strictEqual(srvPanel.idx, 10, 'Down did not move one row of keys');
srvPanel.idx = 39;
srvPanel.key(39);
assert.strictEqual(srvPanel.idx, 39, 'Right left the row of keys');
srvPanel.key(40);
assert.strictEqual(srvPanel.idx, 43, 'Down did not reach the actions from the last key');
srvPanel.key(38);
assert.strictEqual(srvPanel.idx, 37, 'Up did not return to the keys from the actions');
srvPanel.idx = 0;
srvPanel.press(0);
assert.strictEqual(srvPanel.text, '192.168.0.5:114701', 'a key did not type');
srvPanel.key(55);
assert.strictEqual(srvPanel.text, '192.168.0.5:1147017', 'a number key of the remote did not type');
srvPanel.press(40);
srvPanel.press(40);
assert.strictEqual(srvPanel.text, '192.168.0.5:11470', 'Delete did not remove the last character');
srvPanel.press(41);
assert.strictEqual(srvPanel.text, '', 'Clear did not empty the address');
srvPanel.close();
var matchNext = firstRun.context.__SC_MATCH_NEXT_SOURCE__;
var pack = {
  addon: 'Torrentio',
  quality: '720p',
  title: 'Other',
  seeders: 1,
  compatRank: 0,
  bingeGroup: 'torrentio|pack'
};
var strongEn = {
  addon: 'Torrentio',
  quality: '1080p',
  title: 'English',
  seeders: 900,
  compatRank: 0,
  langs: ['en']
};
var weakBr = {
  addon: 'Torrentio',
  quality: '1080p',
  title: 'Dublado',
  seeders: 2,
  compatRank: 0,
  langs: ['pt-BR']
};
var multiAudio = {
  addon: 'Torrentio',
  quality: '1080p',
  title: 'Multi',
  seeders: 50,
  compatRank: 0,
  langs: ['multi']
};
var plain = { addon: 'Torrentio', quality: '1080p', title: 'Plain', seeders: 40, compatRank: 0, langs: [] };
assert.strictEqual(
  matchNext([strongEn, pack], { addon: 'Torrentio', quality: '1080p', binge: 'torrentio|pack' }),
  pack,
  'the same release marker did not settle the next source'
);
assert.strictEqual(
  matchNext([strongEn, weakBr], { addon: 'Torrentio', quality: '1080p', langs: ['pt-BR'] }),
  weakBr,
  'seeders beat the language being watched'
);
assert.strictEqual(
  matchNext([strongEn], { addon: 'Torrentio', quality: '1080p', langs: ['pt-BR'] }),
  null,
  'a source in another language was chosen for the next episode'
);
assert.strictEqual(
  matchNext([plain], { addon: 'Torrentio', quality: '1080p', langs: ['pt-BR'] }),
  null,
  'a source with no named language replaced a dub'
);
assert.strictEqual(
  matchNext([strongEn, multiAudio], { addon: 'Torrentio', quality: '1080p', langs: ['pt-BR'] }),
  multiAudio,
  'multi audio was not accepted for a named language'
);
assert.strictEqual(
  matchNext([strongEn, plain], { addon: 'Torrentio', quality: '1080p', langs: [] }),
  plain,
  'a dub replaced a source that names no language'
);
assert.strictEqual(
  matchNext([strongEn], { addon: 'Torrentio', quality: '1080p' }).title,
  'English',
  'an older saved preference was judged by language'
);
assert.strictEqual(
  matchNext([{ addon: 'Torrentio', quality: '1080p', title: 'x.rar', compatRank: 4, langs: [] }], {
    addon: 'Torrentio',
    quality: '1080p',
    langs: []
  }),
  null,
  'an archive was chosen for the next episode'
);
(function bestSourceRules() {
  var best = firstRun.context.__SC_BEST_SOURCE__;
  var fourK = { addon: 'a', quality: '4K', compatRank: 0 };
  var unknown = { addon: 'a', quality: 'Other', compatRank: 0 };
  var low = { addon: 'a', quality: 'SD', compatRank: 0 };
  var fullHd = { addon: 'a', quality: '1080p', compatRank: 0 };
  var hevc = { addon: 'a', quality: '1080p', compatRank: 2, compatLabels: ['HEVC 10-bit'] };
  var archive = { addon: 'a', quality: '1080p', compatRank: 4 };
  var stored = { addon: 'a', stored: '?x', quality: 'Recent' };
  assert.strictEqual(best([stored, fourK, fullHd]), fourK, 'the first source of the list was not chosen');
  assert.strictEqual(best([unknown, low, fullHd]), fullHd, 'an unknown or low quality won over a known one');
  assert.strictEqual(best([unknown, hevc]), unknown, 'a warning lost to nothing better without one');
  assert.strictEqual(best([fourK, fullHd], '1080p'), fullHd, 'the quality asked for was not chosen');
  assert.strictEqual(best([unknown, low], 'SD'), low, 'a low quality asked for was not chosen');
  assert.strictEqual(best([fourK], '720p'), fourK, 'without the quality asked for, nothing was chosen');
  assert.strictEqual(best([hevc, fullHd]), fullHd, 'a source with a warning won over one without');
  assert.strictEqual(best([archive, hevc]), hevc, 'an archive was chosen over a source with a warning');
  assert.strictEqual(best([archive, stored]), null, 'something that cannot play was chosen');
})();
(function languageFiles() {
  var english = {};
  function languageOf(tv, stored) {
    var context = {
      navigator: { language: tv },
      localStorage: {
        getItem: function () {
          return stored || null;
        }
      }
    };
    require('vm').runInNewContext(
      fs.readFileSync(path.join(__dirname, '..', 'src', 'shared', 'strings.js'), 'utf8') +
        ';this.lang=UI_LANG;',
      context
    );
    return context.lang;
  }
  assert.strictEqual(languageOf('pt-PT'), 'pt-BR', 'a TV in Portuguese did not open in Portuguese');
  assert.strictEqual(languageOf('fr-FR'), 'fr', 'a TV in French did not open in French');
  assert.strictEqual(
    languageOf('es-MX'),
    'es-419',
    'a TV in Mexican Spanish did not open in Latin American Spanish'
  );
  assert.strictEqual(languageOf('es-ES'), 'es', 'a TV in Spain did not open in Spanish from Spain');
  assert.strictEqual(
    languageOf('ja-JP'),
    'en-US',
    'a language the app does not have did not fall back to English'
  );
  assert.strictEqual(languageOf('pt-BR', 'de'), 'de', "the language of the TV won over the viewer's choice");
  var stringsContext = {
    localStorage: {
      getItem: function () {
        return null;
      }
    }
  };
  require('vm').runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'src', 'shared', 'strings.js'), 'utf8'),
    stringsContext
  );
  english = stringsContext.UI_TEXT['en-US'];
  function holes(text) {
    return (String(text).match(/\{\d+\}/g) || []).sort().join();
  }
  function compare(base, other, name) {
    Object.keys(base).forEach(function (key) {
      if (typeof base[key] === 'object') return compare(base[key], other[key] || {}, name);
      assert.ok(other[key], name + ' lacks ' + key);
      assert.strictEqual(holes(other[key]), holes(base[key]), name + ': placeholders of ' + key);
    });
  }
  Object.keys(stringsContext.UI_LANGUAGES)
    .filter(function (code) {
      return !stringsContext.UI_TEXT[code];
    })
    .forEach(function (code) {
      compare(
        english,
        JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'service', 'lang', code + '.json'), 'utf8')),
        code
      );
    });
})();
/* Home's featured titles: the first catalog that answered, Left, Right, Down and OK, and nothing
   passing by itself on a TV with little memory */
(function featuredTitles() {
  function load(lowMemory) {
    var tick = null,
      opened = [],
      applied = [],
      els = {},
      body = { className: '' };
    function title(id) {
      return { id: id, name: id };
    }
    var ctx = {
      SCR: 'home',
      homeFilled: false,
      TV_PROFILE: { lowMemory: lowMemory },
      lastIn: 0,
      bgv: null,
      streamsUI: { open: false },
      cwMenu: { open: false },
      topNav: {
        active: false,
        focused: false,
        focus: function () {
          this.focused = true;
        }
      },
      uiLook: function () {
        return 'standard';
      },
      tx: function (k) {
        return k;
      },
      bgMid: function () {
        return '';
      },
      isImdb: function () {
        return false;
      },
      prewarm: function () {},
      on: function () {},
      openItem: function (it) {
        opened.push(it.id);
      },
      bodyAdd: function (c) {
        body.className += ' ' + c;
      },
      bodyRemove: function (c) {
        body.className = body.className.split(' ' + c).join('');
      },
      $: function (id) {
        return (
          els[id] || (els[id] = { style: {}, innerHTML: '', textContent: '', appendChild: function () {} })
        );
      },
      document: {
        createElement: function () {
          return {};
        }
      },
      setInterval: function (f) {
        tick = f;
        return 1;
      },
      home: {
        top: true,
        _loadGen: 1,
        rows: [
          { items: [title('cw1'), title('cw2'), title('cw3')], wide: true },
          { items: [title('mine1'), title('mine2'), title('mine3')] },
          { catalog: {}, answered: false, items: [] },
          { catalog: {}, answered: true, items: [title('a'), title('b'), title('c'), { more: true }] }
        ],
        paint: function () {},
        hero: function () {},
        heroApply: function (it) {
          applied.push(it.id);
        }
      }
    };
    vm.runInNewContext(
      fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'features', 'spotlight.js'), 'utf8'),
      ctx
    );
    return {
      ctx: ctx,
      tick: function () {
        tick();
      },
      opened: opened,
      applied: applied,
      body: body
    };
  }
  var t = load(false);
  assert.strictEqual(t.ctx.featuredShown(), false, 'a catalog still loading was passed over');
  t.ctx.home.rows[2].answered = true;
  assert.strictEqual(t.ctx.featuredShown(), true, 'the featured titles did not wait for the first catalog');
  assert.deepStrictEqual(
    t.ctx.featuredItems().map(function (it) {
      return it.id;
    }),
    ['a', 'b', 'c'],
    'Continue watching, My list or See all were featured'
  );
  t.ctx.featuredKey(39);
  assert.strictEqual(t.applied.pop(), 'b', 'Right did not show the next title');
  assert.ok(/featured/.test(t.body.className), 'the featured look was not on');
  t.ctx.featuredKey(37);
  t.ctx.featuredKey(37);
  assert.strictEqual(t.ctx.topNav.focused, true, 'Left on the first title did not go to the menu');
  t.ctx.featuredKey(13);
  assert.deepStrictEqual(t.opened, ['a'], 'OK did not open the title shown');
  t.ctx.featured.shownAt = 0;
  t.tick();
  assert.strictEqual(t.applied.pop(), 'b', 'the next title did not pass by itself');
  t.ctx.featuredKey(40);
  assert.strictEqual(t.ctx.home.top, false, 'Down did not go to the rows');
  var small = load(true);
  small.ctx.featured.shownAt = 0;
  small.tick();
  assert.strictEqual(small.applied.length, 0, 'the titles passed by themselves on a TV with little memory');
})();
firstRun.context.__SC_SET_UI_LANGUAGE__('pt-BR');
assert.strictEqual(firstRun.context.__SC_UI_LANGUAGE__(), 'pt-BR');
assert.strictEqual(
  firstRun.context.localStorage.getItem('uiLanguage'),
  'pt-BR',
  'language preference was not persisted'
);
assert.strictEqual(
  firstRun.get('chipSearch').querySelector('.navlabel').textContent,
  'Buscar',
  'language change was not applied immediately'
);
run(unavailableStorage(), 'scrLogin');
run(accountStorage(), 'scrBoard');
var animeRun = run(
  memoryStorage({
    user: JSON.stringify({ _id: 'anime-user', email: 'anime@example.com' }),
    authKey: JSON.stringify('anime-auth-key'),
    signedInFor40: '1',
    addons: JSON.stringify([
      {
        transportUrl: 'https://anime.example/manifest.json',
        manifest: {
          id: 'anime.test',
          name: 'Anime Test',
          catalogs: [{ type: 'anime', id: 'popular', name: 'Popular Anime' }]
        }
      }
    ])
  }),
  'scrBoard'
);
var discoverTypes = JSON.parse(JSON.stringify(animeRun.context.__SC_DISCOVER_TYPES__()));
assert.ok(
  discoverTypes.some(function (type) {
    return type.value === 'anime' && type.label === 'Anime';
  }),
  'Discover did not expose an installed anime catalog type'
);
run(memoryStorage({ uiLanguage: 'pt-BR' }), 'scrLogin', null, 'pt-BR');
run(memoryStorage({ uiLanguage: 'unsupported-locale' }), 'scrLogin', null, 'en-US');
run(emptyStorage(), 'scrLogin', { lgEmail: true, lgPass: true });
console.log(
  'OK: Chromium 38 startup keeps English as the fallback, persists Brazilian Portuguese and reaches login or home.'
);
