// Catalog discovery from installed addons (Home rows, Discover filters).
/* ================= addon-driven catalogs ================= */
/* the query string of the installed addon whose base is `base` ('' for Cinemeta or none) */
function addonQueryFor(list, base) {
  for (var i = 0; i < (list || []).length; i++)
    if (list[i] && addonBase(list[i]) === base) return addonQuery(list[i]);
  return '';
}
function typeLabel(t) {
  var value = String(t || '');
  if (value === 'movie') return tx('movies');
  if (value === 'series') return tx('series');
  if (value === 'anime') return tx('anime');
  value = value.replace(/[_-]+/g, ' ');
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : tx('other');
}
function discoverCatalogInfo(cat) {
  var ex = (cat && cat.extra) || [],
    blocked = false,
    genreOptions = [],
    genreRequired = false;
  for (var e = 0; e < ex.length; e++) {
    var x = ex[e] || {},
      name = String(x.name || '');
    if (x.isRequired && name !== 'genre') blocked = true;
    if (name === 'genre') {
      genreRequired = !!x.isRequired;
      if (x.options && x.options.length) genreOptions = x.options.slice(0);
    }
  }
  if (cat && cat.extraRequired && cat.extraRequired.length)
    for (var er = 0; er < cat.extraRequired.length; er++)
      if (cat.extraRequired[er] !== 'genre') blocked = true;
  return { blocked: blocked, genreOptions: genreOptions, genreRequired: genreRequired };
}
function discoverTypes() {
  var values = ['movie', 'series'],
    seen = { movie: true, series: true },
    a = remoteAddons();
  for (var i = 0; i < a.length; i++) {
    var man = a[i] && a[i].manifest;
    if (!man || !man.catalogs) continue;
    for (var c = 0; c < man.catalogs.length; c++) {
      var cat = man.catalogs[c],
        type = String((cat && cat.type) || '');
      if (!type || cat.id == null || seen[type] || discoverCatalogInfo(cat).blocked) continue;
      seen[type] = true;
      values.push(type);
    }
  }
  var out = [];
  for (var n = 0; n < values.length; n++) out.push({ value: values[n], label: typeLabel(values[n]) });
  return out;
}
window.__SC_DISCOVER_TYPES__ = discoverTypes;
function stableHash(value) {
  var s = String(value || ''),
    h = 2166136261;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0).toString(36);
}
function catalogCacheKey(addon, cat) {
  var m = (addon && addon.manifest) || {};
  return (
    'v2_' +
    stableHash([m.id || '', addonBase(addon || {}), (cat && cat.type) || '', (cat && cat.id) || ''].join('|'))
  );
}
var CATALOG_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
/* Nuvio Collections of the profile, pinned ones first, in the order Nuvio keeps them */
function orderedCollections() {
  var cols = nuvioCollections(),
    out = [],
    i;
  for (i = 0; i < cols.length; i++) if (cols[i] && cols[i].pinToTop) out.push(cols[i]);
  for (i = 0; i < cols.length; i++) if (cols[i] && !cols[i].pinToTop) out.push(cols[i]);
  return out;
}
/* The rows a Collections folder opens to: one per source that points at an installed addon
   catalog. TMDB and Trakt sources need Nuvio's own feeds and are left out. */
function folderRowDefs(folder) {
  var a = remoteAddons(),
    byId = {},
    out = [],
    i;
  for (i = 0; i < a.length; i++) {
    var man = a[i] && a[i].manifest;
    if (man && man.id && !byId[man.id]) byId[man.id] = a[i];
  }
  var sources = folder.sources && folder.sources.length ? folder.sources : folder.catalogSources || [];
  for (var s = 0; s < sources.length && out.length < (TV_PROFILE.catalogRowsCap || 16); s++) {
    var src = sources[s] || {};
    if (src.provider && src.provider !== 'addon') continue;
    var addon = byId[src.addonId],
      cats = (addon && addon.manifest.catalogs) || [],
      cat = null;
    for (var k = 0; k < cats.length; k++)
      if (cats[k] && cats[k].type === src.type && String(cats[k].id) === String(src.catalogId)) cat = cats[k];
    if (!cat) continue;
    /* Nuvio stores "no genre" as the text None (or null) */
    var genre = src.genre ? String(src.genre).trim() : '';
    if (/^(none|null|undefined)$/i.test(genre)) genre = '';
    out.push({
      title:
        (cat.name ? cat.name : folder.title || '') +
        (genre ? ' · ' + genre : '') +
        ' · ' +
        typeLabel(cat.type),
      type: cat.type,
      url:
        addonBase(addon) +
        '/catalog/' +
        cat.type +
        '/' +
        encodeURIComponent(cat.id) +
        (genre ? '/genre=' + encodeURIComponent(genre) : '') +
        '.json' +
        addonQuery(addon),
      key: catalogCacheKey(addon, cat) + (genre ? '_' + stableHash(genre) : '')
    });
  }
  return out;
}
/* Home rows for the Collections: one row of folder tiles per collection (no requests until a
   folder is opened), only folders that have something to show. */
