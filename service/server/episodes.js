// Next-episode resolution for the player page.

function number(value) {
  var n = parseInt(value, 10);
  return isNaN(n) ? 0 : n;
}

function releasedAt(v) {
  var t = Date.parse((v && (v.released || v.firstAired)) || '');
  return isNaN(t) ? 0 : t;
}

/* The video after `vid` in season and episode order, crossing into the next season.
   Specials only lead to specials. Returns '' at the end of the series, when the next
   episode has not aired yet or when `vid` is not in the list. Without a list (the
   metadata request failed) it falls back to the next number in the same season. */
function nextEpisodeId(videos, vid, now) {
  var parts = String(vid || '').split(':');
  if (parts.length < 3) return '';
  if (!videos || !videos.length) {
    return parts.slice(0, -1).join(':') + ':' + (number(parts[parts.length - 1]) + 1);
  }
  var current = null;
  for (var i = 0; i < videos.length; i++) if (videos[i] && videos[i].id === vid) current = videos[i];
  if (!current) return '';
  var special = number(current.season) === 0;
  var list = videos
    .map(function (v, index) {
      return { v: v, index: index };
    })
    .filter(function (item) {
      return item.v && item.v.id && (number(item.v.season) === 0) === special;
    });
  list.sort(function (a, b) {
    return (
      number(a.v.season) - number(b.v.season) ||
      number(a.v.episode != null ? a.v.episode : a.v.number) -
        number(b.v.episode != null ? b.v.episode : b.v.number) ||
      releasedAt(a.v) - releasedAt(b.v) ||
      a.index - b.index
    );
  });
  for (var j = 0; j < list.length; j++) {
    if (list[j].v.id !== vid) continue;
    var next = list[j + 1] && list[j + 1].v;
    if (!next) return '';
    var at = releasedAt(next);
    return at && at > (now || Date.now()) ? '' : next.id;
  }
  return '';
}

module.exports = {
  nextEpisodeId: nextEpisodeId
};
