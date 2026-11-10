// "Who is watching?": the profiles of a Nuvio account, shown after signing in and from Settings.
// It uses the same panel as the first-start questions (setup.js).
var profilePanel = {
  open: false,
  idx: 0,
  els: [],
  list: [],
  account: '',
  done: null,
  cancel: null,
  /* done() runs once a profile is in use; cancel(), when given, lets Back close without choosing */
  show: function (key, done, cancel) {
    var self = this;
    this.account = key;
    this.done = done;
    this.cancel = cancel || null;
    xhrJson(
      '/nuvioprofiles?key=' + encodeURIComponent(key),
      function (j) {
        var list = (j && j.profiles) || [];
        if (!list.length) {
          toast(tx('profilesUnavailable'));
          if (!cancel) done();
          return;
        }
        if (list.length === 1 && !list[0].locked && !cancel) return self.use(list[0]);
        self.list = list;
        self.build();
      },
      20000
    );
  },
  build: function () {
    var rows = [];
    this.idx = 0;
    for (var i = 0; i < this.list.length; i++) {
      var p = this.list[i];
      rows.push({
        name: p.name || tx('profileNumber', p.index),
        help: p.locked ? tx('profileLocked') : '',
        cls: p.locked ? 'locked' : ''
      });
      if (p.current) this.idx = i;
    }
    this.els = drawChoices(tx('whoIsWatching'), rows);
    this.open = true;
    setF(this.els, this.idx);
  },
  choose: function (i) {
    var p = this.list[i];
    if (!p) return;
    if (p.locked) return toast(tx('profileLocked'));
    this.use(p);
  },
  /* the server switches the session to it; the account's user id names the profile's library */
  use: function (p) {
    var self = this;
    xhrJson(
      '/nuvioprofile?key=' + encodeURIComponent(this.account) + '&index=' + p.index,
      function (j) {
        if (!j || !j.ok) return toast(tx('profilesUnavailable'));
        postJson(API + '/api/getUser', { authKey: self.account }, function (u) {
          if (u && u.result) lsSet('user', u.result);
          lsRawSet('addons', '');
          self.close();
          self.done();
        });
      },
      20000
    );
  },
  close: function () {
    this.open = false;
    $('setupPanel').style.display = 'none';
  },
  back: function () {
    if (!this.cancel) return;
    this.close();
    this.cancel();
  },
  key: function (k) {
    if (k === 38) this.idx = Math.max(0, this.idx - 1);
    else if (k === 40) this.idx = Math.min(this.els.length - 1, this.idx + 1);
    else if (k === 13) return this.choose(this.idx);
    setF(this.els, this.idx);
  }
};
