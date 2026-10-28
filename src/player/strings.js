// Player strings from the shared table, and the season/episode line.
/* The player strings in the current language, completed from English. */
function playerText() {
  var base = UI_TEXT['en-US'].player,
    cur = (UI_TEXT[UI_LANG] && UI_TEXT[UI_LANG].player) || {},
    out = {};
  for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = cur[k] || base[k];
  return out;
}
var P = playerText();
var SE =
  SEASON && EPISODE
    ? tx('season', SEASON) + ' · ' + tx('episode', EPISODE) + (EPTITLE ? '  ·  ' + EPTITLE : '')
    : '';
