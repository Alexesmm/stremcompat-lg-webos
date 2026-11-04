// Free space where a folder lives, from df: the TVs' Node.js has no call for it.

var childProcess = require('child_process');

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

module.exports = {
  diskSpace: diskSpace,
  parse: parse
};
