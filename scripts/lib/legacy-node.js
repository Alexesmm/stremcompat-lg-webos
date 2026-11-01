'use strict';

// Prepares the local server for the Node.js the television itself runs: 0.12 on webOS 3 and 4,
// 4.4 on Tizen 3 and 4. The sources stay readable with two conveniences, destructuring requires
// and shorthand properties, which are written out here. What is left must parse as ES5, and the
// few library functions those versions lack come from service/compat.js.

var acorn = require('acorn');

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  Object.keys(node).forEach(function (key) {
    var value = node[key];
    if (Array.isArray(value)) value.forEach(function (item) { walk(item, visit); });
    else if (value && typeof value === 'object') walk(value, visit);
  });
}

function parse(source, ecmaVersion) {
  return acorn.parse(source, { ecmaVersion: ecmaVersion, sourceType: 'script', allowReturnOutsideFunction: true, allowHashBang: true });
}

function applyEdits(source, edits) {
  edits.sort(function (a, b) { return b.start - a.start; }).forEach(function (edit) {
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  });
  return source;
}

/* var { A, B: C } = x;  ->  var _m1 = x, A = _m1.A, C = _m1.B;
   { a, b: 1 }           ->  { a: a, b: 1 } */
function rewrite(source, file) {
  var edits = [], count = 0;
  walk(parse(source, 2022), function (node) {
    if (node.type === 'VariableDeclaration') {
      var pattern = node.declarations.filter(function (d) { return d.id.type === 'ObjectPattern'; });
      if (!pattern.length) return;
      if (node.declarations.length !== 1) throw new Error(file + ': destructuring next to other declarations');
      var decl = node.declarations[0], name = '_m' + (++count);
      var names = decl.id.properties.map(function (prop) {
        if (prop.type !== 'Property' || prop.computed || prop.key.type !== 'Identifier' || prop.value.type !== 'Identifier')
          throw new Error(file + ': destructuring that cannot be rewritten');
        return prop.value.name + ' = ' + name + '.' + prop.key.name;
      });
      edits.push({ start: node.start, end: node.end, text: 'var ' + name + ' = ' + source.slice(decl.init.start, decl.init.end) + ', ' + names.join(', ') + ';' });
      return;
    }
    if (node.type === 'ObjectExpression') {
      node.properties.forEach(function (prop) {
        if (prop.type === 'Property' && prop.shorthand) edits.push({ start: prop.start, end: prop.end, text: prop.key.name + ': ' + prop.key.name });
      });
    }
  });
  return applyEdits(source, edits);
}

/* calls on strings, arrays and objects that Node 0.12 does not have, and service/compat.js does not add */
var MISSING = /\.(startsWith|endsWith|includes|repeat|find|findIndex|padStart|padEnd|trimStart|trimEnd|flat|flatMap|finally|copyFileSync|rmSync|mkdtempSync)\(|Object\.(values|entries|fromEntries)\(|Array\.(from|of)\(|Number\.(isInteger|parseInt|parseFloat)\(|Math\.(trunc|sign|log2)\(|new (URL|URLSearchParams)\(|'latin1'/;

/* Throws when a file needs something the television's Node does not have. */
function assertRunsOnOldNode(source, file) {
  try {
    parse(source, 5);
  } catch (error) {
    throw new Error(file + ': not ES5 after the rewrite, ' + error.message);
  }
  var code = source.replace(/\/\*[\s\S]*?\*\/|(^|[^:'"])\/\/.*$/gm, '$1');
  var found = code.match(MISSING);
  if (found) throw new Error(file + ': ' + found[0] + ' is missing from Node 0.12');
  return source;
}

function prepare(source, file) {
  return assertRunsOnOldNode(rewrite(source, file), file);
}

module.exports = { assertRunsOnOldNode: assertRunsOnOldNode, prepare: prepare, rewrite: rewrite, walk: walk };
