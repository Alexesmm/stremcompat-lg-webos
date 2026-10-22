'use strict';

var fs = require('fs');
var acorn = require('acorn');
var files = process.argv.slice(2);

files.forEach(function (file) {
    var source = fs.readFileSync(file, 'utf8');
    try {
        acorn.parse(source, { ecmaVersion: 5, allowHashBang: true });
    } catch (error) {
        console.error(file + ': sintaxe incompativel com ES5: ' + error.message);
        process.exitCode = 1;
    }
});

if (!process.exitCode) console.log('OK: servico compativel com sintaxe ES5/Node.js 0.12.');
