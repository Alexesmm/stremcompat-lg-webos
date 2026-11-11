'use strict';

// Writes the Homebrew Channel repository of this app, for GitHub Pages: the list the channel reads,
// the manifest it and the app's update check read, the icon and the package. Anyone can add its address
// in the channel's settings; it needs nobody's approval.
//
// Usage: node scripts/make-homebrew-repo.js <the .ipk> <output folder> [address it will be served from]

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var ipk = process.argv[2];
var out = process.argv[3];
var base = (process.argv[4] || 'https://alexesmm.github.io/stremcompat-lg-webos').replace(/\/$/, '');
if (!ipk || !out) throw new Error('Usage: node make-homebrew-repo.js <the .ipk> <output folder> [address]');

var appInfo = JSON.parse(fs.readFileSync(path.join(root, 'app', 'appinfo.json'), 'utf8'));
var id = appInfo.id;
var version = appInfo.version;
var fileName = id + '_' + version + '_all.ipk';
var data = fs.readFileSync(ipk);
var summary = 'Your Stremio or Nuvio account and addons on older LG TVs (webOS 3 and newer). Unofficial, and it needs no root.';

var manifest = {
  id: id,
  version: version,
  type: 'web',
  title: appInfo.title,
  appDescription: summary,
  iconUri: base + '/icon.png',
  sourceUrl: 'https://github.com/Alexesmm/stremcompat-lg-webos',
  rootRequired: false,
  ipkUrl: base + '/' + fileName,
  ipkHash: { sha256: crypto.createHash('sha256').update(data).digest('hex') }
};
var listing = {
  paging: { page: 1, count: 1, maxPage: 1, itemsTotal: 1 },
  packages: [
    {
      id: id,
      title: appInfo.title,
      iconUri: manifest.iconUri,
      pool: 'main',
      manifestUrl: base + '/api/apps/' + id + '/manifest.json',
      shortDescription: summary,
      fullDescriptionUrl: 'api/apps/' + id + '/full_description.html',
      manifest: manifest
    }
  ]
};

function write(relative, content) {
  var file = path.join(out, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

write(fileName, data);
write('icon.png', fs.readFileSync(path.join(root, 'app', 'icon.png')));
write('apps.json', JSON.stringify(listing, null, 2) + '\n');
write('api/apps.json', JSON.stringify(listing, null, 2) + '\n');
write('api/apps/' + id + '/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
write(
  'api/apps/' + id + '/full_description.html',
  '<p>' +
    summary +
    '</p><p><a href="' +
    manifest.sourceUrl +
    '">Source, compatibility list and notes</a></p>\n'
);
write(
  'index.html',
  '<!doctype html><meta charset="utf-8"><title>StremCompat repository</title><p>Homebrew Channel repository of <a href="' +
    manifest.sourceUrl +
    '">StremCompat</a>. Add this address in the channel\'s settings:</p><pre>' +
    base +
    '/apps.json</pre>\n'
);
console.log('Homebrew repository of ' + id + ' ' + version + ' written to ' + out);
