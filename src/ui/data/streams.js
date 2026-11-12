// Source discovery, quality/seeder/codec classification and per-profile source budget.
/* ================= streams (generic: any addon that declares them) ================= */
function streamAddons(type) {
  return streamAddonsIn(remoteAddons(), type);
}
function qualityLabel(value) {
  return value === 'All'
    ? tx('all')
    : value === 'Other'
      ? tx('other')
      : value === 'Recent'
        ? tx('recent')
        : value;
}
window.__SC_STREAM_COMPAT__ = streamCompatibility;
/* Short tags for the source list, read from the same advisory text: quality, language, HDR,
   size and seeders. A codec or audio format only shows when it is a compatibility warning. */
function sourceTags(s) {
  var t = streamText(s),
    low = t.toLowerCase(),
    out = [],
    m;
  if (s.quality && s.quality !== 'Other' && s.quality !== 'Recent') out.push({ t: s.quality, c: 'q' });
  if (/hdr10\+/.test(low)) out.push({ t: 'HDR10+' });
  else if (/\bhdr(10)?\b/.test(low)) out.push({ t: 'HDR' });
  if (/(dolby[ ._-]?vision|\bdovi\b|\bdv\b)/.test(low)) out.push({ t: 'DV' });
  m = t.match(/(\d+(?:[.,]\d+)?)\s*(gb|gib|mb|mib)\b/i);
  if (m) out.push({ t: m[1].replace(',', '.') + ' ' + m[2].charAt(0).toUpperCase() + 'B', c: 'size' });
  if (s.seeders >= 0) out.push({ t: tx('seedsTag', s.seeders), c: 'seed' });
  /* the language goes right after the quality */
  if (s.langs && s.langs.length)
    out.splice(
      out.length && out[0].c === 'q' ? 1 : 0,
      0,
      s.subLangsOnly ? subTag(s.langs) : { t: langTagText(s.langs), c: 'lang' }
    );
  return out;
}
window.__SC_SOURCE_TAGS__ = sourceTags;
window.__SC_STREAM_LANGUAGES__ = streamLanguages;
window.__SC_SUBTITLE_LANGUAGES_ONLY__ = subtitleLanguagesOnly;
/* 'PT-BR', 'ES-LA · EN', 'MULTI', or the first two and '+2' when there are more */
function langTagText(langs) {
  var names = [];
  for (var i = 0; i < langs.length; i++)
    names.push(langs[i] === 'es-419' ? 'ES-LA' : langs[i] === 'multi' ? 'MULTI' : langs[i].toUpperCase());
  return names.length > 2 ? names.slice(0, 2).join(' · ') + ' +' + (names.length - 2) : names.join(' · ');
}
/* 'LEG EN · PT +4' (subtitles), without the multi marker the words already imply */
function subTag(langs) {
  var named = [];
  for (var i = 0; i < langs.length; i++) if (langs[i] !== 'multi') named.push(langs[i]);
  return { t: tx('subsTag') + ' ' + (named.length ? langTagText(named) : 'MULTI'), c: 'sublang' };
}
/* filter groups of a source: language bases, 'multi', or 'none' when nothing was detected */
function langGroups(s) {
  var langs = s.langs || [],
    out = [];
  for (var i = 0; i < langs.length; i++) {
    var g = langBase(langs[i]);
    if (out.indexOf(g) < 0) out.push(g);
  }
  if (!out.length) out.push('none');
  return out;
}
/* the languages a source can be chosen in, by their own names (Settings, Best source) */
var SOURCE_LANGUAGES = [
  ['pt', 'Português'],
  ['es', 'Español'],
  ['en', 'English'],
  ['fr', 'Français'],
  ['it', 'Italiano'],
  ['de', 'Deutsch'],
  ['ko', '한국어']
];
function sourceLanguageName(code) {
  for (var i = 0; i < SOURCE_LANGUAGES.length; i++)
    if (SOURCE_LANGUAGES[i][0] === code) return SOURCE_LANGUAGES[i][1];
  return tx('anyLanguage');
}
/* the language the source list is ordered by: only one fixed in Settings, so the one chosen in
   Best source does not reorder the whole list */
