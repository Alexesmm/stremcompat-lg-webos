// Free space where a folder lives, from df: the TVs' Node.js has no call for it.

var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

/* -P keeps each filesystem on one line even when its name is long; a df without -P still answers */
function command(dir) {
  return 'df -kP "' + dir + '" 2>/dev/null || df -k "' + dir + '"';
}

/* sizes in MB, or null when the answer is not a df table */
function parse(out) {
  var row = String(out).trim().split('\n').pop().trim().split(/\s+/);
  if (row.length < 4 || !/^\d+$/.test(row[1]) || !/^\d+$/.test(row[3])) return null;
  return { totalMb: Math.round(row[1] / 1024), freeMb: Math.round(row[3] / 1024) };
}

function diskSpace(dir, cb) {
  childProcess.exec(command(dir), { timeout: 3000 }, function (err, out) {
    cb(err ? null : parse(out));
  });
}

/* The partitions of the USB drives plugged in, each with a folder this app could write in.
   cb([]) when there is none or the TV does not let the app write there. */
function usbFolders(cb) {
  /* where the TV mounts USB storage: /tmp/usb/<disk>/<partition> */
  var root = process.env.SC_USB_ROOT || '/tmp/usb',
    found = [];
  function list(dir) {
    try {
      return fs.readdirSync(dir).map(function (name) {
        return path.join(dir, name);
      });
    } catch (e) {
      return [];
    }
  }
  list(root).forEach(function (disk) {
    list(disk).forEach(function (part) {
      var folder = path.join(part, 'StremCompat');
      try {
        if (!fs.statSync(part).isDirectory()) return;
        fs.mkdirSync(folder, { recursive: true });
        var probe = path.join(folder, '.write-test');
        fs.writeFileSync(probe, 'ok');
        fs.unlinkSync(probe);
        found.push(folder);
      } catch (e) {}
    });
  });
  var left = found.length,
    out = [];
  if (!left) return cb([]);
  found.forEach(function (folder) {
    diskSpace(folder, function (space) {
      if (space) out.push({ folder: folder, freeMb: space.freeMb, totalMb: space.totalMb });
      if (--left) return;
      out.sort(function (a, b) {
        return b.freeMb - a.freeMb;
      });
      cb(out);
    });
  });
}

module.exports = {
  diskSpace: diskSpace,
  parse: parse,
  usbFolders: usbFolders
};
