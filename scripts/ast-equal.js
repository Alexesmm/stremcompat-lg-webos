'use strict';

// Proves that a reformatting or file split did not change program semantics:
// both sources must parse to the same AST once positions and literal spellings
// (quote style, number notation) are ignored. Comments are not part of the AST.
//
// Usage: node scripts/ast-equal.js <before.js> <after.js>

var fs = require('fs');
var acorn = require('acorn');

var IGNORED = { start: true, end: true, loc: true, range: true, raw: true };

function normalize(node) {
  if (Array.isArray(node)) return node.map(normalize);
  if (!node || typeof node !== 'object') return node;
  var out = {};
  Object.keys(node).sort().forEach(function (key) {
    if (!IGNORED[key]) out[key] = normalize(node[key]);
  });
  return out;
}

function parse(source) {
  return normalize(acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true }));
}

function astEqual(before, after) {
  return JSON.stringify(parse(before)) === JSON.stringify(parse(after));
}

module.exports = { astEqual: astEqual };

if (require.main === module) {
  var a = fs.readFileSync(process.argv[2], 'utf8');
  var b = fs.readFileSync(process.argv[3], 'utf8');
  if (!astEqual(a, b)) {
    console.error('AST differs: ' + process.argv[2] + ' vs ' + process.argv[3]);
    process.exit(1);
  }
  console.log('OK: identical AST.');
}
