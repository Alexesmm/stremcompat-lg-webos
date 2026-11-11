// Featured titles pass through the Home hero while the remote is left alone, as on the big
// streaming apps: the titles of the first catalog row, one every 8 s, with dots saying which.
// Only the hero's picture and text change, so the rows stay where they are; any key brings back
// the title under the focus (idleTouch). Off in the light look and on the TVs the profile
// treats as small, where the extra pictures would cost too much.
var SPOTLIGHT_EVERY_MS = 8000,
  SPOTLIGHT_MAX = 8,
  spotlight = { items: null, at: 0, timer: null };
function spotlightItems() {
  for (var r = 0; r < home.rows.length; r++) {
    var row = home.rows[r];
    if (row.wide || !row.items) continue;
    var titles = row.items.filter(function (it) {
      return it.id && !it.more;
    });
    if (titles.length > 2) return titles.slice(0, SPOTLIGHT_MAX);
  }
  return [];
}
function paintSpotlightDots() {
  var host = $('heroDots');
  host.innerHTML = '';
  for (var i = 0; spotlight.items && i < spotlight.items.length; i++) {
    var dot = document.createElement('span');
    if (i === spotlight.at) dot.className = 'on';
    host.appendChild(dot);
  }
}
function nextSpotlight() {
  if (!spotlight.items || curBoard() !== home) return stopSpotlight();
  spotlight.at = (spotlight.at + 1) % spotlight.items.length;
  home.heroApply(spotlight.items[spotlight.at]);
  paintSpotlightDots();
}
function startSpotlight() {
  if (
    spotlight.items ||
    SCR !== 'home' ||
    topNav.active ||
    bgv ||
    uiLook() === 'light' ||
    TV_PROFILE.lowMemory
  )
    return;
  var items = spotlightItems();
  if (items.length < 3) return;
  spotlight.items = items;
  spotlight.at = -1;
  bodyAdd('spotlight');
  nextSpotlight();
  spotlight.timer = setInterval(nextSpotlight, SPOTLIGHT_EVERY_MS);
}
function stopSpotlight() {
  if (!spotlight.items) return;
  clearInterval(spotlight.timer);
  spotlight.items = null;
  bodyRemove('spotlight');
  $('heroDots').innerHTML = '';
  if (curBoard() === home) home.heroApply();
}
