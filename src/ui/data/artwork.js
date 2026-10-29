// Poster, backdrop and icon URLs.
function isImdb(id) {
  return String(id || '').indexOf('tt') === 0;
}
function posterOf(it) {
  if (it.poster) return it.poster;
  return isImdb(it.id) ? 'https://images.metahub.space/poster/small/' + it.id + '/img' : '';
}
var ICON = {
  exit: '<svg viewBox="0 0 24 24"><path d="M10 17l1.4-1.4L8.8 13H20v-2H8.8l2.6-2.6L10 7l-5 5zM4 3h8v2H4v14h8v2H4a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  info: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
  similar: '<svg viewBox="0 0 24 24"><path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"/></svg>',
  trailer:
    '<svg viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M9 16.17l-3.88-3.88L3.7 13.7 9 19 21 7l-1.41-1.42z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>',
  close:
    '<svg viewBox="0 0 24 24"><path d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>'
};
function bgOf(it) {
  if (it.background) return it.background;
  if (isImdb(it.id)) return 'https://images.metahub.space/background/medium/' + it.id + '/img';
  return it.poster || '';
}
function bgSmall(it) {
  var u = String(bgOf(it) || '');
  return u.replace(/(images\.metahub\.space\/background\/)[a-z]+\//, '$1small/');
}
function bgMid(it) {
  var u = String(bgOf(it) || '');
  if (!u) return u;
  return (
    '/bgz?u=' + encodeURIComponent(u.replace(/(images\.metahub\.space\/background\/)[a-z]+\//, '$1medium/'))
  );
}
