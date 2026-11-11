// The featured titles at the top of Home, as on the big streaming apps: Home opens on them, a
// large hero with the title, its genres, the synopsis, a "See details" button and dots saying
// which one is shown. They are the first titles of Home's first catalog; one passes every 8 s
// while the remote is left alone, Left and Right change it, OK opens it, Down goes to the rows.
// Nothing new is drawn: the hero and the background are the ones the rows already use, and the
// rows only slide down. Off in the light look; on the TVs the profile treats as small the
// titles change only by hand.
var FEATURED_EVERY_MS = 8000,
  FEATURED_MAX = 8,
  featured = { items: null, gen: -1, at: 0, shownAt: 0 };
function featuredItems() {
  if (featured.gen === home._loadGen && featured.items) return featured.items;
  /* the first catalog that has titles, in Home's order: Continue watching and My list are not
     featured, and a catalog still loading is waited for until Home is filled (board-loaders.js) */
  var found = [];
  for (var r = 0; r < home.rows.length && !found.length; r++) {
    var row = home.rows[r];
    if (!row.catalog || row.wide) continue;
    if (!row.answered) {
      if (!homeFilled) break;
      continue;
    }
    var titles = row.items.filter(function (it) {
      return it.id && !it.more;
    });
    if (titles.length > 2) found = titles.slice(0, FEATURED_MAX);
  }
  /* kept once found, so the titles do not change under the viewer when more rows arrive */
  if (found.length) {
    featured.items = found;
    featured.gen = home._loadGen;
    if (featured.at >= found.length) featured.at = 0;
  }
  return found;
}
/* whether the focus is on the featured titles: Home's top, outside the light look, with titles */
function featuredShown() {
  return home.top && SCR === 'home' && uiLook() !== 'light' && featuredItems().length > 2;
}
function featuredItem() {
  return featuredItems()[featured.at] || null;
}
function paintFeatured() {
  var on = featuredShown();
  if (on) bodyAdd('featured');
  else bodyRemove('featured');
  var host = $('heroDots');
  host.innerHTML = '';
  if (!on) return;
  $('heroBtn').textContent = tx('seeDetails');
  var items = featuredItems();
  for (var i = 0; i < items.length; i++) {
    var dot = document.createElement('span');
    if (i === featured.at) dot.className = 'on';
    host.appendChild(dot);
  }
}
/* the hero shows the featured title, and the one after it is fetched meanwhile */
function showFeatured() {
  featured.shownAt = Date.now();
  paintFeatured();
  home.heroApply(featuredItem());
  var items = featuredItems(),
    next = items[(featured.at + 1) % items.length];
  if (next) {
    prewarm(bgMid(next));
    if (isImdb(next.id)) prewarm('https://images.metahub.space/logo/medium/' + next.id + '/img');
  }
}
function moveFeatured(dir) {
  var n = featuredItems().length;
  featured.at = (featured.at + dir + n) % n;
  showFeatured();
}
/* keys while the focus is on the featured titles */
function featuredKey(k) {
  if (k === 39) moveFeatured(1);
  else if (k === 37) {
    if (featured.at === 0) topNav.focus();
    else moveFeatured(-1);
  } else if (k === 40) {
    home.top = false;
    home.paint();
    home.hero();
  } else if (k === 13) {
    var it = featuredItem();
    if (it) openItem(it);
  }
  return true;
}
setInterval(function () {
  if (
    !featuredShown() ||
    topNav.active ||
    bgv ||
    TV_PROFILE.lowMemory ||
    streamsUI.open ||
    cwMenu.open ||
    Date.now() - Math.max(lastIn, featured.shownAt) < FEATURED_EVERY_MS
  )
    return;
  moveFeatured(1);
}, 1000);
on($('heroBtn'), 'click', function () {
  if (featuredShown()) featuredKey(13);
});
