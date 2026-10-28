// Paused vignette: title and technical badges.
// ---- paused vignette: title + tech badges (ffprobe via /probe, stream-name text as instant fallback) ----
var pv = document.getElementById('pv');
// title = the cover-art LOGO image when we have one (Netflix-style), else clean text; no S/E up here
(function () {
  var pt = document.getElementById('pvTitle');
  if (LOGO) setArt(pt, LOGO);
  else pt.textContent = TITLE;
})();
function fillBadges(j) {
  var host = document.getElementById('pvBadges');
  host.innerHTML = '';
  function ab(t, cls) {
    if (!t) return;
    var d = document.createElement('div');
    d.className = 'bdg' + (cls ? ' ' + cls : '');
    d.textContent = t;
    host.appendChild(d);
  }
  if (CERT) ab(CERT, 'cert');
  var sn = SNAME.toLowerCase();
  var rs =
    (j && j.res) ||
    (sn.indexOf('2160') >= 0 || sn.indexOf('4k') >= 0
      ? '4K'
      : sn.indexOf('1080') >= 0
        ? '1080p'
        : sn.indexOf('720') >= 0
          ? '720p'
          : '');
  ab(rs);
  var hd = (j && j.hdr) || '';
  if (!hd) {
    if (/dolby.?vision|\bdv\b|dovi/.test(sn)) hd = 'Dolby Vision';
    else if (sn.indexOf('hdr10+') >= 0) hd = 'HDR10+';
    else if (sn.indexOf('hdr') >= 0) hd = 'HDR';
  }
  ab(hd);
  var au = '';
  if (sn.indexOf('atmos') >= 0) au = 'Dolby Atmos';
  if (!au && j && j.audio) au = j.audio;
  if (!au) {
    if (/ddp|dd\+|eac3|e-ac-3/.test(sn)) au = 'Dolby Digital+';
    else if (/\bac3\b|dolby.?digital/.test(sn)) au = 'Dolby Digital';
    else if (sn.indexOf('dts') >= 0) au = 'DTS';
  }
  ab(au);
  if (j && j.vcodec) ab(j.vcodec);
  if (j && j.size) ab(j.size);
}
fillBadges(null);
var techProbed = false;
function ensureTechProbe() {
  if (techProbed) return;
  techProbed = true;
  xhr('/probe?u=' + encodeURIComponent(URL), function (j) {
    if (j) fillBadges(j);
  });
}
var pvT = null;
v.addEventListener('pause', function () {
  ensureTechProbe();
  if (pvT) clearTimeout(pvT);
  pvT = setTimeout(function () {
    if (v.paused && mode !== 'menu' && load.style.display === 'none') pv.className = 'show';
  }, 350);
});
v.addEventListener('play', function () {
  if (pvT) clearTimeout(pvT);
  pv.className = '';
});
