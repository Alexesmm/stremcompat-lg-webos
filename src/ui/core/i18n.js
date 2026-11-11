// Applying the interface language to the static markup and switching it.
function applyTextSize() {
  if (lsRaw('uiTextSize', 'normal') === 'large') bodyAdd('bigtext');
  else bodyRemove('bigtext');
}
/* drawn before the icon set (artwork.js) is loaded */
var GLOBE_ICON =
  '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm6.9 6h-2.9a15.7 15.7 0 00-1.4-3.6A8 8 0 0118.9 8zM12 4c.8 1.2 1.5 2.5 1.9 4h-3.8c.4-1.5 1.1-2.8 1.9-4zM4.3 14a8.2 8.2 0 010-4h3.4a16.5 16.5 0 000 4H4.3zm.8 2h2.9c.3 1.3.8 2.5 1.4 3.6A8 8 0 015.1 16zM8 8H5.1a8 8 0 014.3-3.6C8.8 5.5 8.4 6.7 8 8zm4 12c-.8-1.2-1.5-2.5-1.9-4h3.8c-.4 1.5-1.1 2.8-1.9 4zm2.3-6H9.7a14.7 14.7 0 010-4h4.6a14.7 14.7 0 010 4zm.3 5.6c.6-1.1 1.1-2.3 1.4-3.6h2.9a8 8 0 01-4.3 3.6zm1.7-5.6a16.5 16.5 0 000-4h3.4a8.2 8.2 0 010 4h-3.4z"/></svg>';
function uiLanguageLabel(code) {
  return UI_LANGUAGES[code];
}
function applyStaticLanguage() {
  var navPairs = {
    chipSearch: 'navSearch',
    chipHome: 'navHome',
    chipDisc: 'navDiscover',
    chipLib: 'navLibrary',
    chipAddons: 'navAddons',
    chipSet: 'navSettings',
    chipExit: 'exitLeave'
  };
  for (var nid in navPairs)
    if (Object.prototype.hasOwnProperty.call(navPairs, nid) && $(nid)) {
      var labels = $(nid).getElementsByClassName('navlabel');
      if (labels.length) labels[0].textContent = tx(navPairs[nid]);
    }
  var pairs = {
    sHint: 'searchHint',
    setHint: 'settingsHint',
    setTitle: 'navSettings',
    discTitle: 'discoverTitle',
    lgAccount: 'accountNote',
    lgNote: 'unofficialNote',
    lgSync: 'syncSiteNote',
    lgQrTitle: 'phoneSignIn',
    lgQrHelp: 'scanCode',
    lgEmailTitle: 'emailSignIn',
    lgBtn: 'signIn',
    streamsTitle: 'sources',
    aTitle: 'addonsGroup',
    aHelp: 'addonsHelp',
    aSync: 'syncShort'
  };
  for (var id in pairs)
    if (Object.prototype.hasOwnProperty.call(pairs, id) && $(id)) $(id).textContent = tx(pairs[id]);
  if ($('sBox')) $('sBox').setAttribute('placeholder', tx('searchPlaceholder'));
  if ($('lgEmail')) $('lgEmail').setAttribute('placeholder', tx('email'));
  if ($('lgPass')) $('lgPass').setAttribute('placeholder', tx('password'));
  if ($('lgLang')) $('lgLang').innerHTML = GLOBE_ICON + '<span>' + esc(uiLanguageLabel(UI_LANG)) + '</span>';
}
function setUILanguage(value) {
  var next = normalizeUILanguage(value);
  loadUILanguage(next);
  UI_LANG = next;
  lsRawSet(UI_LANG_KEY, next);
  applyStaticLanguage();
  try {
    invalidateBoards();
  } catch (e) {}
  return next;
}
window.__SC_UI_LANGUAGE__ = function () {
  return UI_LANG;
};
window.__SC_SET_UI_LANGUAGE__ = setUILanguage;
applyStaticLanguage();
if ($('lgStat')) $('lgStat').textContent = tx('generatingCode');
