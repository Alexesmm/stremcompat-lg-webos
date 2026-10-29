// Login screen: QR pairing and email sign-in.
/* ================= LOGIN (standalone: QR + email) ================= */
var login = {
  zone: 'email',
  poll: null,
  started: false,
  polling: false,
  suspended: false,
  qrCode: '',
  pollGen: 0,
  statusKey: 'generatingCode',
  enter: function () {
    var self = this,
      email = $('lgEmail'),
      pass = $('lgPass'),
      lang = $('lgLang');
    if (lang && !lang._wired) {
      lang._wired = true;
      on(
        lang,
        'click',
        function () {
          self.toggleLanguage();
        },
        false
      );
    }
    if (email && !email._wired) {
      email._wired = true;
      var wire = function (el, next) {
        if (!el) return;
        on(
          el,
          'keydown',
          function (e) {
            if (e.keyCode === 13 || e.keyCode === 40) {
              e.preventDefault();
              e.stopPropagation();
              el.blur();
              self.zone = next;
              self.paint();
            } else if (e.keyCode === 461 || e.keyCode === 27) {
              e.preventDefault();
              e.stopPropagation();
              el.blur();
              self.paint();
            }
          },
          true
        );
      };
      wire(email, 'pass');
      wire(pass, 'btn');
    }
    this.paint();
    this.setStatus(this.statusKey);
    this.startQr();
  },
  setStatus: function (key) {
    this.statusKey = key;
    var el = $('lgStat');
    if (el) {
      el.textContent = tx(key);
      el.className =
        key === 'generatingCode' ||
        key === 'waitingPhone' ||
        key === 'signingIn' ||
        key === 'accountConnected'
          ? 'loading'
          : '';
    }
  },
  toggleLanguage: function () {
    setUILanguage(UI_LANG === 'en-US' ? 'pt-BR' : 'en-US');
    this.setStatus(this.statusKey);
    this.paint();
  },
  startQr: function () {
    if (this.qrCode) {
      this.schedulePoll(this.pollGen);
      return;
    }
    if (this.started) return;
    this.started = true;
    this.suspended = false;
    var self = this,
      gen = ++this.pollGen;
    xhrJson('https://link.stremio.com/api/create', function (j) {
      if (self.pollGen !== gen) return;
      if (!j || !j.code) {
        self.started = false;
        self.setStatus('qrUnavailable');
        self.explainNoConnection(gen);
        return;
      }
      self.qrCode = j.code;
      $('lgQrImg').src = j.qrcode;
      $('lgCode').textContent = j.code;
      self.setStatus('waitingPhone');
      self.schedulePoll(gen);
    });
  },
  /* the QR code or sign-in got no answer: when Stremio is unreachable, say so and how to fix it */
  explainNoConnection: function (gen) {
    var self = this;
    checkConnection(function (code) {
      if (!code || gen !== self.pollGen || SCR !== 'login') return;
      self.setStatus('noConnectionShort');
      $('lgErr').textContent = tx('noConnection', code);
    });
  },
  schedulePoll: function (gen) {
    var self = this;
    if (this.suspended || !this.qrCode || this.poll || this.polling || gen !== this.pollGen) return;
    this.poll = setTimeout(function () {
      self.poll = null;
      self.pollOnce(gen);
    }, 2500);
  },
  pollOnce: function (gen) {
    if (this.suspended || this.polling || gen !== this.pollGen || !this.qrCode) return;
    this.polling = true;
    var self = this;
    xhrJson(
      'https://link.stremio.com/api/read?code=' + encodeURIComponent(this.qrCode),
      function (r) {
        if (gen !== self.pollGen) return;
        self.polling = false;
        var ak = r && r.result && (r.result.authKey || r.result.auth_key);
        if (ak) {
          self.finish(ak);
          return;
        }
        self.schedulePoll(gen);
      },
      10000
    );
  },
  suspendQr: function () {
    this.suspended = true;
    if (this.poll) {
      clearTimeout(this.poll);
      this.poll = null;
    }
  },
  resumeQr: function () {
    this.suspended = false;
    if (this.qrCode) this.schedulePoll(this.pollGen);
    else this.startQr();
  },
  stopQr: function () {
    if (this.poll) {
      clearTimeout(this.poll);
      this.poll = null;
    }
    this.polling = false;
    this.started = false;
    this.qrCode = '';
    this.pollGen++;
  },
  doEmail: function () {
    var email = $('lgEmail'),
      pass = $('lgPass');
    if (!email || !pass) {
      $('lgErr').textContent = tx('usePhoneCode');
      return;
    }
    var em = email.value,
      pw = pass.value;
    if (!em || !pw) {
      $('lgErr').textContent = tx('enterCredentials');
      return;
    }
    $('lgErr').textContent = '';
    toast(tx('signingIn'));
    var self = this;
    postJson(API + '/api/login', { email: em, password: pw }, function (r) {
      var res = r && r.result;
      if (!res || !res.authKey) {
        $('lgErr').textContent = (r && r.error && r.error.message) || tx('signInFailed');
        if (!r) self.explainNoConnection(self.pollGen);
        return;
      }
      if (res.user) lsSet('user', res.user);
      self.finish(res.authKey);
    });
  },
  finish: function (ak) {
    this.stopQr();
    lsSet('authKey', ak);
    this.setStatus('accountConnected');
    postJson(API + '/api/getUser', { authKey: ak }, function (j) {
      if (j && j.result) lsSet('user', j.result);
      syncAddons(function () {
        location.reload();
      });
      setTimeout(function () {
        location.reload();
      }, 4000);
    });
  },
  paint: function () {
    var email = $('lgEmail'),
      pass = $('lgPass'),
      button = $('lgBtn'),
      lang = $('lgLang');
    if (lang) lang.className = this.zone === 'lang' ? 'f' : '';
    if (email) email.className = 'lgin' + (this.zone === 'email' ? ' f' : '');
    if (pass) pass.className = 'lgin' + (this.zone === 'pass' ? ' f' : '');
    if (button) button.className = this.zone === 'btn' ? 'f' : '';
  },
  key: function (k) {
    if (this.zone === 'lang') {
      if (k === 37 || k === 39 || k === 13) this.toggleLanguage();
      else if (k === 40) {
        this.zone = 'email';
        this.paint();
      }
      return true;
    }
    if (k === 40) {
      this.zone = this.zone === 'email' ? 'pass' : this.zone === 'pass' ? 'btn' : 'btn';
      this.paint();
    } else if (k === 38) {
      this.zone = this.zone === 'btn' ? 'pass' : this.zone === 'pass' ? 'email' : 'lang';
      this.paint();
    } else if (k === 13) {
      if (this.zone === 'email') {
        var email = $('lgEmail');
        if (email && email.focus) email.focus();
      } else if (this.zone === 'pass') {
        var pass = $('lgPass');
        if (pass && pass.focus) pass.focus();
      } else this.doEmail();
    }
    return true;
  }
};
