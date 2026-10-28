// localStorage access that never throws (storage can be unavailable on old webOS).
function lsJson(k) {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null');
  } catch (e) {
    return null;
  }
}
function lsSet(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {}
}
function lsRaw(k, d) {
  try {
    var v = localStorage.getItem(k);
    return v == null ? d : v;
  } catch (e) {
    return d;
  }
}
function lsRawSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch (e) {}
}
function storageKeys() {
  var out = [];
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k != null) out.push(k);
    }
  } catch (e) {}
  return out;
}
