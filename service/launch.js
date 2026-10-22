/*
 * Bootstrap deliberately limited to ES5 because webOS 4.x runs JavaScript
 * services with Node.js 0.12.2. The actual Stremio server runs in the bundled
 * ARMv7 Node 18 runtime, isolated from the TV's old system Node.
 */
process.env.NODE_PATH = (process.env.NODE_PATH || '') + ':/usr/lib/node_modules:/usr/lib/nodejs';
require('module').Module._initPaths();

var Service = require('webos-service');
var path = require('path');
var net = require('net');
var fs = require('fs');
var spawn = require('child_process').spawn;

var DIR = __dirname;
var LOADER = '/lib/ld-linux.so.3';
var NODE = path.join(DIR, 'bin', 'node18');
var LIB = path.join(DIR, 'bin', 'lib');
var SUPERVISOR = path.join(DIR, 'tvserver.js');
var APP_PORT = 8082;
var APP_VERSION = '1.2.2';
var service = new Service('io.strem.tv.server');
var spawned = false;

function log(message) {
    try {
        fs.appendFileSync(path.join(DIR, 'launch.log'), new Date().toISOString() + ' ' + message + '\n');
    } catch (ignore) {}
}

function isUp(callback) {
    var socket = net.connect(APP_PORT, '127.0.0.1');
    var settled = false;
    var response = '';
    function finish(value) {
        if (settled) return;
        settled = true;
        try { socket.destroy(); } catch (ignore) {}
        callback(value);
    }
    socket.on('connect', function () {
        socket.write('GET /health HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n');
    });
    socket.on('data', function (chunk) {
        response += chunk.toString();
        if (response.indexOf('"version":"' + APP_VERSION + '"') >= 0) finish(true);
        if (response.length > 8192) finish(false);
    });
    socket.on('end', function () { finish(response.indexOf('"version":"' + APP_VERSION + '"') >= 0); });
    socket.on('error', function () { finish(false); });
    setTimeout(function () { finish(false); }, 1000);
}

function startRuntime() {
    var env;
    var child;
    var key;
    if (spawned) return;
    spawned = true;
    env = {};
    for (key in process.env) {
        if (Object.prototype.hasOwnProperty.call(process.env, key)) env[key] = process.env[key];
    }
    env.HOME = env.HOME || '/home/root';
    env.USER = env.USER || 'root';
    env.FFMPEG_BIN = path.join(DIR, 'bin', 'ffmpeg');
    env.FFPROBE_BIN = path.join(DIR, 'bin', 'ffprobe');

    log('Starting bundled ARMv7 Node runtime');
    try {
        child = spawn(LOADER, ['--library-path', LIB, NODE, SUPERVISOR], {
            cwd: DIR,
            env: env,
            detached: true,
            stdio: 'ignore'
        });
    } catch (error) {
        spawned = false;
        log('Spawn failed: ' + error.message);
        return;
    }
    child.on('error', function (error) {
        spawned = false;
        log('Runtime error: ' + error.message);
    });
    child.on('exit', function (code, signal) {
        spawned = false;
        log('Runtime exit code=' + code + ' signal=' + signal);
    });
    log('Runtime pid=' + child.pid);
    child.unref();
}

function waitUntilReady(callback, attempts) {
    attempts = attempts || 0;
    isUp(function (up) {
        if (up) return callback(true);
        if (attempts >= 120) return callback(false);
        if (!spawned) startRuntime();
        setTimeout(function () { waitUntilReady(callback, attempts + 1); }, 500);
    });
}

service.activityManager.create('keepAlive', function () {});
service.register('start', function (message) {
    isUp(function (up) {
        if (!up) startRuntime();
        waitUntilReady(function (ready) {
            message.respond({
                returnValue: ready,
                ready: ready,
                version: APP_VERSION,
                runtime: 'bundled-node18-armv7',
                target: 'LG 50UM7500PSB / webOS 4.x'
            });
        });
    });
});

log('Legacy bootstrap loaded on system Node ' + process.version);