function fixedSourceLanguage() {
  var set = lsRaw('preferredSourceLanguage', 'Ask');
  return set === 'Ask' ? 'Auto' : set;
}
/* the language Best source looks for: the one in Settings, or with Ask the last one chosen */
function preferredSourceLanguage() {
  var set = lsRaw('preferredSourceLanguage', 'Ask');
  return set === 'Ask' ? lsRaw('bestLanguage', 'Auto') : set;
}
/* 0 when the source has the preferred audio language, 1 for multi audio, 2 otherwise. A source
   whose flags name only its subtitles ("Multi Subs") counts as otherwise, and so does a torrent
   with almost no seeders: the language does not put one that would hardly load above the rest. */
var LANGUAGE_MIN_SEEDERS = 5;
function langRank(s, pref) {
  if (!pref || pref === 'Auto') return 0;
  if (s.subLangsOnly || (s.seeders != null && s.seeders < LANGUAGE_MIN_SEEDERS)) return 2;
  var g = langGroups(s);
  return g.indexOf(pref) >= 0 ? 0 : g.indexOf('multi') >= 0 ? 1 : 2;
}
/* What to play without choosing from the list, whose order already puts compatibility and seeders
   first: in the language asked for when there is one, the first without a warning in the quality
   asked for, or else in any known quality, and a low or unknown quality only when nothing better
   has none. */
