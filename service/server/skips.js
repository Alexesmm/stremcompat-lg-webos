// Where an episode's opening, recap and end credits are, from community databases: IntroDB for
// IMDb episodes, AniSkip for Kitsu anime (through Kitsu's link to MyAnimeList). Answers an empty
// list when nothing is known or the databases cannot be reached.

var { fetchJson, sendJson } = require('./http-util');

var CACHE_SIZE = 200;
var known = {};
var knownOrder = [];

function remember(key, segments) {
  if (!known[key]) knownOrder.push(key);
  known[key] = segments;
  while (knownOrder.length > CACHE_SIZE) delete known[knownOrder.shift()];
}

function segment(kind, start, end) {
  start = Number(start);
  end = Number(end);
  return start >= 0 && end > start ? { kind: kind, start: start, end: end } : null;
}

/* {intro: {start_sec, end_sec}, recap: ..., outro: ...} */
function fromIntroDb(answer) {
  var out = [];
  ['intro', 'recap', 'outro'].forEach(function (kind) {
    var part = answer && answer[kind],
      found = part && segment(kind, part.start_sec, part.end_sec);
    if (found) out.push(found);
  });
  return out;
}

var ANISKIP_KINDS = { op: 'intro', 'mixed-op': 'intro', recap: 'recap', ed: 'outro', 'mixed-ed': 'outro' };

/* {results: [{skipType: 'op', interval: {startTime, endTime}}]} */
function fromAniSkip(answer) {
  var out = [];
  ((answer && answer.results) || []).forEach(function (result) {
    var kind = ANISKIP_KINDS[result.skipType],
      found = kind && result.interval && segment(kind, result.interval.startTime, result.interval.endTime);
    if (found) out.push(found);
  });
  return out;
}

function fromImdb(id, season, episode, cb) {
  fetchJson(
    'https://api.introdb.app/segments?imdb_id=' + id + '&season=' + season + '&episode=' + episode,
    function (answer) {
      cb(answer ? fromIntroDb(answer) : null);
    }
  );
}

function fromKitsu(id, episode, cb) {
  fetchJson(
    'https://kitsu.io/api/edge/anime/' + id + '/mappings?filter%5BexternalSite%5D=myanimelist/anime',
    function (mapping) {
      if (!mapping) return cb(null);
      var first = mapping.data && mapping.data[0],
        mal = first && first.attributes && first.attributes.externalId;
      if (!mal) return cb([]);
      var types = ['op', 'mixed-op', 'recap', 'ed', 'mixed-ed']
        .map(function (type) {
          return 'types%5B%5D=' + type;
        })
        .join('&');
      fetchJson(
        'https://api.aniskip.com/v2/skip-times/' +
          encodeURIComponent(mal) +
          '/' +
          episode +
          '?' +
          types +
          '&episodeLength=0',
        function (answer) {
          cb(answer ? fromAniSkip(answer) : null);
        }
      );
    }
  );
}

/* /skips?vid=tt0903747:3:5 or kitsu:12:1 */
function skipTimes(q, res) {
  var vid = String(q.vid || ''),
    imdb = vid.match(/^(tt\d+):(\d+):(\d+)$/),
    kitsu = vid.match(/^kitsu:(\d+):(\d+)$/);
  if (known[vid]) return sendJson(res, { segments: known[vid] });
  /* a database that did not answer is asked again next time */
  function answer(segments) {
    if (segments) remember(vid, segments);
    sendJson(res, { segments: segments || [] });
  }
  if (imdb) return fromImdb(imdb[1], +imdb[2], +imdb[3], answer);
  if (kitsu) return fromKitsu(+kitsu[1], +kitsu[2], answer);
  answer([]);
}

module.exports = {
  skipTimes: skipTimes,
  fromIntroDb: fromIntroDb,
  fromAniSkip: fromAniSkip
};
