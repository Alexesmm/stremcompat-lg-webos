// "Who is watching?": the profiles of a Nuvio account on a screen of their own, at every start
// (the profile chosen last has the focus), after signing in and from the profile at the top of
// the side menu. A profile can be added there, and its name, colour and avatar changed.

/* A round face: the avatar when it loads, until then (or without one) the initial on the
   profile's colour. Nuvio gives both; a Stremio account has its email's initial. */
function drawFace(el, face) {
  el.innerHTML = '';
  el.style.backgroundColor = face.color || '#0F766E';
  el.textContent = (face.name || '?').charAt(0).toUpperCase();
  if (!face.avatar) return;
  var img = new Image();
  img.onload = function () {
    el.textContent = '';
    el.appendChild(img);
  };
  img.src = face.avatar;
}
/* the profile in use: Nuvio's as chosen (kept by profilePanel.use), or the Stremio account */
function currentFace() {
  var u = user() || {};
  if (isNuvioAccount()) return lsJson('profileFace') || { name: u.email || '', color: '#1E88E5', avatar: '' };
  return { name: u.email || tx('connectedAccount'), color: '#0F766E', avatar: '' };
}
function paintProfileChip() {
  var face = currentFace();
  drawFace($('navFace'), face);
  $('navName').textContent = face.name;
}
/* The profile is asked once each time the app is opened. The interface page also loads again
   when the player hands back to it, or after choosing another profile; sessionStorage lasts
   while the app stays open, so those loads do not ask again. */
function rememberProfileAsked() {
  try {
    sessionStorage.setItem('profileAsked', '1');
  } catch (e) {}
}
function profileAsked() {
  try {
    return sessionStorage.getItem('profileAsked') === '1';
  } catch (e) {
    return false;
  }
}
/* after choosing, the app starts again with that profile; the screen stays up until then */
function reloadWithProfile() {
  rememberProfileAsked();
  location.reload();
}
/* When the app is opened a Nuvio account asks who is watching, with the last profile chosen in
   focus, before Home is built; one profile alone is used without asking. then() builds Home. */
function startProfiles(then) {
  paintProfileChip();
  if (profileAsked()) return then();
  profilePanel.show(authKey(), function (changed) {
    if (changed) return reloadWithProfile();
    rememberProfileAsked();
    /* the opening screen comes back while Home is built, as on any start */
    $('boot').style.display = '';
    profilePanel.close();
    paintProfileChip();
    then();
  });
}
/* OK on the profile item: Nuvio switches profiles; a Stremio account has one, so it opens its
   Account settings */
function openProfile() {
  if (!isNuvioAccount()) {
    topNav.switchTo(chipTarget.indexOf('set'));
    return settings.openCategory('account');
  }
  profilePanel.show(
    authKey(),
    function (changed) {
      if (changed) return reloadWithProfile();
      profilePanel.close();
      topNav.focus();
    },
    function () {
      topNav.focus();
    }
  );
}
/* the colours offered for a profile, Nuvio's blue first */
var PROFILE_COLORS = ['#1E88E5', '#E53935', '#43A047', '#FB8C00', '#8E24AA', '#00ACC1', '#F4511E', '#6D4C41'];
var MAX_PROFILES = 6;

