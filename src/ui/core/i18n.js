// Applying the interface language to the static markup and switching it.
function applyTextSize() {
  if (lsRaw('uiTextSize', 'normal') === 'large') bodyAdd('bigtext');
  else bodyRemove('bigtext');
}
function uiLanguageLabel(code) {
  return code === 'pt-BR' ? tx('portugueseBrazil') : tx('english');
}
function applyStaticLanguage() {
  var navPairs = {
    chipSearch: 'navSearch',
    chipHome: 'navHome',
    chipDisc: 'navDiscover',
    chipLib: 'navLibrary',
    chipAddons: 'navAddons',
    chipSet: 'navSettings'
  };
  for (var nid in navPairs)
    if (Object.prototype.hasOwnProperty.call(navPairs, nid) && $(nid)) {
      var labels = $(nid).getElementsByClassName('navlabel');
      if (labels.length) labels[0].textContent = tx(navPairs[nid]);
    }
  var pairs = {
    sHint: 'searchHint',
    setHint: 'settingsHint',
    discTitle: 'discoverTitle',
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
  if ($('lgLang')) $('lgLang').textContent = tx('languagePicker', uiLanguageLabel(UI_LANG));
}
function setUILanguage(value) {
  var next = normalizeUILanguage(value);
  UI_LANG = next;
  lsRawSet(UI_LANG_KEY, next);
  applyStaticLanguage();
  try {
    invalidateBoards();
  } catch (e) {}
  return next;
}
window.__STREMIO_UI_LANGUAGE__ = function () {
  return UI_LANG;
};
window.__STREMIO_SET_UI_LANGUAGE__ = setUILanguage;
applyStaticLanguage();
if ($('lgStat')) $('lgStat').textContent = tx('generatingCode');
