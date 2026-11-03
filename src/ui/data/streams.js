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
/* How a source reaches the TV, for the tag at the start of its row. A torrent is exact: its address
   is the TV's own engine. A debrid source is read from what its addon writes in the name (the
   [RD+] of Torrentio, or the service spelled out); any other link is direct. */
var DEBRID_SERVICES = [
  ['RD', /real[ -]?debrid/],
  ['AD', /all[ -]?debrid/],
  ['PM', /premiumize/],
  ['TB', /torbox/],
  ['DL', /debrid[ -]?link/],
  ['OC', /offcloud/],
  ['ED', /easy[ -]?debrid/],
  ['PP', /pikpak/]
];
function sourceKind(s) {
  if (/^https?:\/\/127\.0\.0\.1:11470\//.test(String(s.url || ''))) return { kind: 'torrent', svc: '' };
  var name = String(s.name || ''),
    code = /\[([A-Za-z]{2})[^\]\s]*[+\u26a1\]\s]/.exec(name),
    low = (name + ' ' + String(s.title || '')).toLowerCase(),
    i;
  for (i = 0; i < DEBRID_SERVICES.length; i++)
    if (DEBRID_SERVICES[i][1].test(low)) return { kind: 'debrid', svc: DEBRID_SERVICES[i][0] };
  if (code && /^(rd|ad|pm|tb|dl|oc|ed|pp)$/i.test(code[1]))
    return { kind: 'debrid', svc: code[1].toUpperCase() };
  return { kind: 'direct', svc: '' };
}
window.__SC_SOURCE_KIND__ = sourceKind;
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
  /* how it reaches the TV goes first, so a torrent and a debrid link are told apart at a glance */
  var kind = sourceKind(s);
  out.unshift({
    t:
      kind.kind === 'torrent'
        ? 'TORRENT'
        : kind.kind === 'debrid'
          ? 'DEBRID' + (kind.svc ? ' \u00b7 ' + kind.svc : '')
          : 'DIRECT',
    c: 'kind ' + kind.kind
  });
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
/* 0 when the source has the preferred language, 1 for multi audio, 2 otherwise */
function langRank(s, pref) {
  if (!pref || pref === 'Auto') return 0;
  var g = langGroups(s);
  return g.indexOf(pref) >= 0 ? 0 : g.indexOf('multi') >= 0 ? 1 : 2;
}
/* What to play without choosing from the list, whose order already puts language, compatibility
   and seeders first: the first without a warning in the quality asked for, or else in any known
   quality, and a low or unknown quality only when nothing better has none. */
function bestSource(items, quality) {
  var playable = items.filter(function (s) {
    return !s.stored && !(s.compatRank > 0) && !(s.compatLabels || []).length;
  });
  if (!playable.length)
    playable = items.filter(function (s) {
      return !s.stored && s.compatRank < 4;
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
/* 0 for debrid, 1 for a plain link and 2 for a torrent when the setting puts debrid links first,
   and 0 for all otherwise. Debrid links carry no seeder count, so by seeders alone every torrent
   outranks them and the source cap drops them. */
function kindRank(s) {
  if (lsRaw('sourcePrefer', 'Auto') !== 'Debrid') return 0;
  var k = s._kind || (s._kind = sourceKind(s).kind);
  return k === 'debrid' ? 0 : k === 'direct' ? 1 : 2;
}
function sourceOrder(a, b) {
  if (a.stored && !b.stored) return -1;
  if (b.stored && !a.stored) return 1;
  var ar = a.compatRank || 0,
    br = b.compatRank || 0;
  if (ar !== br) return ar - br;
  var ak = kindRank(a),
    bk = kindRank(b);
  if (ak !== bk) return ak - bk;
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
  /* Each addon that answered keeps a floor of the budget (half of it, shared out evenly), so one
     addon with many well-ranked sources cannot push the others off the list. */
  var byAddon = {},
    addonNames = [],
    have = {},
    left = [];
  for (i = 0; i < selected.length; i++)
    have[selected[i].addon || ''] = (have[selected[i].addon || ''] || 0) + 1;
  for (i = 0; i < rest.length; i++) {
    k = rest[i].addon || '';
    if (byAddon[k] === undefined) {
      byAddon[k] = 0;
      addonNames.push(k);
    }
  }
  var floor = Math.floor(cap / (2 * Math.max(1, addonNames.length)));
  for (i = 0; i < rest.length; i++) {
    s = rest[i];
    k = s.addon || '';
    if (selected.length < cap && (have[k] || 0) + byAddon[k] < floor) {
      byAddon[k]++;
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
      /* An addon that fails at once (a 404 or 502 from a busy host, or no answer) is asked once
         more; a timeout is not, as that would double the wait for an addon that is down. */
      function ask(attempt) {
        xhrJson(
          streamUrl(ad, type, vid),
          function (j, failure) {
            if (failure && failure !== 'timeout' && failure !== 'invalid' && attempt < 1)
              return setTimeout(function () {
                ask(attempt + 1);
              }, 1200);
            if (failure) failed.push(ad.name);
            var st = (j && j.streams) || [];
            var out = [];
            for (var k = 0; k < st.length; k++) {
              var item = sourceItem(st[k], ad.name);
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
      ask(0);
    })(list[i], i);
}
