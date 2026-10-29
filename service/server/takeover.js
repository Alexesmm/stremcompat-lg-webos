// Taking the app port over from a local server of another StremCompat version.

var fs = require('fs');
var http = require('http');
var path = require('path');
var { APP_VERSION, DIR, PORT, SERVICE_ID } = require('./config');
var { dbg } = require('./log');

/* The local server runs detached from the webOS service, so removing or updating the app
   does not stop it: until the TV is unplugged, the previous version keeps the port and the
   launcher waits forever for its own version (RUNTIME_START_TIMEOUT). A new server first
   asks the old one to quit (servers from 1.3.3 on answer TAKEOVER_HEADER); an older server
   is found through /proc and stopped. */
var TAKEOVER_HEADER = 'x-stremcompat-takeover';

/* the version answering on the app port, or '' when nothing answers */
function runningVersion(cb) {
  var done = false;
  function finish(v) {
    if (done) return;
    done = true;
    cb(v);
  }
  var req = http.get({ host: '127.0.0.1', port: PORT, path: '/health', timeout: 2000 }, function (res) {
    var body = '';
    res.on('data', function (d) {
      body += d;
    });
    res.on('end', function () {
      try {
        finish(String(JSON.parse(body).version || '?'));
      } catch (e) {
        finish('?');
      }
    });
  });
  req.on('timeout', function () {
    req.destroy();
    finish('?');
  });
  req.on('error', function () {
    finish('');
  });
}

function askToQuit(cb) {
  var req = http.request(
    {
      host: '127.0.0.1',
      port: PORT,
      path: '/takeover',
      method: 'POST',
      headers: { [TAKEOVER_HEADER]: APP_VERSION }
    },
    function (res) {
      res.resume();
      cb(res.statusCode === 200);
    }
  );
  req.setTimeout(2000, function () {
    req.destroy();
  });
  req.on('error', function () {
    cb(false);
  });
  req.end();
}

/* pid of the StremCompat server listening on PORT, found by matching the socket inode of
   /proc/net/tcp in /proc/<pid>/fd; 0 when unknown. Only a process whose command line runs
   tvserver.js is returned, so nothing else is ever stopped. */
function pidOnPort() {
  var hexPort = ('0000' + PORT.toString(16).toUpperCase()).slice(-4),
    inodes = {};
  ['/proc/net/tcp', '/proc/net/tcp6'].forEach(function (file) {
    try {
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .slice(1)
        .forEach(function (line) {
          var cols = line.trim().split(/\s+/);
          if (cols.length > 9 && cols[1].slice(-5) === ':' + hexPort && cols[3] === '0A')
            inodes['socket:[' + cols[9] + ']'] = true;
        });
    } catch (e) {}
  });
  if (!Object.keys(inodes).length) return 0;
  var pids = [];
  try {
    pids = fs.readdirSync('/proc').filter(function (name) {
      return /^\d+$/.test(name) && Number(name) !== process.pid;
    });
  } catch (e) {
    return 0;
  }
  for (var i = 0; i < pids.length; i++) {
    var fds = [];
    try {
      if (fs.readFileSync('/proc/' + pids[i] + '/cmdline', 'utf8').indexOf('tvserver.js') < 0) continue;
      fds = fs.readdirSync('/proc/' + pids[i] + '/fd');
    } catch (e) {
      continue;
    }
    for (var j = 0; j < fds.length; j++) {
      try {
        if (inodes[fs.readlinkSync('/proc/' + pids[i] + '/fd/' + fds[j])]) return Number(pids[i]);
      } catch (e) {}
    }
  }
  return 0;
}

function stopOld(cb) {
  askToQuit(function (asked) {
    if (asked) {
      dbg('takeover: previous server agreed to quit');
      return setTimeout(cb, 800);
    }
    var pid = pidOnPort();
    if (!pid) {
      dbg('takeover: could not find the process on :' + PORT);
      return cb();
    }
    dbg('takeover: stopping previous server pid=' + pid);
    try {
      process.kill(pid, 'SIGTERM');
    } catch (e) {}
    setTimeout(function () {
      try {
        process.kill(pid, 'SIGKILL');
      } catch (e) {}
      setTimeout(cb, 300);
    }, 1200);
  });
}