var profilePanel = {
  open: false,
  mode: 'pick',
  zone: 'row',
  idx: 0,
  els: [],
  list: [],
  account: '',
  done: null,
  cancel: null,
  /* the profile being changed or made: { index, name, color, avatar } */
  draft: null,
  avatars: [],
  colorIdx: 0,
  avatarIdx: 0,
  btnIdx: 0,
  /* done(changed) runs once a profile is in use, changed when it is another one than before; the
     screen stays up for it to close or start the app again. cancel(), when given, lets Back close
     without choosing */
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
          if (!cancel) done(false);
          return;
        }
        if (list.length === 1 && !list[0].locked && !cancel) return self.use(list[0]);
        self.list = list;
        self.buildPick();
      },
      20000
    );
  },
  /* ---------- choosing ---------- */
  buildPick: function () {
    var row = $('pfRow');
    row.innerHTML = '';
    this.mode = 'pick';
    this.zone = 'row';
    this.els = [];
    this.idx = 0;
    $('pfScreen').style.display = 'block';
    $('boot').style.display = 'none';
    $('pfPick').style.display = '';
    $('pfEditor').style.display = 'none';
    $('pfTitle').textContent = tx('whoIsWatching');
    $('pfEditBtn').textContent = tx('editProfile');
    $('pfHint').textContent = tx('profilesHint');
    for (var i = 0; i < this.list.length; i++) {
      var p = this.list[i];
      this.addCard(p.name || tx('profileNumber', p.index), p, p.locked ? tx('profileLocked') : '');
      if (p.current) this.idx = i;
    }
    if (this.list.length < MAX_PROFILES) this.addCard(tx('addProfile'), null, '');
    this.open = true;
    this.paint();
  },
  /* one card: the face and the name; null for "Add profile" */
  addCard: function (label, p, note) {
    var card = document.createElement('div'),
      face = document.createElement('div'),
      name = document.createElement('div');
    card.className = 'pf' + (p && p.locked ? ' locked' : '') + (p ? '' : ' add');
    face.className = 'pfav';
    if (p) drawFace(face, p);
    else face.textContent = '+';
    name.className = 'pfname';
    name.textContent = label;
    card.appendChild(face);
    card.appendChild(name);
    if (note) {
      var lock = document.createElement('div');
      lock.className = 'pflock';
      lock.textContent = note;
      card.appendChild(lock);
    }
    $('pfRow').appendChild(card);
    this.els.push(card);
  },
  choose: function (i) {
    var p = this.list[i];
    if (!p) return this.edit(null);
    if (p.locked) return toast(tx('profileLocked'));
    this.use(p);
  },
  /* the server switches the session to it; the account's user id names the profile's library */
  use: function (p) {
    var self = this;
    lsSet('profileFace', { name: p.name, color: p.color, avatar: p.avatar });
    this.open = false;
    if (p.current) return this.done(false);
    xhrJson(
      '/nuvioprofile?key=' + encodeURIComponent(this.account) + '&index=' + p.index,
      function (j) {
        if (!j || !j.ok) {
          self.open = true;
          return toast(tx('profilesUnavailable'));
        }
        postJson(API + '/api/getUser', { authKey: self.account }, function (u) {
          if (u && u.result) lsSet('user', u.result);
          lsRawSet('addons', '');
          self.done(true);
        });
      },
      20000
    );
  },
  /* ---------- adding or changing a profile ---------- */
  edit: function (p) {
    var self = this;
    this.mode = 'edit';
    this.zone = 'name';
    this.btnIdx = 0;
    this.draft = p
      ? { index: p.index, name: p.name, color: p.color, avatar: p.avatar || '' }
      : { index: 0, name: '', color: PROFILE_COLORS[this.list.length % PROFILE_COLORS.length], avatar: '' };
    $('pfPick').style.display = 'none';
    $('pfEditor').style.display = '';
    $('pfTitle').textContent = tx(p ? 'editProfile' : 'addProfile');
    $('pfHint').textContent = tx('profileEditHint');
    $('pfEdName').value = this.draft.name;
    $('pfEdName').placeholder = tx('profileName');
    $('pfSave').textContent = tx('save');
    $('pfCancel').textContent = tx('cancel');
    var colors = $('pfEdColors');
    colors.innerHTML = '';
    this.colorEls = [];
    this.colorIdx = Math.max(0, PROFILE_COLORS.indexOf(String(this.draft.color).toUpperCase()));
    for (var c = 0; c < PROFILE_COLORS.length; c++) {
      var dot = document.createElement('div');
      dot.className = 'pfcolor';
      dot.style.backgroundColor = PROFILE_COLORS[c];
      colors.appendChild(dot);
      this.colorEls.push(dot);
    }
    this.drawAvatars([]);
    xhrJson(
      '/nuvioavatars?key=' + encodeURIComponent(this.account),
      function (j) {
        if (self.mode === 'edit') self.drawAvatars((j && j.avatars) || []);
      },
      20000
    );
    this.paint();
  },
  /* the avatars to pick from, the initial alone first */
  drawAvatars: function (list) {
    var host = $('pfEdAvatars');
    host.innerHTML = '';
    this.avatars = [{ id: '', url: '' }].concat(list);
    this.avatarEls = [];
    this.avatarIdx = 0;
    for (var i = 0; i < this.avatars.length; i++) {
      var a = document.createElement('div');
      a.className = 'pfpick';
      if (this.avatars[i].url) {
        var img = new Image();
        img.src = this.avatars[i].url;
        a.appendChild(img);
      } else a.textContent = (this.draft.name || '?').charAt(0).toUpperCase();
      host.appendChild(a);
      this.avatarEls.push(a);
      if (this.avatars[i].url && this.avatars[i].url === this.draft.avatar) this.avatarIdx = i;
    }
    this.paint();
  },
  save: function () {
    var self = this,
      d = this.draft,
      name = String($('pfEdName').value || '').trim(),
      avatar = this.avatars[this.avatarIdx] || { id: '' };
    if (!name) {
      this.zone = 'name';
      this.paint();
      return toast(tx('profileNameNeeded'));
    }
    toast(tx('saving'));
    xhrJson(
      '/nuvioprofilesave?key=' +
        encodeURIComponent(this.account) +
        '&index=' +
        (d.index || '') +
        '&name=' +
        encodeURIComponent(name) +
        '&color=' +
        encodeURIComponent(PROFILE_COLORS[this.colorIdx]) +
        '&avatar=' +
        encodeURIComponent(avatar.id),
      function (j) {
        if (!j || !j.ok) return toast(tx('profileNotSaved'));
        /* the profile in use keeps its face in the side menu up to date */
        for (var i = 0; i < self.list.length; i++)
          if (self.list[i].current && self.list[i].index === j.index)
            lsSet('profileFace', { name: name, color: PROFILE_COLORS[self.colorIdx], avatar: avatar.url });
        self.show(self.account, self.done, self.cancel);
      },
      20000
    );
  },
  /* the face of the draft follows the name, colour and avatar chosen */
  paintDraft: function () {
    var avatar = this.avatars[this.avatarIdx] || {};
    drawFace($('pfEdFace'), {
      name: $('pfEdName').value || '?',
      color: PROFILE_COLORS[this.colorIdx],
      avatar: avatar.url || ''
    });
  },
  /* ---------- drawing the focus ---------- */
  paint: function () {
    if (this.mode === 'pick') {
      setF(this.els, this.zone === 'row' ? this.idx : -1);
      var canEdit = !!this.list[this.idx];
      $('pfEditBtn').style.visibility = canEdit ? '' : 'hidden';
      $('pfEditBtn').className = this.zone === 'edit' ? 'f' : '';
      return;
    }
    $('pfEdName').className = this.zone === 'name' ? 'f' : '';
    for (var c = 0; c < this.colorEls.length; c++)
      this.colorEls[c].className =
        'pfcolor' +
        (c === this.colorIdx ? ' on' : '') +
        (this.zone === 'colors' && c === this.colorIdx ? ' f' : '');
    for (var a = 0; a < this.avatarEls.length; a++)
      this.avatarEls[a].className =
        'pfpick' +
        (a === this.avatarIdx ? ' on' : '') +
        (this.zone === 'avatars' && a === this.avatarIdx ? ' f' : '');
    /* the avatar strip slides so the chosen one stays in view */
    var step = this.avatarEls[1] ? this.avatarEls[1].offsetLeft - this.avatarEls[0].offsetLeft : 0,
      off = Math.max(0, this.avatarIdx - 4) * step;
    $('pfEdAvatars').style.webkitTransform = 'translateX(-' + off + 'px)';
    $('pfEdAvatars').style.transform = 'translateX(-' + off + 'px)';
    setF([$('pfSave'), $('pfCancel')], this.zone === 'btns' ? this.btnIdx : -1);
    this.paintDraft();
  },
  close: function () {
    this.open = false;
    $('pfEdName').blur();
    $('pfScreen').style.display = 'none';
  },
  back: function () {
    if (this.mode === 'edit') return this.buildPick();
    if (!this.cancel) return;
    this.close();
    this.cancel();
  },
  /* the name box is typed in with the TV's keyboard; OK or Back leaves it */
  typing: function () {
    return document.activeElement === $('pfEdName');
  },
  key: function (k) {
    if (this.mode === 'pick') return this.keyPick(k);
    var zones = ['name', 'colors', 'avatars', 'btns'],
      z = zones.indexOf(this.zone);
    if (k === 40 && z < zones.length - 1) this.zone = zones[z + 1];
    else if (k === 38 && z > 0) this.zone = zones[z - 1];
    else if (k === 37 || k === 39) {
      var d = k === 39 ? 1 : -1;
      if (this.zone === 'colors')
        this.colorIdx = Math.max(0, Math.min(this.colorEls.length - 1, this.colorIdx + d));
      else if (this.zone === 'avatars')
        this.avatarIdx = Math.max(0, Math.min(this.avatarEls.length - 1, this.avatarIdx + d));
      else if (this.zone === 'btns') this.btnIdx = d > 0 ? 1 : 0;
    } else if (k === 13) {
      if (this.zone === 'name') return $('pfEdName').focus();
      if (this.zone === 'btns') return this.btnIdx ? this.buildPick() : this.save();
      this.zone = zones[z + 1];
    }
    this.paint();
  },
  keyPick: function (k) {
    if (this.zone === 'row') {
      if (k === 37) this.idx = Math.max(0, this.idx - 1);
      else if (k === 39) this.idx = Math.min(this.els.length - 1, this.idx + 1);
      else if (k === 40 && this.list[this.idx]) this.zone = 'edit';
      else if (k === 13) return this.choose(this.idx);
    } else if (k === 38) this.zone = 'row';
    else if (k === 13) return this.edit(this.list[this.idx]);
    this.paint();
  }
};
on($('pfEdName'), 'keydown', function (e) {
  if (e.keyCode !== 13 && !isRemoteBack(e.keyCode)) return;
  e.preventDefault();
  e.stopPropagation();
  $('pfEdName').blur();
  profilePanel.zone = 'colors';
  profilePanel.paint();
});
on($('pfEdName'), 'input', function () {
  profilePanel.paintDraft();
});
