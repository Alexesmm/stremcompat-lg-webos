// In-app numeric keypad for jumping to an episode.
/* Chromium 38/53 can silently ignore the native browser prompt inside packaged TV apps.
   Keep episode entry inside the application so arrows, OK, number keys and the
   Magic Remote all use the same predictable path. */
var episodeJump = {
  open: false,
  value: '',
  idx: 0,
  replaceOnDigit: true,
  els: [],
  keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'delete', '0', 'go'],
  show: function (initial) {
    this.open = true;
    this.value = String(Math.max(1, parseInt(initial, 10) || 1));
    this.replaceOnDigit = true;
    this.idx = 0;
    this.build();
    $('episodeJump').style.display = 'block';
    this.paint();
  },
  build: function () {
    var host = $('ejKeys');
    host.innerHTML = '';
    this.els = [];
    $('ejTitle').textContent = tx('episodeNumberPrompt');
    $('ejHint').textContent = tx('jumpHint');
    for (var i = 0; i < this.keys.length; i++) {
      var b = document.createElement('div');
      b.className = 'ejkey';
      b.textContent =
        this.keys[i] === 'delete' ? tx('jumpDelete') : this.keys[i] === 'go' ? tx('jumpGo') : this.keys[i];
      host.appendChild(b);
      this.els.push(b);
    }
  },
  paint: function () {
    $('ejValue').textContent = this.value || '0';
    setF(this.els, this.idx);
  },
  close: function () {
    this.open = false;
    $('episodeJump').style.display = 'none';
  },
  press: function (i) {
    var k = this.keys[i];
    if (k === 'delete') {
      this.replaceOnDigit = false;
      this.value = this.value.slice(0, -1);
    } else if (k === 'go') {
      var n = parseInt(this.value, 10);
      if (n > 0 && detail.goToEpisodeNumber(n)) this.close();
      else if (!(n > 0)) toast(tx('episodeNotFound'));
    } else if (this.value.length < 5 || this.replaceOnDigit) {
      this.value = this.replaceOnDigit ? k : (this.value === '0' ? '' : this.value) + k;
      this.replaceOnDigit = false;
    }
    this.paint();
  },
  key: function (k) {
    var row = Math.floor(this.idx / 3),
      col = this.idx % 3;
    if (k >= 48 && k <= 57) {
      this.press(k === 48 ? 10 : k - 49);
      return;
    }
    if (k >= 96 && k <= 105) {
      this.press(k === 96 ? 10 : k - 97);
      return;
    }
    if (k === 37) col = Math.max(0, col - 1);
    else if (k === 39) col = Math.min(2, col + 1);
    else if (k === 38) row = Math.max(0, row - 1);
    else if (k === 40) row = Math.min(3, row + 1);
    else if (k === 13) {
      this.press(this.idx);
      return;
    }
    this.idx = row * 3 + col;
    this.paint();
  }
};
window.__STREMIO_EPISODE_JUMP__ = episodeJump;
