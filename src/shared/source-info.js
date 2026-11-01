// Reading a source from an addon's answer and matching it across episodes; shared by the
// interface (source list) and the player (next episode).
function streamText(s) {
  return String(
    (s.name || '') +
      ' ' +
      (s.title || '') +
      ' ' +
      (s.description || '') +
      ' ' +
      ((s.behaviorHints && s.behaviorHints.filename) || '')
  );
}
function streamQuality(s) {
  var t = streamText(s).toLowerCase();
  if (/\b(2160p?|4k|uhd)\b/.test(t)) return '4K';
  if (/\b(1440p?|2k|qhd)\b/.test(t)) return '1440p';
  if (/\b(1080p?|fhd)\b/.test(t)) return '1080p';
  if (/\b720p?\b/.test(t)) return '720p';
  if (/\b(576p?|540p?|480p?|360p?|sd)\b/.test(t)) return 'SD';
  return 'Other';
}
function streamSeeders(s) {
  var t = streamText(s),
    m;
  m = t.match(/(?:seeders?|seeds?)\s*[:\-]?\s*(\d+)/i);
  if (m) return parseInt(m[1], 10) || 0;
  m = t.match(/(\d+)\s*(?:seeders?|seeds?)/i);
  if (m) return parseInt(m[1], 10) || 0;
  m = t.match(/(?:\uD83D\uDC65|\uD83D\uDC64)\s*(\d+)/);
  if (m) return parseInt(m[1], 10) || 0;
  return -1;
}
/* Filename/title hints are advisory: addons do not expose a reliable codec schema.
   Only AV1 and Dolby Vision without an advertised HDR fallback affect ordering;
   audio and 10-bit hints remain visible without hiding a potentially playable source. */