function bestSource(items, quality, language) {
  var playable = items.filter(function (s) {
    return !s.stored && !(s.compatRank > 0) && !(s.compatLabels || []).length;
  });
  if (!playable.length)
    playable = items.filter(function (s) {
      return !s.stored && s.compatRank < 4;
    });
  /* the language asked for first, then multi-audio, keeping the list's order within each */
  if (language && language !== 'Auto')
    playable = playable
      .map(function (s, i) {
        return { s: s, i: i, r: langRank(s, language) };
      })
      .sort(function (a, b) {
        return a.r - b.r || a.i - b.i;
      })
      .map(function (x) {
        return x.s;
      });
  var asked = playable.filter(function (s) {
    return s.quality === quality;
  });
  var known = playable.filter(function (s) {
    return s.quality !== 'Other' && s.quality !== 'SD';
  });
  return asked[0] || known[0] || playable[0] || null;
}
window.__SC_BEST_SOURCE__ = bestSource;
function streamSourceKey(s) {
  if (s.stored) return 'stored';
  var u = String(s.url || '').replace(/#.*$/, '');
  var m = u.match(/127\.0\.0\.1:11470\/([0-9a-f]{32,64})\/(\d+)/i);
  return m
    ? 'torrent:' + m[1].toLowerCase() + ':' + m[2]
    : 'url:' + u + '|' + JSON.stringify(s.headers || {}) + '|' + (s.notWebReady ? '1' : '0');
}
function sourceOrder(a, b) {
  if (a.stored && !b.stored) return -1;
  if (b.stored && !a.stored) return 1;
  var ar = a.compatRank || 0,
    br = b.compatRank || 0;
  if (ar !== br) return ar - br;
  var as = a.seeders == null ? -1 : a.seeders,
    bs = b.seeders == null ? -1 : b.seeders;
  if (as !== bs) return bs - as;
  return (a._seq || 0) - (b._seq || 0);
}
function compactSourcePool(input, cap) {
  var best = {},
    unique = [],
    i,
    s,
    k,
    old,
    buckets = {},
    order = ['Recent', '4K', '1440p', '1080p', '720p', 'SD', 'Other'],
    selected = [],
    kept = {},
    trimmed = {},
    rest = [];
  cap = Math.max(1, cap || 60);
  for (i = 0; i < input.length; i++) {
    s = input[i];
    k = streamSourceKey(s);
    old = best[k];
    if (!old) {
      best[k] = s;
      unique.push(s);
    } else if (sourceOrder(s, old) < 0) {
      for (var u = 0; u < unique.length; u++)
        if (unique[u] === old) {
          unique[u] = s;
          break;
        }
      best[k] = s;
    }
  }
  for (i = 0; i < unique.length; i++) {
    s = unique[i];
    k = s.quality || 'Other';
    if (!buckets[k]) {
      buckets[k] = [];
      if (order.indexOf(k) < 0) order.push(k);
    }
    buckets[k].push(s);
  }
  for (i = 0; i < order.length; i++) {
    k = order[i];
    if (buckets[k]) buckets[k].sort(sourceOrder);
  }
  /* Keep one representative of every available quality, then fill the remaining
     global budget by compatibility and reliable seeder metadata. */
  for (i = 0; i < order.length && selected.length < cap; i++) {
    k = order[i];
    if (buckets[k] && buckets[k].length) {
      selected.push(buckets[k][0]);
      kept[k] = 1;
    }
  }
  for (i = 0; i < order.length; i++) {
    k = order[i];
    if (!buckets[k]) continue;
    for (var r = kept[k] || 0; r < buckets[k].length; r++) rest.push(buckets[k][r]);
  }
  rest.sort(sourceOrder);
  /* Debrid and direct links carry no seeder count, so by seeders a torrent addon filled the whole
     list ahead of them. Each addon whose sources have none keeps a share (half of the list, split
     evenly among all addons); addons with seeders compete by rank as before. */
  var share = {},
    seeded = {},
    addons = 0,
    left = [];
  for (i = 0; i < unique.length; i++) {
    k = unique[i].addon || '';
    if (share[k] === undefined) {
      share[k] = 0;
      addons++;
    }
    if (unique[i].seeders != null) seeded[k] = true;
  }
  for (i = 0; i < selected.length; i++)
    share[selected[i].addon || ''] = (share[selected[i].addon || ''] || 0) + 1;
  var floor = Math.floor(cap / (2 * Math.max(1, addons)));
  for (i = 0; i < rest.length; i++) {
    s = rest[i];
    k = s.addon || '';
    if (selected.length < cap && !seeded[k] && share[k] < floor) {
      share[k]++;
      selected.push(s);
      kept[s.quality || 'Other'] = (kept[s.quality || 'Other'] || 0) + 1;
    } else left.push(s);
  }
  rest = left;
  for (i = 0; i < rest.length && selected.length < cap; i++) {
    s = rest[i];
    selected.push(s);
    k = s.quality || 'Other';
    kept[k] = (kept[k] || 0) + 1;
  }
  for (k in buckets)
    if (Object.prototype.hasOwnProperty.call(buckets, k) && buckets[k].length > (kept[k] || 0))
      trimmed[k] = true;
  return { items: selected, trimmed: trimmed };
}
window.__SC_COMPACT_SOURCES__ = compactSourcePool;
/* onDone(total, failed): failed lists the addons that did not answer, so the picker can
   tell "nothing found" apart from "the addon is down". */
function fetchStreams(type, vid, onPart, onDone) {
  var list = streamAddons(type);
  var pending = list.length;
  var total = 0;
  var failed = [];
  if (!pending) {
    onDone(0, failed);
    return;
  }
  for (var i = 0; i < list.length; i++)
    (function (ad, idx) {
      /* an addon that fails at once (a server error from a busy host, or no answer) is asked once
         more; not one that has no such title, nor one that timed out, which would double the wait */
      function ask(again) {
        xhrJson(
          streamUrl(ad, type, vid),
          function (j, failure, status) {
            if ((failure === 'offline' || status >= 500) && !again)
              return setTimeout(function () {
                ask(true);
              }, 1200);
            if (failure) failed.push(ad.name);
            var st = (j && j.streams) || [];
            var out = [];
            for (var k = 0; k < st.length; k++) {
              var item = sourceItem(st[k], ad.name, ad.base);
              if (item) out.push(item);
            }
            total += out.length;
            if (out.length) onPart(out, idx, ad.name);
            pending--;
            if (pending <= 0) onDone(total, failed);
          },
          45000
        ); /* slow debrid addons can take 20-30s; phone/PC wait too — 15s was dropping them */
      }
      ask(false);
    })(list[i], i);
}
