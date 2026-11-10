// The first start of 4.0: how the app is used (simple or complete) and how it looks (modern or
// light). Both stay in Settings; skipping keeps everything as it was.
/* the look this TV had before anyone chose: light on the TVs the profile already treats as small */
var PROFILE_LOW_MEMORY = !!TV_PROFILE.lowMemory;
function uiLook() {
  return lsRaw('uiLook', PROFILE_LOW_MEMORY ? 'light' : 'modern');
}
function simpleMode() {
  return lsRaw('uiMode', 'full') === 'simple';
}
/* Light: no animations or effects, and the smaller caches of the small-TV profile */
function applyLook() {
  var light = uiLook() === 'light';
  TV_PROFILE.lowMemory = light || PROFILE_LOW_MEMORY;
  if (light) bodyAdd('lowmem');
  else if (!PROFILE_LOW_MEMORY) bodyRemove('lowmem');
  if (light) bodyAdd('lite');
  else bodyRemove('lite');
}
var setupPanel = {
  open: false,
  step: 0,
  idx: 0,
  els: [],
  /* once, after the first start of this version with an account; Back or Skip keep the defaults */
  maybeShow: function () {
    if (lsRaw('setupDone', '') || !user()) return;
    this.open = true;
    this.step = 0;
    $('setupPanel').style.display = 'block';
    this.build();
  },
  questions: function () {
    return [
      {
        key: 'uiMode',
        title: tx('setupUseQuestion'),
        options: [
          ['simple', tx('modeSimple'), tx('modeSimpleHint')],
          ['full', tx('modeFull'), tx('modeFullHint')]
        ],
        current: simpleMode() ? 'simple' : 'full'
      },
      {
        key: 'uiLook',
        title: tx('setupLookQuestion'),
        options: [
          ['modern', tx('lookModern'), tx('lookModernHint')],
          ['light', tx('lookLight'), tx('lookLightHint')]
        ],
        current: uiLook()
      }
    ];
  },
  build: function () {
    var q = this.questions()[this.step],
      host = $('suOptions');
    $('suTitle').textContent = q.title;
    $('suHint').textContent = tx('setupHint');
    host.innerHTML = '';
    this.els = [];
    this.idx = 0;
    for (var i = 0; i < q.options.length; i++) {
      var b = document.createElement('div'),
        name = document.createElement('div'),
        hint = document.createElement('div');
      b.className = 'suopt';
      name.className = 'suname';
      name.textContent = q.options[i][1];
      hint.className = 'suhelp';
      hint.textContent = q.options[i][2];
      b.appendChild(name);
      b.appendChild(hint);
      host.appendChild(b);
      this.els.push(b);
      if (q.options[i][0] === q.current) this.idx = i;
    }
    var skip = document.createElement('div');
    skip.className = 'suopt suskip';
    skip.textContent = tx('setupSkip');
    host.appendChild(skip);
    this.els.push(skip);
    setF(this.els, this.idx);
  },
  /* an option of this question, or Skip, which closes with what is set now */
  choose: function (i) {
    var q = this.questions()[this.step];
    if (i >= q.options.length) return this.close();
    lsRawSet(q.key, q.options[i][0]);
    if (q.key === 'uiLook') applyLook();
    this.step++;
    if (this.step >= this.questions().length) return this.close();
    this.build();
  },
  close: function () {
    this.open = false;
    lsRawSet('setupDone', '1');
    $('setupPanel').style.display = 'none';
  },
  key: function (k) {
    if (k === 38) this.idx = Math.max(0, this.idx - 1);
    else if (k === 40) this.idx = Math.min(this.els.length - 1, this.idx + 1);
    else if (k === 13) return this.choose(this.idx);
    setF(this.els, this.idx);
  }
};
