// Typing the streaming server address with the remote.
/* Letters, digits and what an address needs, ten to a row; below them delete, clear, back
   to the server on this TV, and test and save. The number keys of the remote type too. */
var SERVER_KEYS = '1234567890abcdefghijklmnopqrstuvwxyz.:-/'.split('');
var serverPanel = {
  open: false,
  busy: false,
  text: '',
  idx: 0,
  els: [],
  actions: ['serverDelete', 'serverClear', 'serverUseTv', 'serverSave'],
  done: null,
  show: function (current, done) {
    this.open = true;
    this.busy = false;
    this.text = String(current || '').replace(/^http:\/\//, '');
    this.done = done;
    this.idx = 0;
    this.build();
    $('serverPanel').style.display = 'block';
    this.status(tx('serverHint'));
    this.paint();
  },
  build: function () {
    var host = $('srvKeys'),
      self = this;
    host.innerHTML = '';
    this.els = [];
    $('srvTitle').textContent = tx('serverTitle');
    function add(label, wide) {
      var b = document.createElement('div');
      b.className = 'srvkey' + (wide ? ' srvact' : '');
      b.textContent = label;
      host.appendChild(b);
      self.els.push(b);
    }
    for (var i = 0; i < SERVER_KEYS.length; i++) add(SERVER_KEYS[i], false);
    for (var a = 0; a < this.actions.length; a++) add(tx(this.actions[a]), true);
  },
  status: function (text) {
    $('srvStatus').textContent = text;
  },
  paint: function () {
    /* a long address keeps its end in view, where the typing happens */
    $('srvValue').textContent = this.text.length > 40 ? '…' + this.text.slice(-39) : this.text || ' ';
    setF(this.els, this.idx);
  },
  close: function () {
    this.open = false;
    $('serverPanel').style.display = 'none';
  },
  press: function (i) {
    if (this.busy) return;
    if (i < SERVER_KEYS.length) {
      this.type(SERVER_KEYS[i]);
    } else {
      var action = this.actions[i - SERVER_KEYS.length];
      if (action === 'serverDelete') this.text = this.text.slice(0, -1);
      else if (action === 'serverClear') this.text = '';
      else if (action === 'serverUseTv') this.submit('');
      else if (action === 'serverSave') this.submit(this.text);
    }
    this.paint();
  },
  type: function (ch) {
    if (this.busy || this.text.length >= 120) return;
    this.text += ch;
    this.status(tx('serverHint'));
  },
  submit: function (address) {
    var self = this;
    this.busy = true;
    this.status(tx('serverTesting'));
    postJson(
      '/serverconfig',
      { address: address },
      function (j) {
        self.busy = false;
        if (!self.open) return;
        if (j && j.ok) {
          self.close();
          toast(j.address ? tx('serverSaved') : tx('serverLocal'));
          if (self.done) self.done(j.address);
          return;
        }
        var why = j && j.err;
        self.status(
          tx(why === 'invalid' ? 'serverInvalid' : why === 'disk' ? 'serverDisk' : 'serverUnreachable')
        );
      },
      10000
    );
  },
  /* rows of ten over a row of four wider keys */
  key: function (k) {
    var n = SERVER_KEYS.length,
      i = this.idx;
    if (k >= 48 && k <= 57) {
      this.type(String(k - 48));
    } else if (k === 13) {
      this.press(i);
      return;
    } else if (k === 37) {
      if (i < n ? i % 10 > 0 : i > n) this.idx = i - 1;
    } else if (k === 39) {
      if (i < n ? i % 10 < 9 : i < n + this.actions.length - 1) this.idx = i + 1;
    } else if (k === 38) {
      if (i >= n) this.idx = n - 10 + Math.floor(((i - n) * 10) / this.actions.length);
      else if (i >= 10) this.idx = i - 10;
    } else if (k === 40) {
      if (i < n - 10) this.idx = i + 10;
      else if (i < n) this.idx = n + Math.floor(((i - (n - 10)) * this.actions.length) / 10);
    }
    this.paint();
  }
};
window.__SC_SERVER_PANEL__ = serverPanel;
