'use strict';

var fs = require('fs');
var path = require('path');
var acorn = require('acorn');
var root = process.argv[2];
var target = process.argv[3] || 'chrome53';
var ecmaVersion = target === 'chrome38' ? 5 : 2016;
var failed = false;

function validate(name, source) {
    try {
        var ast = acorn.parse(source, {
            ecmaVersion: ecmaVersion,
            allowHashBang: true,
            locations: true,
            sourceType: 'script'
        });
        if (target === 'chrome38') validateLegacyFunctionPlacement(name, ast);
    } catch (error) {
        failed = true;
        console.error(name + ': incompativel com ' + target + ': ' + error.message);
    }
}

function validateLegacyFunctionPlacement(name, ast) {
    function walk(node, parent, grandparent) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'FunctionDeclaration') {
            var directProgram = parent && parent.type === 'Program';
            var directFunction = parent && parent.type === 'BlockStatement' && grandparent &&
                (grandparent.type === 'FunctionDeclaration' || grandparent.type === 'FunctionExpression');
            if (!directProgram && !directFunction) throw new Error('block-level function declaration at line ' + node.loc.start.line + ' is rejected by strict Chromium 38');
        }
        Object.keys(node).forEach(function (key) {
            if (key === 'loc' || key === 'start' || key === 'end') return;
            var value = node[key];
            if (Array.isArray(value)) value.forEach(function (child) { if (child && child.type) walk(child, node, parent); });
            else if (value && value.type) walk(value, node, parent);
        });
    }
    walk(ast, null, null);
}

['beta.html', path.join('..', 'app', 'index.html')].forEach(function (relative) {
    var file = path.resolve(root, relative);
    var html = fs.readFileSync(file, 'utf8');
    var match;
    var index = 0;
    var scripts = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
    while ((match = scripts.exec(html))) {
        index += 1;
        validate(path.basename(file) + ' script ' + index, match[1]);
    }
    if (!index) {
        failed = true;
        console.error(file + ': nenhum script inline encontrado.');
    }
});

validate('beta-app.js', fs.readFileSync(path.resolve(root, 'beta-app.js'), 'utf8'));
// The player client runs inside the IIFE that tvserver.js wraps around it.
validate('player/player-client.js', '(function(){var URL;' + fs.readFileSync(path.resolve(root, 'player', 'player-client.js'), 'utf8') + '\n})();');

if (failed) process.exit(1);
console.log('OK: shell validado no nivel de sintaxe do ' + target + '.');