function collectionTileDefs() {
  var cols = orderedCollections(),
    out = [];
  for (var c = 0; c < cols.length; c++) {
    var tiles = [],
      folders = cols[c].folders || [];
    for (var f = 0; f < folders.length; f++) {
      var folder = folders[f];
      if (!folder || !folderRowDefs(folder).length) continue;
      tiles.push({
        folder: folder,
        id: 'folder:' + (folder.id || cols[c].title + '/' + folder.title),
        type: 'folder',
        name: folder.hideTitle ? '' : folder.title || '',
        background: folder.coverImageUrl || ''
      });
    }
    if (tiles.length) out.push({ title: cols[c].title || '', tiles: tiles });
  }
  return out;
}
function homeCatalogs() {
  var out = [],
    a = remoteAddons(),
    maxRows = TV_PROFILE.catalogRowsCap || 16;
  for (var i = 0; i < a.length; i++) {
    var man = a[i] && a[i].manifest;
    if (!man || !man.catalogs) continue;
    var base = addonBase(a[i]);
    for (var c = 0; c < man.catalogs.length; c++) {
      var cat = man.catalogs[c];
      if (!cat || !cat.type || cat.id == null) continue;
      var req = false,
        ex = cat.extra || [];
      for (var e = 0; e < ex.length; e++) if (ex[e] && ex[e].isRequired) req = true;
      if (cat.extraRequired && cat.extraRequired.length) req = true;
      if (req) continue; /* search/genre-required catalogs are not board rows (og rule) */
      out.push({
        title: (cat.name ? cat.name + ' · ' : '') + typeLabel(cat.type),
        type: cat.type,
        url: base + '/catalog/' + cat.type + '/' + encodeURIComponent(cat.id) + '.json' + addonQuery(a[i]),
        key: catalogCacheKey(a[i], cat)
      });
      if (out.length >= maxRows) return out;
    }
  }
  return out;
}
function discoverCatalogs(type) {
  var out = [],
    seen = {},
    a = remoteAddons();
  for (var i = 0; i < a.length; i++) {
    var man = a[i] && a[i].manifest;
    if (!man || !man.catalogs) continue;
    var base = addonBase(a[i]);
    for (var c = 0; c < man.catalogs.length; c++) {
      var cat = man.catalogs[c];
      if (!cat || cat.type !== type || cat.id == null) continue;
      var info = discoverCatalogInfo(cat);
      if (info.blocked) continue;
      var key = [base, type, cat.id].join('|');
      if (seen[key]) continue;
      seen[key] = true;
      out.push({
        label: cat.name || man.name || String(cat.id),
        type: type,
        id: String(cat.id),
        base: base,
        query: addonQuery(a[i]),
        key: catalogCacheKey(a[i], cat),
        genres: info.genreOptions,
        genreRequired: info.genreRequired
      });
    }
  }
  if (!out.length && (type === 'movie' || type === 'series')) {
    out.push({
      label: tx('popular'),
      type: type,
      id: 'top',
      base: CIN,
      key: 'fallback_top',
      genres: [],
      genreRequired: false
    });
    out.push({
      label: tx('topRated'),
      type: type,
      id: 'imdbRating',
      base: CIN,
      key: 'fallback_rating',
      genres: [],
      genreRequired: false
    });
  }
  return out;
}
function discoverGenres(cat) {
  var out = [],
    values = cat && cat.genres && cat.genres.length ? cat.genres : null;
  if (!cat || !cat.genreRequired) out.push({ value: '', label: tx('allGenres') });
  if (values) {
    for (var i = 0; i < values.length; i++) out.push({ value: String(values[i]), label: String(values[i]) });
  } else if (cat && (cat.genreRequired || cat.base === CIN))
    for (var n = 0; n < DGEN.length; n++) out.push({ value: DGEN[n][0], label: tx(DGEN[n][1]) });
  return out;
}
function getCatalogUrl(url, key, type, cb) {
  var ck = 'beta_cat_' + key,
    cached = lsJson(ck);
  if (
    cached &&
    cached.v === 2 &&
    cached.t &&
    Date.now() - cached.t < CATALOG_CACHE_TTL &&
    cached.items &&
    cached.items.length
  )
    cb(cached.items, true);
  else cached = null;
  xhrJson(url, function (j) {
    var metas = (j && j.metas) || [];
    if (!metas.length) {
      if (!cached) cb([], false);
      return;
    }
    var slim = [];
    for (var i = 0; i < Math.min(metas.length, TV_PROFILE.catalogCap); i++) {
      var m = metas[i];
      slim.push({ id: m.id, type: m.type || type, name: m.name, poster: m.poster, background: m.background });
    }
    var same = cached && cached.items && JSON.stringify(cached.items) === JSON.stringify(slim);
    lsSet(ck, { v: 2, t: Date.now(), items: slim });
    if (!same) cb(slim, false); /* identical to cache -> skip the double row rebuild at boot */
  });
}
