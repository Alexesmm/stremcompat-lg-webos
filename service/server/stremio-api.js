// Bridge for the Stremio account API (old TV browsers fail on its TLS/CORS).

var { APP_VERSION } = require('./config');
var { postJsonUpstream, readJsonBody, sendJson } = require('./http-util');

function postStremioApi(apiPath, req, res) {
  var allowed = {
    '/api/login': true,
    '/api/getUser': true,
    '/api/logout': true,
    '/api/datastoreMeta': true,
    '/api/datastoreGet': true,
    '/api/datastorePut': true,
    '/api/addonCollectionGet': true
  };
  if (!allowed[apiPath]) {
    res.writeHead(403, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end('{"error":"api_path_not_allowed"}');
    return;
  }
  readJsonBody(req, 2097152, function (body) {
    if (!body) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end('{"error":"invalid_json"}');
      return;
    }
    var raw = JSON.stringify(body);
    postJsonUpstream(
      'api.strem.io',
      apiPath,
      {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(raw),
        'User-Agent': 'Stremio-UJ3/' + APP_VERSION,
        'Accept': 'application/json'
      },
      raw,
      function (json) {
        if (!json) {
          res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end('{"error":"stremio_api_unavailable"}');
          return;
        }
        sendJson(res, json);
      }
    );
  });
}

module.exports = {
  postStremioApi: postStremioApi
};
