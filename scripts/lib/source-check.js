'use strict';

// Source assertions must survive reformatting: compare code with all whitespace
// removed and double quotes folded into single quotes.
function squash(text) {
  return String(text).replace(/\s+/g, '').replace(/"/g, "'");
}

function sourceHas(source, snippet) {
  return squash(source).indexOf(squash(snippet)) >= 0;
}

module.exports = { squash: squash, sourceHas: sourceHas };
