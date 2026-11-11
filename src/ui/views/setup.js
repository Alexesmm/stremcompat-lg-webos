// The first start of 4.0: how the app is used (simple or complete) and how it looks (standard or
// light). Both stay in Settings; skipping keeps everything as it was.
/* the look this TV had before anyone chose: light on the TVs the profile already treats as small.
   The modern look of the 4.0 tests is gone: a TV that chose it has the standard one. */
var PROFILE_LOW_MEMORY = !!TV_PROFILE.lowMemory;
function uiLook() {
  return lsRaw('uiLook', '') === 'light' || (!lsRaw('uiLook', '') && PROFILE_LOW_MEMORY)
    ? 'light'
    : 'standard';
}
function simpleMode() {
  return lsRaw('uiMode', 'full') === 'simple';
}
/* Light: no animations or effects, smaller backgrounds and the small-TV caches. */
function applyLook() {
  var light = uiLook() === 'light';
  TV_PROFILE.lowMemory = light || PROFILE_LOW_MEMORY;
  if (light) bodyAdd('lowmem');
  else if (!PROFILE_LOW_MEMORY) bodyRemove('lowmem');
  if (light) bodyAdd('lite');
  else bodyRemove('lite');
}
/* Draws the panel shared by the first-start questions and the interface languages: a title, rows of { name, help, cls } and a hint. Returns the rows' elements. */
function drawChoices(title, rows, hint) {
  var host = $('suOptions'),
    els = [];
  $('setupPanel').style.display = 'block';
  $('suTitle').textContent = title;
  $('suHint').textContent = hint || '';
  host.innerHTML = '';
  for (var i = 0; i < rows.length; i++) {
    var b = document.createElement('div'),
      name = document.createElement('div');
    b.className = 'suopt' + (rows[i].cls ? ' ' + rows[i].cls : '');
    name.className = 'suname';
    name.textContent = rows[i].name;
    b.appendChild(name);
    if (rows[i].help) {
      var help = document.createElement('div');
      help.className = 'suhelp';
      help.textContent = rows[i].help;
      b.appendChild(help);
    }
    host.appendChild(b);
    els.push(b);
  }
  return els;
}
var languagePanel = {
  open: false,
  idx: 0,
  els: [],
  codes: [],
  done: null,
  show: function (done) {
    var rows = [];
    this.codes = Object.keys(UI_LANGUAGES);
    this.done = done;
    this.idx = Math.max(0, this.codes.indexOf(UI_LANG));
    for (var i = 0; i < this.codes.length; i++) rows.push({ name: UI_LANGUAGES[this.codes[i]] });
    this.els = drawChoices(tx('interfaceLanguage'), rows);
    this.open = true;
    setF(this.els, this.idx);
  },
  choose: function (i) {
    setUILanguage(this.codes[i]);
    this.close();
    if (this.done) this.done();
  },
  close: function () {
    this.open = false;
    $('setupPanel').style.display = 'none';
  },
  key: function (k) {
    if (k === 38) this.idx = Math.max(0, this.idx - 1);
    else if (k === 40) this.idx = Math.min(this.els.length - 1, this.idx + 1);
    else if (k === 13) return this.choose(this.idx);
    setF(this.els, this.idx);
  }
};
var setupPanel = {
  open: false,
  step: 0,
  idx: 0,
  els: [],
  /* once, after the first start of this version with an account; Back or Skip keep the defaults */
  maybeShow: function () {
    if (lsRaw('setupDone', '') || !user() || profilePanel.open) return;
    this.open = true;
    this.step = 0;
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
          ['standard', tx('lookStandard'), tx('lookStandardHint')],
          ['light', tx('lookLight'), tx('lookLightHint')]
        ],
        current: uiLook()
      }
    ];
  },
  build: function () {
    var q = this.questions()[this.step],
      rows = [];
    this.idx = 0;
    for (var i = 0; i < q.options.length; i++) {
      rows.push({ name: q.options[i][1], help: q.options[i][2] });
      if (q.options[i][0] === q.current) this.idx = i;
    }
    rows.push({ name: tx('setupSkip'), cls: 'suskip' });
    this.els = drawChoices(q.title, rows, tx('setupHint'));
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
