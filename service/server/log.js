// Append-only diagnostic log (tvserver.log).

var fs = require('fs');
var { LOG_FILE } = require('./config');

function dbg(m) {
  try {
    fs.appendFileSync(LOG_FILE, new Date().toISOString() + ' ' + m + '\n');
  } catch (e) {}
}

module.exports = {
  dbg: dbg
};
