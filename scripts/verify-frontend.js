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
        acorn.parse(source, {
            ecmaVersion: ecmaVersion,
            allowHashBang: true,
            sourceType: 'script'
        });
    } catch (error) {
        failed = true;
        console.error(name + ': incompativel com ' + target + ': ' + error.message);
    }
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

if (failed) process.exit(1);
console.log('OK: shell validado no nivel de sintaxe do ' + target + '.');
