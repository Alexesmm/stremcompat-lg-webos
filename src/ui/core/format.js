// HTML escaping, time formatting and the toast notification.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
var toastT = null;
function toast(m, ms) {
  var t = $('toast');
  t.textContent = m;
  t.style.opacity = '1';
  if (toastT) clearTimeout(toastT);
  toastT = setTimeout(function () {
    t.style.opacity = '0';
  }, ms || 2800);
}
