// Skip the opening and the recap, as on the big streaming apps: a button at the bottom right while
// one is playing, and OK jumps past it. The times come from community databases (server/skips.js)
// and from chapters named like an opening or a recap. Where the end credits begin, the
// next-episode card shows up (up-next.js).
var skipSegments = [],
  skipShown = null,
  skipAsked = false,
  skipEl = document.getElementById('skip');
var SKIP_CHAPTERS = [
  [/^(intro|opening|op|abertura|ouverture|vorspann|apertura|sigla)\b/i, 'intro'],
  [/^(recap|previously|résumé|resumo|anteriormente|rückblick|riassunto)\b/i, 'recap'],
  [/^(credits|end credits|ending|ed|créditos|crédits|abspann|titoli di coda)\b/i, 'outro']
];
function addSkipSegments(list) {
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    if (s && s.end > s.start && !skipOfKind(s.kind)) skipSegments.push(s);
  }
}
function skipOfKind(kind) {
  for (var i = 0; i < skipSegments.length; i++) if (skipSegments[i].kind === kind) return skipSegments[i];
  return null;
}
/* asked once the video plays: the episode's times from the local server */
function askSkips() {
  if (skipAsked || !/^(tt\d+|kitsu:\d+):\d+:?\d*$/.test(VID)) return;
  skipAsked = true;
  xhr('/skips?vid=' + encodeURIComponent(VID), function (j) {
    addSkipSegments((j && j.segments) || []);
  });
}
v.addEventListener('playing', askSkips);
/* the file's own chapters, once the probe has read them (options.js) */
function chapterSkips() {
  var list = (mediaInfo && mediaInfo.chapters) || [],
    found = [];
  for (var i = 0; i < list.length; i++) {
    var name = String(list[i].name || '').trim(),
      end = i + 1 < list.length ? list[i + 1].t : v.duration;
    for (var k = 0; k < SKIP_CHAPTERS.length; k++)
      if (SKIP_CHAPTERS[k][0].test(name) && end > list[i].t)
        found.push({ kind: SKIP_CHAPTERS[k][1], start: list[i].t, end: end });
  }
  addSkipSegments(found);
}
/* where the end credits begin, when known */
function creditsStart() {
  var outro = skipOfKind('outro');
  return outro ? outro.start : 0;
}
function activeSkip(t) {
  for (var i = 0; i < skipSegments.length; i++) {
    var s = skipSegments[i];
    if (s.kind !== 'outro' && t >= s.start && t < s.end - 1) return s;
  }
  return null;
}
function checkSkip() {
  var s = activeSkip(v.currentTime);
  if (s === skipShown) return;
  skipShown = s;
  skipEl.textContent = s ? (s.kind === 'recap' ? P.skipRecap : P.skipIntro) : '';
  skipEl.className = s ? 'show' : '';
}
v.addEventListener('timeupdate', checkSkip);
/* OK while the button shows: past the opening or the recap; false when there is none */
function skipNow() {
  if (!skipShown) return false;
  try {
    v.currentTime = skipShown.end;
  } catch (e) {}
  skipShown = null;
  skipEl.className = '';
  return true;
}
skipEl.addEventListener('click', skipNow);