function streamCompatibility(s) {
  var t = streamText(s).toLowerCase(),
    labels = [],
    rank = 0;
  function add(label) {
    for (var i = 0; i < labels.length; i++) if (labels[i] === label) return;
    labels.push(label);
  }
  if (/\b(av1|av01)\b/.test(t)) {
    add('AV1');
    rank = 3;
  }
  var dv = /(dolby[ ._-]?vision|\bdovi\b|\bdv\b)/.test(t);
  if (dv) {
    add('Dolby Vision');
    if (!/(hdr10\+?|\bhdr\b)/.test(t)) rank = Math.max(rank, 2);
  }
  if (/\b(hevc|h[ ._-]?265|x265)\b/.test(t) && /\b(10[ ._-]?bit|main[ ._-]?10)\b/.test(t)) add('HEVC 10-bit');
  if (/\b(true[ ._-]?hd)\b/.test(t)) add('TrueHD');
  else if (/\b(dts[ ._-]?hd|dts)\b/.test(t)) add('DTS');
  if (/\b(e[ ._-]?ac[ ._-]?3|eac3|ddp|dd\+)\b/.test(t)) add('E-AC-3');
  /* A link or torrent file that is a .rar/.zip/.7z archive cannot play: the TV would have to
     unpack it. Only a real file extension counts ("RARBG" is a release group), and such a
     source is moved to the end and never recommended rather than hidden. */
  var file = (
      String(s.filename || '') +
      ' ' +
      String(s.url || '').replace(/[?#].*$/, '') +
      ' ' +
      t
    ).toLowerCase(),
    archive = file.match(/\.(rar|zip|7z)(?![a-z0-9])/);
  if (archive) {
    add(archive[1].toUpperCase());
    rank = Math.max(rank, 4);
  }
  return { labels: labels, rank: rank };
}
/* ---- audio languages of a source, read once when the addon answers (fetchStreams) ----
   From country flags (addons such as Torrentio list them) and the usual release words.
   Codes are pt-BR, pt, es-419 (Latin American Spanish), es, en, fr, it, de, ja, ko, ru,
   hi, plus 'multi' for multi or dual audio. */
var FLAG_LANG = {
  BR: 'pt-BR',
  PT: 'pt',
  ES: 'es',
  MX: 'es-419',
  AR: 'es-419',
  CO: 'es-419',
  CL: 'es-419',
  PE: 'es-419',
  VE: 'es-419',
  UY: 'es-419',
  US: 'en',
  GB: 'en',
  FR: 'fr',
  IT: 'it',
  DE: 'de',
  JP: 'ja',
  KR: 'ko',
  RU: 'ru',
  IN: 'hi'
};
var WORD_LANG = [
  ['pt-BR', /\b(dublado|pt[ ._-]?br|brazilian)\b/],
  ['pt', /\b(portugu[eê]se?|portugu[eê]s)\b/],
  ['es-419', /\b(latino|latam)\b/],
  ['es', /\b(castellano|spanish|espa[nñ]ol)\b/],
  ['en', /\b(english|eng)\b/],
  ['fr', /\b(french|truefrench|vff|vf2?)\b/],
  ['it', /\b(ita|italian|italiano)\b/],
  ['de', /\b(german|deutsch)\b/],
  ['ja', /\b(japanese|jpn)\b/],
  ['ko', /\b(korean)\b/],
  ['ru', /\b(russian|rus)\b/],
  ['hi', /\b(hindi)\b/],
  ['multi', /\b(multi|dual)\b/]
];
function streamLanguages(s) {
  var t = streamText(s),
    low = t.toLowerCase(),
    out = [],
    flag = /\uD83C([\uDDE6-\uDDFF])\uD83C([\uDDE6-\uDDFF])/g,
    m,
    i;
  function add(code) {
    if (out.indexOf(code) < 0) out.push(code);
  }
  while ((m = flag.exec(t))) {
    var cc = String.fromCharCode(m[1].charCodeAt(0) - 0xdde6 + 65, m[2].charCodeAt(0) - 0xdde6 + 65);
    if (FLAG_LANG[cc]) add(FLAG_LANG[cc]);
  }
  for (i = 0; i < WORD_LANG.length; i++) if (WORD_LANG[i][1].test(low)) add(WORD_LANG[i][0]);
  /* "dublado" or a Brazilian flag says more than a plain "portuguese" */
  if (out.indexOf('pt-BR') >= 0 && out.indexOf('pt') >= 0) out.splice(out.indexOf('pt'), 1);
  if (out.indexOf('es-419') >= 0 && out.indexOf('es') >= 0) out.splice(out.indexOf('es'), 1);
  return out;
}
/* "Multi Subs" releases (anime above all) list their SUBTITLE languages with flags. The
   detected languages stay the same for the filter and the preferred-language order; only
   the tag says they are subtitles. */
function subtitleLanguagesOnly(s) {
  var low = streamText(s).toLowerCase();
  return /\bmulti[ ._-]?subs?\b/.test(low) && !/\b(multi[ ._-]?audio|dual|dublado|dubbed|dub)\b/.test(low);
}
function langBase(code) {
  return String(code).split('-')[0];
}
/* the trackers an addon names go along with the address, for the engine to find peers */
function torrentTrackers(s) {
  var out = [];
  for (var i = 0; s.sources && i < s.sources.length && out.length < 12; i++) {
    var m = /^tracker:(.+)$/.exec(s.sources[i]);
    if (m) out.push('tr=' + encodeURIComponent(m[1]));
  }
  return out.length ? '?' + out.join('&') : '';
}
/* the addon's stream as the interface and the player use it; null when it cannot be played */
function sourceItem(s, addonName) {
  var url = s.url,
    h = s.behaviorHints || {};
  if (!url && s.infoHash) url = 'http://127.0.0.1:11470/' + s.infoHash + '/' + (s.fileIdx || 0) + torrentTrackers(s);
  if (!url) return null;
  var item = {
    addon: addonName,
    name: s.name || '',
    title: s.title || s.description || '',
    url: url,
    quality: streamQuality(s),
    seeders: streamSeeders(s),
    filename: h.filename || '',
    bingeGroup: h.bingeGroup || '',
    notWebReady: !!h.notWebReady,
    headers: (h.proxyHeaders && h.proxyHeaders.request) || null
  };
  item.langs = streamLanguages(s);
  item.subLangsOnly = item.langs.length > 0 && subtitleLanguagesOnly(s);
  var compat = streamCompatibility(item);
  item.compatLabels = compat.labels;
  item.compatRank = compat.rank;
  return item;
}
/* what the local server keeps for a source it is about to play (server/stream-refs.js) */
function streamRefBody(s) {
  return {
    url: s.url,
    addon: s.addon || '',
    name: s.name || '',
    title: s.title || '',
    filename: s.filename || '',
    bingeGroup: s.bingeGroup || '',
    quality: s.quality || '',
    compat: (s.compatLabels || []).join(','),
    notWebReady: !!s.notWebReady,
    headers: s.headers || null
  };
}
function sourceTraits(value) {
  var t = String(value || '').toLowerCase(),
    out = [];
  var tests = [
    ['hevc', /\b(hevc|x265|h[ ._-]?265)\b/],
    ['h264', /\b(x264|h[ ._-]?264|avc)\b/],
    ['dv', /(dolby[ ._-]?vision|\bdovi\b|\bdv\b)/],
    ['hdr10p', /hdr10\+/],
    ['hdr', /\bhdr\b/],
    ['10bit', /\b(10[ ._-]?bit|main[ ._-]?10)\b/],
    ['eac3', /\b(eac3|e[ ._-]?ac[ ._-]?3|ddp|dd\+)\b/],
    ['ac3', /\b(ac3|dolby[ ._-]?digital)\b/],
    ['aac', /\baac\b/],
    ['dts', /\bdts\b/],
    ['atmos', /\batmos\b/],
    ['webdl', /web[ ._-]?dl/],
    ['bluray', /blu[ ._-]?ray|bdrip/]
  ];
  for (var i = 0; i < tests.length; i++) if (tests[i][1].test(t)) out.push(tests[i][0]);
  return out;
}
/* How well a source keeps the audio language being watched; -1000 rules it out. A release
   with a named language must not become another one, and an unnamed one may be the original
   audio, so changing a dub for it is left to the viewer. Older saved preferences have no
   language and are not judged. */
function nextLanguageFit(wanted, s) {
  if (!wanted) return 0;
  var have = s.subLangsOnly ? [] : s.langs || [],
    named = [],
    score = 0,
    i;
  for (i = 0; i < wanted.length; i++) if (wanted[i] !== 'multi') named.push(wanted[i]);
  if (!named.length) {
    if (wanted.length) return have.indexOf('multi') >= 0 ? 40 : 0;
    /* nothing named in the episode being watched: prefer sources that name nothing either */
    return have.length ? -15 : 0;
  }
  for (i = 0; i < named.length; i++) {
    if (have.indexOf(named[i]) >= 0) score += 40;
    else
      for (var h = 0; h < have.length; h++)
        if (langBase(have[h]) === langBase(named[i])) {
          score += 25;
          break;
        }
  }
  if (score) return score;
  return have.indexOf('multi') >= 0 ? 5 : -1000;
}
/* The source to carry on with: the addon's own marker for "same release" (bingeGroup, as the
   official apps use it) settles it; without one, the same addon and quality, then the closest
   release. Null when nothing fits, so the viewer chooses from the list. */
function matchingNextSource(items, pref) {
  if (!pref || !pref.addon) return null;
  var wanted = sourceTraits((pref.text || '') + ' ' + (pref.compat || '')),
    best = null,
    bestScore = -9999,
    i,
    s;
  if (pref.binge)
    for (i = 0; i < items.length; i++)
      if (!items[i].stored && items[i].addon === pref.addon && items[i].bingeGroup === pref.binge)
        return items[i];
  if (!pref.quality) return null;
  for (i = 0; i < items.length; i++) {
    s = items[i];
    /* an archive cannot play (streamCompatibility) */
    if (s.stored || s.addon !== pref.addon || s.quality !== pref.quality || s.compatRank >= 4) continue;
    var fit = nextLanguageFit(pref.langs, s);
    if (fit <= -1000) continue;
    var traits = sourceTraits(streamText(s) + ' ' + (s.compatLabels || []).join(' ')),
      score = fit;
    for (var w = 0; w < wanted.length; w++) if (traits.indexOf(wanted[w]) >= 0) score += 12;
    score -= (s.compatRank || 0) * 20;
    if (s.seeders > 0) score += Math.min(15, Math.floor(Math.log(s.seeders + 1) / Math.LN2));
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}
