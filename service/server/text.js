// Sanitizing text and embedding values in inline scripts.

function safeText(v, max) {
  return String(v == null ? '' : v)
    .replace(/[\r\n\0]/g, ' ')
    .slice(0, max);
}

function safeScriptJson(v) {
  return JSON.stringify(v == null ? '' : v)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

module.exports = {
  safeScriptJson: safeScriptJson,
  safeText: safeText
};
