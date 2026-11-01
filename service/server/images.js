// /bgz: a title's background art at the width this TV can hold. A full 1920x1080 image takes
// about 8 MB once decoded; at 960 pixels it takes 2. The results are kept for the titles seen last.

var crypto = require('crypto');
var spawn = require('child_process').spawn;
var { FFMPEG, PROFILE } = require('./config');
var { localProxy } = require('./proxy');
var { NICE, lowerPriority } = require('./priority');

var RESIZE_TIMEOUT_MS = 9000;

var finished = {};
var finishedOrder = [];
var running = 0;

function sendImage(res, data) {
  res.writeHead(200, {
    'Content-Type': 'image/jpeg',
    'Cache-Control': 'max-age=86400',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(data);
}

/* no art for now: the interface shows the smaller image from the artwork server, and asks again */
function sendNothing(res) {
  res.writeHead(204);
  res.end();
}

function remember(key, data) {
  if (!finished[key]) finishedOrder.push(key);
  finished[key] = data;
  while (finishedOrder.length > PROFILE.backdropCache) delete finished[finishedOrder.shift()];
}

function resizeArguments(address) {
  var quality = PROFILE.lowMemory ? '5' : '4';
  return [
    '-nostdin',
    '-i',
    localProxy(address),
    '-frames:v',
    '1',
    '-vf',
    'scale=' + PROFILE.backdropWidth + ':-2',
    '-q:v',
    quality,
    '-f',
    'mjpeg',
    'pipe:1'
  ];
}

function bgResize(q, res) {
  var address = q.u || '';
  if (!address) {
    res.writeHead(404);
    return res.end();
  }
  var key = crypto.createHash('sha1').update(address).digest('hex').slice(0, 16);
  if (finished[key]) return sendImage(res, finished[key]);
  if (running >= PROFILE.backdropWorkers) return sendNothing(res);

  var parts = [];
  var ended = false;
  var worker;
  function end(data) {
    if (ended) return;
    ended = true;
    running--;
    clearTimeout(timer);
    if (!data) return sendNothing(res);
    remember(key, data);
    sendImage(res, data);
  }
  running++;
  var timer = setTimeout(function () {
    try {
      worker.kill('SIGKILL');
    } catch (e) {}
    end(null);
  }, RESIZE_TIMEOUT_MS);
  try {
    worker = spawn(FFMPEG, resizeArguments(address));
    lowerPriority(worker, NICE.INTERACTIVE);
  } catch (e) {
    return end(null);
  }
  worker.stdout.on('data', function (chunk) {
    parts.push(chunk);
  });
  worker.on('error', function () {
    end(null);
  });
  worker.on('close', function (code) {
    var data = Buffer.concat(parts);
    end(code === 0 && data.length ? data : null);
  });
}

module.exports = {
  bgResize: bgResize
};