/* Listen on the app port. When it is taken: by this same version, this copy is not needed
   and exits; by another version (or a server that does not answer), that one is stopped and
   the port retried, a few times before giving up so the service restarts us. */
function listenTakingOver(server, onListening) {
  var attempts = 0;
  function tryListen() {
    server.once('error', onError);
    server.listen(PORT, '127.0.0.1', function () {
      server.removeListener('error', onError);
      onListening();
    });
  }
  function onError(e) {
    if (!e || e.code !== 'EADDRINUSE' || attempts >= 6) {
      dbg('listen failed: ' + ((e && e.code) || e) + ' after ' + attempts + ' attempts');
      process.exit(1);
    }
    attempts++;
    runningVersion(function (version) {
      if (version === APP_VERSION) {
        dbg('takeover: version ' + version + ' already serving :' + PORT + ', exiting');
        process.exit(0);
      }
      dbg('takeover: :' + PORT + ' held by version "' + version + '", replacing it with ' + APP_VERSION);
      stopOld(function () {
        setTimeout(tryListen, 300);
      });
    });
  }
  tryListen();
}

/* POST /takeover from a newer (or any other) version: answer, then quit so it can listen.
   The custom header cannot be sent by a web page without a CORS preflight, which this
   server never allows, so only another local server can stop this one. */
function handleTakeover(req, res) {
  var from = String(req.headers[TAKEOVER_HEADER] || '');
  if (req.method !== 'POST' || !from || from === APP_VERSION) {
    res.writeHead(403);
    res.end();
    return;
  }
  dbg('takeover: version ' + from + ' asked this ' + APP_VERSION + ' server to quit');
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('bye', function () {
    setTimeout(function () {
      process.exit(0);
    }, 100);
  });
}

/* The other half: this server leaves by itself once it has been replaced, which needs no
   permission at all (the jail may hide it from the new version, so it cannot be stopped
   from outside). Every few seconds it checks two signs:
   - the installed profile.json no longer names this version, or is gone (updated/removed);
   - the claim file in the app's home folder, which every starting version writes and
     which is shared by all runs of the app, names another version.
   Two checks in a row are needed, so a file caught half written does not count. */
var CHECK_MS = 3000;
function claimFile() {
  var home = process.env.HOME || '';
  return home ? path.join(home, '.stremcompat-' + SERVICE_ID + '.version') : '';
}
function claimPort() {
  var file = claimFile();
  /* only an installed package (with profile.json) claims, never a source checkout */
  if (!file || !fs.existsSync(path.join(DIR, 'profile.json'))) return;
  try {
    fs.writeFileSync(file, APP_VERSION);
  } catch (e) {
    dbg('claim not written: ' + ((e && e.code) || e));
  }
}
function replacedBy() {
  var installed = path.join(DIR, 'profile.json');
  try {
    var v = JSON.parse(fs.readFileSync(installed, 'utf8')).version;
    if (v && v !== APP_VERSION) return 'installed ' + v;
  } catch (e) {
    if (e && e.code === 'ENOENT') return 'app removed';
  }
  var file = claimFile();
  if (file) {
    try {
      var claimed = fs.readFileSync(file, 'utf8').trim();
      if (claimed && claimed !== APP_VERSION) return 'claimed by ' + claimed;
    } catch (e) {}
  }
  return '';
}
function leaveWhenReplaced() {
  /* a source checkout has no profile.json: nothing is installed to watch */
  if (!fs.existsSync(path.join(DIR, 'profile.json'))) return;
  var seen = 0;
  setInterval(function () {
    var why = replacedBy();
    if (!why) {
      seen = 0;
      return;
    }
    if (++seen < 2) return;
    dbg('replaced (' + why + '), version ' + APP_VERSION + ' exiting');
    process.exit(0);
  }, CHECK_MS).unref();
}

module.exports = {
  claimPort: claimPort,
  handleTakeover: handleTakeover,
  leaveWhenReplaced: leaveWhenReplaced,
  listenTakingOver: listenTakingOver,
  pidOnPort: pidOnPort
};
