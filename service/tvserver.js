// Supervisor + injector for the Stremio v4 web shell. Runs under node18 (spawned
// by the webOS service launch.js), so modern JS is fine.
//
// Responsibilities:
//   1. Start the Stremio streaming server (server.js) on :11470 if not running.
//   2. Serve http://127.0.0.1:8082/ — fetch the real shell HTML from
//      app.strem.io, inject a <base> (assets load straight from app.strem.io),
//      plus our <style> (TV scaling) and <script> (remote-navigation fixes).
//
// The webview loads :8082; the page runs on our 127.0.0.1 origin so the
// injected JS controls it.
var http = require('http');
var https = require('https');
var net = require('net');
var path = require('path');
var zlib = require('zlib');
var urlmod = require('url');
var crypto = require('crypto');
var spawn = require('child_process').spawn;

var fs = require('fs');
var DIR = __dirname;
var LOADER = '/lib/ld-linux.so.3';
var NODE = path.join(DIR, 'bin', 'node18');
var LIB = path.join(DIR, 'bin', 'lib');
var SERVER = path.join(DIR, 'server.js');
var LOG_FILE = process.env.TVSERVER_LOG || path.join(DIR, 'tvserver.log');

function dbg(m) { try { fs.appendFileSync(LOG_FILE, new Date().toISOString() + ' ' + m + '\n'); } catch (e) {} }
dbg('tvserver starting, uid=' + (process.getuid ? process.getuid() : '?'));
process.on('uncaughtException', function (e) { dbg('UNCAUGHT: ' + (e && e.stack || e)); });

// The app icon, as a data URI, so the loading splash logo is 1:1 with the app icon.
var ICON_URI = '';
try { ICON_URI = 'data:image/png;base64,' + fs.readFileSync('/media/developer/apps/usr/palm/applications/io.strem.tv/icon.png').toString('base64'); } catch (e) { dbg('icon read failed: ' + e.message); }
// The official Stremio logo mark, served at /logo.png (beta splash + settings/search backdrop).
var LOGO_PNG = null;
try { LOGO_PNG = fs.readFileSync(path.join(DIR, 'stremio-logo.png')); } catch (e) { dbg('logo read failed: ' + e.message); }

var ORIGIN = 'https://app.strem.io';
var SHELL_URL = ORIGIN + '/shell-v4.4/';
var APP_VERSION = '1.2.2';
var PORT = 8082; // versioned away from 1.2.0/1.2.1's :8080 stale detached runtime
var SERVER_PORT = 11470;
/* Replaced with the profile-specific, verified assets during packaging. Keeping
   an embedded copy makes the low-storage webOS 3 build independent of service
   working-directory and package-file lookup quirks. */
var EMBEDDED_BETA_HTML_B64 = '__EMBEDDED_BETA_HTML_B64__';
var EMBEDDED_BETA_APP_B64 = '__EMBEDDED_BETA_APP_B64__';

function readUiAsset(name, embedded, cb) {
  var candidates = [path.join(DIR, name)];
  if (process.argv[1]) candidates.push(path.join(path.dirname(process.argv[1]), name));
  candidates.push(path.join(process.cwd(), name));
  var seen = {}, index = process.env.TVSERVER_FORCE_EMBEDDED_UI === '1' ? candidates.length : 0, lastError = null;
  function next() {
    if (index >= candidates.length) {
      if (embedded && embedded.indexOf('__EMBEDDED_') !== 0) {
        try { dbg('[ui] serving embedded fallback for ' + name + (lastError ? ': ' + lastError.message : ''));return cb(null, Buffer.from(embedded, 'base64')); } catch (e) { lastError = e; }
      }
      return cb(lastError || new Error(name + ' unavailable'));
    }
    var file = candidates[index++];
    if (seen[file]) return next();seen[file] = true;
    fs.readFile(file, function (error, data) { if (!error && data && data.length) return cb(null, data);lastError = error || new Error('empty ' + file);next(); });
  }
  next();
}

// ---------- start the streaming server ----------
function portUp(port, cb) {
  var s = net.connect(port, '127.0.0.1');
  var done = false;
  function f(v) { if (!done) { done = true; try { s.destroy(); } catch (e) {} cb(v); } }
  s.on('connect', function () { f(true); });
  s.on('error', function () { f(false); });
  setTimeout(function () { f(false); }, 1000);
}

function startStreamingServer() {
  var env = Object.assign({}, process.env);
  env.HOME = env.HOME || '/home/root';
  env.USER = env.USER || 'root';
  env.FFMPEG_BIN = path.join(DIR, 'bin', 'ffmpeg');
  env.FFPROBE_BIN = path.join(DIR, 'bin', 'ffprobe');
  var child = spawn(LOADER, ['--library-path', LIB, NODE, SERVER], {
    cwd: DIR, env: env, detached: true, stdio: 'ignore'
  });
  child.on('error', function () {});
  child.unref();
}

portUp(SERVER_PORT, function (up) { if (!up) startStreamingServer(); });

// ---------- injected CSS / JS ----------
var CSS = [
  '/* Stremio-TV: bigger & more readable */',
  'html { zoom: 1.75; }',
  'body { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }',
  '/* No boxy outline anywhere; cards use a soft white glow, chrome uses a tint. */',
  ':focus { outline: none !important; }',
  '.button:focus, .player-setting:focus, .option:focus, .setting:focus, .heading-button:focus, .link:focus, .login-logout-button:focus { background: rgba(140,92,255,.30) !important; border-radius: 12px !important; }',
  '/* one clean focus ring on the filter dropdowns (was doubling: tint + pill + native) */',
  '.custom-select:focus, .custom-select select:focus, #discover-filters .custom-select:focus, #library-filters .custom-select:focus, select:focus { outline: none !important; background: rgba(255,255,255,.14) !important; box-shadow: 0 0 0 3px #8c5cff !important; }',
  '/* keep the left sidebar tab labels on one line (they were wrapping) */',
  '#navbar .tab, #navbar .tab * { white-space: nowrap !important; }',
  '/* FIX: library/discover poster grid collapsed to one vertical column because',
  '   the cross-origin stylesheet leaves items as display:list-item. Force flow. */',
  '.items.poster, #library-port, #discover-items { display: flex !important; flex-wrap: wrap !important; align-content: flex-start !important; justify-content: flex-start !important; }',
  '.items.poster > *, #library-port > *, #discover-items > * { display: inline-block !important; vertical-align: top; float: none !important; margin: 0 20px 26px 0 !important; }',
  '/* Discover: drop the clipped side info panel and give the poster grid the full width */',
  '#discover .info-box { display: none !important; }',
  '#discover .content { width: 100% !important; flex: 1 1 100% !important; }',
  '/* Addons tab replaced by a single centered Sync button (full cover) */',
  '#tvSync { position: fixed; top: 0; right: 0; bottom: 0; left: 0; display: none; background: #0c0b11; z-index: 2000000; }',
  '#tvSync.show { display: block; }',
  '#tvSyncBox { position: absolute; top: 50%; left: 52%; transform: translate(-50%,-50%); text-align: center; }',
  '#tvSyncBtn { display: inline-block; padding: 24px 64px; font-size: 32px; font-weight: 600; color: #fff; background: #8c5cff; border-radius: 14px; }',
  '#tvSyncBtn.f, #tvSyncBtn:focus { box-shadow: 0 0 0 5px #fff; }',
  '#tvSyncSub { opacity: .6; margin-top: 22px; font-size: 19px; }',
  '/* Logo splash that hides the partial-render flash until the app is ready */',
  '#tvSplash { position: fixed; inset: 0; top:0;left:0;right:0;bottom:0; display: flex; align-items: center; justify-content: center; flex-direction: column; background: #0c0b11; z-index: 2147483647; transition: opacity .5s; }',
  '#tvSplash.hide { opacity: 0; pointer-events: none; }',
  '#tvSplashTxt { margin-top: 26px; font-size: 24px; color: rgba(255,255,255,.7); letter-spacing: .4px; font-family: sans-serif; }',
  '/* loading logo = the real app icon; ~96px CSS so it lands near the webOS launch-icon scale at zoom 1.75 */',
  'img#tvSplashLogo { width: 96px; height: 96px; border-radius: 22px; object-fit: cover; box-shadow: 0 12px 44px rgba(0,0,0,.45); animation: tvb 2.2s ease-in-out infinite; }',
  'div#tvSplashLogo { width: 88px; height: 88px; border-radius: 20px; background: linear-gradient(135deg,#7b5bf5,#a07cff); display:flex; align-items:center; justify-content:center; box-shadow: 0 12px 44px rgba(124,92,255,.45); animation: tvb 2.2s ease-in-out infinite; }',
  'div#tvSplashLogo:after { content:""; width:0;height:0; border-style:solid; border-width: 17px 0 17px 29px; border-color: transparent transparent transparent #fff; margin-left: 7px; }',
  '@keyframes tvb { 0%,100%{transform:scale(1);opacity:.82} 50%{transform:scale(1.06);opacity:1} }',
  '/* navigable custom dropdown (replaces the stuck native picker) */',
  '#tvdd { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); min-width:380px; max-width:70%; max-height:72%; overflow:auto; background:rgba(20,18,30,.985); border-radius:16px; padding:14px; display:none; z-index:1800000; box-shadow:0 24px 90px rgba(0,0,0,.75); }',
  '#tvdd.show { display:block; }',
  '#tvdd .ddi { padding:16px 26px; font-size:26px; border-radius:10px; white-space:nowrap; }',
  '#tvdd .ddi.f { background:#8c5cff; }',
  '',
  '/* ===== Theme: dark base + rounded poster cards with a smooth focus glow/scale ===== */',
  'body, #app, #board, #discover, #library, #search { background-color:#0c0b11 !important; }',
  '#navbar { background:linear-gradient(90deg,#0c0b11,rgba(12,11,17,.85)) !important; }',
  '#navbar .tab { transition:transform .18s ease, color .18s ease; }',
  '#navbar .tab.selected, #navbar .tab:focus { transform:scale(1.05); }',
  '.items li .thumb, .resume .thumb, #discover-items li .thumb, .meta-items .thumb, .items li img, #discover-items li img, #library-port li img, .board-row li img { border-radius:12px !important; }',
  '/* Focus = a crisp SOLID white ring (no blur -> cheap to draw, no flicker on the weak TV GPU).',
  '   No drop-shadow, no layer promotion, no transition on the ring. A small scale is the only',
  '   animation. This is what was glitching before (34px blur + translateZ layer thrash on each move). */',
  '.items li, #discover-items li, #library-port li, .board-row li, .meta-items > * { border-radius:12px; }',
  '/* Focus = a STATIC crisp white ring on the selected cell. No scale, no transition, no shadow,',
  '   no layer — nothing animates, so nothing can glitch/flicker on this TV GPU. Rock-solid. */',
  '.items li.selected, .items li:focus, #discover-items li.selected, #discover-items li:focus, #library-port li.selected, #library-port li:focus, .board-row li.selected, .board-row li:focus, #board .items li.selected, #board .items li:focus, .meta-items .selected, .meta-items > *:focus { box-shadow:0 0 0 3px #fff !important; z-index:6 !important; }',
  '#discover-filters .custom-select { background:rgba(255,255,255,.08) !important; border-radius:22px !important; padding:6px 20px !important; margin-right:14px !important; }',
  '/* never show the v4 player (we always redirect to our bare player) */',
  '#player { display:none !important; }',
  '',
  '/* ===== QR / phone sign-in ===== */',
  '#tvqr { position:fixed; top:0;left:0;right:0;bottom:0; display:none; align-items:center; justify-content:center; flex-direction:column; background:#0c0b11; z-index:1500000; text-align:center; }',
  '#tvqr.show { display:flex; }',
  '#tvqr h2 { font-size:36px; margin:0 0 10px; font-weight:700; }',
  '#tvqr .sub { opacity:.6; font-size:20px; margin-bottom:30px; }',
  '#tvqr img { width:300px; height:300px; background:#fff; border-radius:18px; padding:14px; box-sizing:border-box; }',
  '#tvqr .code { font-size:44px; letter-spacing:10px; font-weight:700; margin:26px 0 6px; }',
  '#tvqr .codehint { opacity:.5; font-size:17px; }',
  '#tvqr .status { margin-top:26px; opacity:.75; font-size:19px; }',
  '#tvqr .email { margin-top:30px; opacity:.55; font-size:17px; }',
  '#tvqr .email:focus { opacity:1; color:#cdbcff; }'
].join('\n');

// The shell uses window.SpatialNavigation (js-spatial-navigation) but only wired
// its CONTENT areas for TV. We register the chrome + dropdowns as sections so the
// remote can reach them, auto-focus a dropdown when it opens, and make Back close
// open overlays. (Do NOT touch tabindex — this lib focuses elements directly and
// relies on tabindex=-1.) Layout discovered via the inspector:
//   #navbar      = left vertical sidebar (.tab menu items)
//   #topbar      = top bar: #global-search-field (center) + .user-menu (right)
//   #user-panel  = user dropdown (.option items, .login-logout-button)
var JS = [
  '(function(){',
  '  // Logo splash: stays until the shell is FULLY loaded (board content or the',
  '  // login form is present), hiding the partial-render / purple flash.',
  '  (function(){',
  '    var sp = document.getElementById("tvSplash");',
  '    if (!sp) { sp = document.createElement("div"); sp.id = "tvSplash"; sp.innerHTML = "<div id=\\"tvSplashLogo\\"></div>"; (document.body || document.documentElement).appendChild(sp); }',
  '    try { if (sessionStorage.getItem("tvBack")) { sessionStorage.removeItem("tvBack"); var tt = document.createElement("div"); tt.id = "tvSplashTxt"; tt.textContent = "Taking you back to Stremio"; sp.appendChild(tt); } } catch (e) {}', // single "returning" splash
  '    var n = 0, boot = 0;',
  '    // Hide ~1.6s after the app has booted (navbar/login/board present) so the',
  '    // content has painted; hard cap so it can never get stuck.',
  '    function booted(){ return document.querySelector("#navbar .tab, input.email, #board .meta-item, .meta-items"); }',
  '    function check(){',
  '      n++;',
  '      if (!boot && booted()) boot = n;',
  '      if ((boot && n - boot >= 3) || n > 100) { sp.className = "hide"; setTimeout(function(){ if (sp.parentNode) sp.parentNode.removeChild(sp); }, 500); }',
  '      else setTimeout(check, 200);',
  '    }',
  '    check();',
  '  })();',
  '  function root(){ try { return angular.element(document.body).scope().$root; } catch (e) { return null; } }',
  '  var SN = null, added = {};',
  '  // Add a section + make it focusable ONCE (re-running churns focus = jitter).',
  '  function ensure(id, selector, cfg){',
  '    if (added[id] || !document.querySelector(selector)) return;',
  '    try {',
  '      var o = { id: id, selector: selector, enterTo: "last-focused", straightOnly: false };',
  '      if (cfg) for (var k in cfg) o[k] = cfg[k];',
  '      SN.add(o); SN.makeFocusable(id); added[id] = true;',
  '    } catch (e) {}',
  '  }',
  '  // The search box is an <input>, so arrow keys move the text caret and trap',
  '  // focus. Let Right/Left/Down escape to the neighbouring chrome / content.',
  '  function wireSearchEscape(){',
  '    var inp = document.querySelector("#global-search-field");',
  '    if (!inp || inp._tvwired) return;',
  '    inp._tvwired = true;',
  '    inp.addEventListener("keydown", function(e){',
  '      var user = document.querySelector("#topbar .user-menu");',
  '      if (e.keyCode === 39 && user) { e.preventDefault(); e.stopPropagation(); try { user.focus(); } catch (x) {} }',      // Right -> user button
  '      else if (e.keyCode === 40) { e.preventDefault(); e.stopPropagation(); try { SN.focus("board"); } catch (x) {} }',   // Down -> content
  '    }, true);',
  '  }',
  '  // On the login/intro form the on-screen keyboard steals focus; when it',
  '  // closes, spatial nav loses its place. Drive Up/Down deterministically',
  '  // through the visible fields/buttons so you can always reach them.',
  '  function wireLoginNav(){',
  '    if (document._tvLoginNav) return;',
  '    document._tvLoginNav = true;',
  '    document.addEventListener("keydown", function(e){',
  '      if (location.hash.indexOf("intro") < 0) return;',
  '      if (e.keyCode !== 38 && e.keyCode !== 40) return;',
  '      var sels = ["input.email", "input.password", "input.conf-password", ".proceed", ".fb"], order = [];',
  '      for (var i = 0; i < sels.length; i++) { var el = document.querySelector(sels[i]); if (el && el.getBoundingClientRect().width > 0) order.push(el); }',
  '      if (!order.length) return;',
  '      var idx = order.indexOf(document.activeElement), next;',
  '      if (e.keyCode === 40) next = order[idx < 0 ? 0 : Math.min(idx + 1, order.length - 1)];',
  '      else next = order[idx < 0 ? 0 : Math.max(idx - 1, 0)];',
  '      if (next && next !== document.activeElement) { e.preventDefault(); e.stopPropagation(); try { next.focus(); } catch (x) {} }',
  '    }, true);',
  '  }',
  '  // Addons tab -> a single centered "Sync Addons" button (reload re-pulls the',
  '  // account: login, addons, library all refresh to current state).',
  '  // Remove the Calendar + Addons sidebar tabs entirely.',
  '  function isGone(s){ s = (s || "").toLowerCase(); return s.indexOf("calendar") >= 0 || s.indexOf("addon") >= 0; }',
  '  function filterTabs(){',
  '    try {',
  '      var el = document.querySelector("#navbar"); if (!el) return;',
  '      var sc = angular.element(el).scope();',
  '      while (sc && !sc.tabs) sc = sc.$parent;',
  '      if (!sc || !sc.tabs || !sc.tabs.length) return;',
  '      var before = sc.tabs.length;',
  '      sc.tabs = sc.tabs.filter(function(t){ return !isGone((t.route || "") + " " + (t.name || "") + " " + (t.icon || "")); });',
  '      if (sc.tabs.length !== before && !sc.$$phase && !(sc.$root && sc.$root.$$phase)) sc.$apply();',
  '    } catch (e) {}',
  '  }',
  '  function hideTabs(){',
  '    filterTabs();',                                       // remove from the model (no DOM/icons)
  '    var t = document.querySelectorAll("#navbar .tab");',  // CSS fallback in case the model filter misses
  '    for (var i = 0; i < t.length; i++) {',
  '      var nm = t[i].getAttribute("tab-name") || "", hr = t[i].getAttribute("href") || t[i].getAttribute("ui-sref") || "";',
  '      if (isGone(nm) || isGone(hr)) { t[i].style.display = "none"; }',
  '    }',
  '  }',
  '  var syncEl = null, syncOn = false;',
  '  function ensureSync(){',
  '    if (syncEl) return;',
  '    syncEl = document.createElement("div"); syncEl.id = "tvSync";',
  '    syncEl.innerHTML = "<div id=\\"tvSyncBox\\"><div id=\\"tvSyncBtn\\" tabindex=\\"0\\">\\u21bb  Sync Addons</div><div id=\\"tvSyncSub\\">Refresh your account, addons &amp; library</div></div>";',
  '    document.body.appendChild(syncEl);',
  '    syncEl.querySelector("#tvSyncBtn").addEventListener("click", function(){ location.reload(); });',
  '  }',
  '  // ---- QR / phone sign-in (Stremio link flow) ----',
  '  function xg(u, cb){ try { var x=new XMLHttpRequest(); x.open("GET",u,true); x.onreadystatechange=function(){ if(x.readyState===4){ var j=null; try{j=JSON.parse(x.responseText);}catch(e){} cb(j); } }; x.send(); } catch(e){ cb(null); } }',
  '  function xp(u, body, cb){ try { var x=new XMLHttpRequest(); x.open("POST",u,true); x.setRequestHeader("Content-Type","application/json"); x.onreadystatechange=function(){ if(x.readyState===4){ var j=null; try{j=JSON.parse(x.responseText);}catch(e){} cb(j); } }; x.send(JSON.stringify(body)); } catch(e){ cb(null); } }',
  '  var qrEl=null, qrStarted=false, qrPoll=null, qrDismissed=false;',
  '  function buildQr(){',
  '    if (qrEl) return;',
  '    qrEl=document.createElement("div"); qrEl.id="tvqr";',
  '    qrEl.innerHTML="<h2>Sign in to Stremio</h2><div class=sub>Scan with your phone to sign in</div><img id=tvqrimg><div class=code id=tvqrcode></div><div class=codehint>or open link.stremio.com and enter the code</div><div class=status id=tvqrstatus>Generating code\\u2026</div><div class=email id=tvqremail tabindex=0>Use email instead (press OK)</div>";',
  '    document.body.appendChild(qrEl);',
  '    qrEl.querySelector("#tvqremail").addEventListener("click", dismissQr);',
  '  }',
  '  function dismissQr(){ qrDismissed=true; if(qrPoll){clearInterval(qrPoll);qrPoll=null;} if(qrEl) qrEl.className=""; try{ var em=document.querySelector("input.email"); if(em) em.focus(); }catch(e){} }',
  '  function startQr(){',
  '    if (qrStarted || qrDismissed) return; qrStarted=true; buildQr(); qrEl.className="show";',
  '    xg("https://link.stremio.com/api/create", function(j){',
  '      if (!j || !j.code) { var s=document.getElementById("tvqrstatus"); if(s)s.textContent="Couldn\\u2019t reach Stremio \\u2014 use email below."; qrStarted=false; return; }',
  '      document.getElementById("tvqrimg").src=j.qrcode; document.getElementById("tvqrcode").textContent=j.code; document.getElementById("tvqrstatus").textContent="Waiting for sign-in\\u2026";',
  '      qrPoll=setInterval(function(){',
  '        xg("https://link.stremio.com/api/read?code="+encodeURIComponent(j.code), function(r){',
  '          var ak = r && r.result && (r.result.authKey || r.result.auth_key);',
  '          if (ak) { clearInterval(qrPoll); qrPoll=null; finishQr(ak); }',
  '        });',
  '      }, 2500);',
  '    });',
  '  }',
  '  function finishQr(authKey){',
  '    var s=document.getElementById("tvqrstatus"); if(s)s.textContent="Signing in\\u2026";',
  '    try { localStorage.setItem("authKey", JSON.stringify(authKey)); } catch(e){}',
  '    xp("https://api.strem.io/api/getUser", { authKey: authKey }, function(j){',
  '      try { if (j && j.result) localStorage.setItem("user", JSON.stringify(j.result)); } catch(e){}',
  '      location.reload();',
  '    });',
  '  }',
  '  // ---- navigable custom dropdown (replaces the native picker that traps focus) ----',
  '  var ddEl=null, ddSel=null, ddItems=[], ddIdx=0;',
  '  function ddOpen(sel){',
  '    if (!sel || !sel.options || !sel.options.length) return false;',
  '    if (!ddEl){ ddEl=document.createElement("div"); ddEl.id="tvdd"; document.body.appendChild(ddEl); }',
  '    ddSel=sel; ddItems=[]; ddIdx=Math.max(0, sel.selectedIndex); var html="";',
  '    for (var i=0;i<sel.options.length;i++){ ddItems.push(i); html+="<div class=ddi>"+((sel.options[i].textContent||sel.options[i].value||"").replace(/</g,"&lt;"))+"</div>"; }',
  '    ddEl.innerHTML=html; ddEl.className="show"; ddPaint(); return true;',
  '  }',
  '  function ddPaint(){ var e=ddEl.querySelectorAll(".ddi"); for(var i=0;i<e.length;i++) e[i].className="ddi"+(i===ddIdx?" f":""); if(e[ddIdx]) e[ddIdx].scrollIntoView(false); }',
  '  function ddChoose(){ if(ddSel){ try{ ddSel.selectedIndex=ddIdx; var ev=document.createEvent("HTMLEvents"); ev.initEvent("change",true,true); ddSel.dispatchEvent(ev); }catch(e){} var r=root(); if(r){ try{ if(!r.$$phase && !(r.$root&&r.$root.$$phase)) r.$apply(); }catch(e){} } } ddClose(); }',
  '  function ddClose(){ if(ddEl) ddEl.className=""; ddSel=null; }',
  '  function ddIsOpen(){ return ddEl && ddEl.className==="show"; }',
  '  var prevUser = false, loginFocused = false;',
  '  function tick(){',
  '    SN = window.SpatialNavigation;',
  '    // Free compositor memory during playback: drop the zoom while the',
  '    // fullscreen player is open (this TV is very RAM-limited). Restore for UI.',
  '    try { document.documentElement.style.zoom = (location.hash.indexOf("player") >= 0) ? "1" : ""; } catch (e) {}',
  '    if (!SN) return;',
  '    ensure("tvtabs", "#navbar .tab");',
  '    ensure("tvtopbar", "#topbar #global-search-field, #topbar .user-menu");',
  '    wireSearchEscape();',
  '    wireLoginNav();',
  '    // Login / intro: QR sign-in over the form (email reachable via "Use email").',
  '    if (location.hash.indexOf("intro") >= 0 && document.querySelector(".email, .proceed")) {',
  '      startQr();',
  '      ensure("tvlogin", "input.email, input.password, input.conf-password, .proceed, .fb", { enterTo: "default-element", defaultElement: "input.email" });',
  '      try { SN.makeFocusable("tvlogin"); } catch (e) {}',
  '      if (qrDismissed && !loginFocused) { var em = document.querySelector("input.email"); if (em) { try { em.focus(); loginFocused = true; } catch (e) {} } }',
  '    } else { loginFocused = false; if (qrEl) { qrEl.className=""; qrStarted=false; qrDismissed=false; if (qrPoll){clearInterval(qrPoll);qrPoll=null;} } }',
  '    // Calendar + Addons tabs removed: hide them and bounce their routes home.',
  '    hideTabs();',
  '    if (location.hash.indexOf("addons") >= 0 || location.hash.indexOf("calendar") >= 0) { try { location.hash = "#/"; } catch (e) {} }',
  '    var r = root();',
  '    var userOpen = !!(r && r.userMenuOpen);',
  '    if (userOpen) {',
  '      ensure("tvusermenu", "#user-panel .option, #user-panel .login-logout-button", { enterTo: "default-element" });',
  '      try { SN.makeFocusable("tvusermenu"); } catch (e) {}',
  '      if (!prevUser) { try { SN.focus("tvusermenu"); } catch (e) {} }', // jump into menu when it opens
  '    }',
  '    prevUser = userOpen;',
  '    manageOverlayHistory(!!(r && (r.userMenuOpen || r.searchOpened)));',
  '  }',
  '  function closeOverlays(){',
  '    var r = root();',
  '    var a = document.activeElement;',
  '    var sf = a && (a.id === "global-search-field" || (a.closest && a.closest("#search-form-container, #search-bar, #search-dropdown")));',
  '    if (r && (r.userMenuOpen || r.searchOpened || sf)) {',
  '      r.userMenuOpen = false; r.searchOpened = false; r.searchNavActive = false;',
  '      try { if (a && a.blur) a.blur(); } catch (e) {}',           // drop edit focus from the search input
  '      try { r.$apply(); } catch (e) {}',
  '      try { window.SpatialNavigation.focus("tvtopbar"); } catch (e) {}',
  '      return true;',
  '    }',
  '    return false;',
  '  }',
  '  // This TV delivers Back as history navigation, not a key event. So when an',
  '  // overlay opens we push a dummy history entry; Back then pops it and we',
  '  // close the overlay instead of the underlying route changing.',
  '  var overlayPushed = false;',
  '  function manageOverlayHistory(open){',
  '    if (open && !overlayPushed) { try { history.pushState({ tvOverlay: true }, ""); } catch (e) {} overlayPushed = true; }',
  '    else if (!open) { overlayPushed = false; }',
  '  }',
  '  window.addEventListener("popstate", function(){',
  '    if (overlayPushed) { overlayPushed = false; closeOverlays(); }',
  '  });',
  '  // Fallback: some setups DO send Back/Escape as a key event.',
  '  document.addEventListener("keydown", function(e){',
  '    if (e.keyCode === 461 || e.keyCode === 27) {',
  '      if (closeOverlays()) { overlayPushed = false; e.preventDefault(); e.stopPropagation(); }',
  '    }',
  '  }, true);',
  '  // On the QR sign-in screen, OK switches to email login.',
  '  document.addEventListener("keydown", function(e){',
  '    if (qrEl && qrEl.className === "show" && e.keyCode === 13) { dismissQr(); e.preventDefault(); e.stopPropagation(); }',
  '  }, true);',
  '  // Dropdown: Enter on a <select> opens a navigable list; arrows move, Enter picks, Back cancels.',
  '  document.addEventListener("keydown", function(e){',
  '    if (ddIsOpen()) {',
  '      if (e.keyCode === 38) { ddIdx = Math.max(0, ddIdx-1); ddPaint(); }',
  '      else if (e.keyCode === 40) { ddIdx = Math.min(ddItems.length-1, ddIdx+1); ddPaint(); }',
  '      else if (e.keyCode === 13) { ddChoose(); }',
  '      else if (e.keyCode === 461 || e.keyCode === 27 || e.keyCode === 8) { ddClose(); }',
  '      e.preventDefault(); e.stopPropagation(); return;',
  '    }',
  '    if (e.keyCode === 13) {',
  '      var a = document.activeElement, sel = null;',
  '      if (a) { if (a.tagName === "SELECT") sel = a; else if (a.querySelector) { sel = a.querySelector("select"); if (!sel && a.closest) { var cs = a.closest(".custom-select"); if (cs) sel = cs.querySelector("select"); } } }',
  '      if (sel && ddOpen(sel)) { e.preventDefault(); e.stopPropagation(); }',
  '    }',
  '  }, true);',
  '  // In the player, Up/Down are bound to volume which the user does not want.',
  '  // Swallow them before the player handler runs.',
  '  document.addEventListener("keydown", function(e){',
  '    if (location.hash.indexOf("player") >= 0 && (e.keyCode === 38 || e.keyCode === 40)) {',
  '      e.preventDefault(); e.stopPropagation();',
  '    }',
  '  }, true);',
  '  var lastCover = null;',
  '  function goFocus(el){ try { SN.focus(el); } catch (x) { try { el.focus(); } catch (y) {} } }',
  '  // Down FROM a See-All button drops back into that row\'s covers. Narrow: only fires when the',
  '  // See-All itself is focused, so ordinary Down navigation is completely untouched.',
  '  document.addEventListener("keydown", function(e){',
  '    if (e.keyCode !== 40) return;',
  '    var a = document.activeElement;',
  '    if (!a || !a.className || String(a.className).indexOf("heading-button") < 0) return;',
  '    var back = (lastCover && lastCover.offsetParent) ? lastCover : null;',
  '    if (!back && a.closest) { var row = a.closest("li"); back = row && row.querySelector(".board-row li, ul li, .items li"); }',
  '    if (back) { e.preventDefault(); e.stopImmediatePropagation(); goFocus(back); }',
  '  }, true);',
  '  // Up ONLY when it would otherwise do nothing (top of the content): go to this row\'s See-All',
  '  // if present, else the top bar. Deferred + non-capturing so normal row-to-row Up is NOT touched.',
  '  document.addEventListener("keydown", function(e){',
  '    if (e.keyCode !== 38) return;',
  '    if (location.hash.indexOf("player") >= 0 || ddIsOpen()) return;',
  '    var r = root(); if (r && (r.userMenuOpen || r.searchOpened)) return;',
  '    var before = document.activeElement;',
  '    if (!before || !before.closest) return;',
  '    if (before.closest("#topbar, #navbar, #user-panel")) return;',
  '    if (before.className && String(before.className).indexOf("heading-button") >= 0) return;', // on a See-All: let it leave upward
  '    setTimeout(function(){',
  '      if (document.activeElement !== before) return;',   // row-to-row Up already worked -> do nothing
  '      var sa = null, el = before.parentNode;',
  '      for (var d = 0; el && d < 5; d++, el = el.parentNode) { if (el.querySelector) { var h = el.querySelector(".heading-button"); if (h) { sa = h; break; } } }',
  '      if (sa) { lastCover = before; if (sa.getAttribute("tabindex") == null) sa.setAttribute("tabindex", "-1"); goFocus(sa); }',
  '      else { try { SN.focus("tvtopbar"); } catch (x) {} }',
  '    }, 0);',
  '  }, false);',
  '  // Continue Watching: the remote OK was firing the item\'s ng-click (open the info page)',
  '  // instead of its spatial-nav-enter (resume the player). For .resume items, jump straight',
  '  // into the stream we last played; otherwise run the shell\'s own player-intent action.',
  '  window.addEventListener("keydown", function(e){',
  '    if (e.keyCode !== 13) return;',
  '    var a = document.activeElement; if (!a || !a.closest) return;',
  '    var el = a.closest(".resume"); if (!el) return;',
  '    var sc; try { sc = angular.element(el).scope(); } catch (x) { return; }',
  '    if (!sc || !sc.item) return;',
  '    var it = sc.item, id = it._id, vid = (it.state && it.state.video_id) || id, q = null;',
  '    try { q = localStorage.getItem("tvstream_" + id + "_" + vid); } catch (x) {}',
  '    e.preventDefault(); e.stopImmediatePropagation();',
  '    if (q) { location.assign("http://127.0.0.1:8082/play" + q); return; }',            // resume our exact stream + position (push so Back returns home)
  '    var expr = el.getAttribute("spatial-nav-enter");',                                  // else let Stremio open the player with its remembered stream
  '    if (expr) { try { sc.$apply(function(){ sc.$eval(expr); }); } catch (x) { try { sc.$eval(expr); } catch (y) {} } }',
  '  }, true);',
  '  // Sync overlay (Addons tab): Enter reloads; Left/Up/Back leaves it.',
  '  document.addEventListener("keydown", function(e){',
  '    if (!syncOn || !syncEl || syncEl.className !== "show") return;',
  '    if (e.keyCode === 13) { e.preventDefault(); e.stopPropagation(); location.reload(); }',
  '    else if (e.keyCode === 37 || e.keyCode === 38 || e.keyCode === 461 || e.keyCode === 27 || e.keyCode === 8) {',
  '      syncOn = false; syncEl.className = "";',
  '      try { SN.focus(e.keyCode === 38 ? "tvtopbar" : "tvtabs"); } catch (x) {}',
  '      e.preventDefault(); e.stopPropagation();',
  '    }',
  '  }, true);',
  '  // When Stremio navigates to its player, redirect to our BARE player page',
  '  // (/play). That unloads the whole ~205MB web app and frees RAM for video.',
  '  var lastShellHash = "#/";', // remember where we were so the player\'s Back returns there, not home
  '  function checkPlayer(){',
  '    var h = location.hash || "";',
  '    if (h.indexOf("#/player/") === 0) {',
  '      var parts = h.split("/");',                              // ["#","player",type,id,vid,token]
  '      var token = parts[parts.length - 1];',
  '      if (token && token.length > 20) {',
  '        try { var g = document.createElement("div"); g.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:#0c0b11;z-index:2147483646"; (document.body||document.documentElement).appendChild(g); } catch (e) {}', // cover the OG player flash
  '        var qp = "type=" + encodeURIComponent(parts[2] || "") + "&id=" + encodeURIComponent(parts[3] || "") + "&vid=" + encodeURIComponent(parts[4] || "") + "&token=" + encodeURIComponent(token) + "&back=" + encodeURIComponent(lastShellHash);',
  '        window.location.replace("http://127.0.0.1:8082/play?" + qp);',
  '      }',
  '    } else if (h && h.indexOf("#/player") !== 0) { lastShellHash = h; }', // track the last real page (usually the detail page)
  '  }',
  '  window.addEventListener("hashchange", checkPlayer);',
  '  function start(){ checkPlayer(); tick(); setInterval(tick, 800); }',
  '  if (document.readyState !== "loading") start();',
  '  else document.addEventListener("DOMContentLoaded", start);',
  '})();'
].join('\n');

function inject(html) {
  html = html.replace('<head>', '<head><base href="' + SHELL_URL + '">');
  // Drop scripts that are useless on this TV and just eat memory (Chromecast
  // sender, Apple ID SDK). This low-RAM set OOM-kills the app under load.
  html = html.replace(/<script[^>]*cast_sender[^>]*><\/script>/g, '');
  html = html.replace(/<script[^>]*appleid[^>]*><\/script>/g, '');
  html = html.replace('</head>', '<style>' + CSS + '</style></head>');
  // Splash sits in the HTML so it covers the very first paint (no flash before JS runs).
  var splashLogo = ICON_URI ? '<img id="tvSplashLogo" src="' + ICON_URI + '">' : '<div id="tvSplashLogo"></div>';
  html = html.replace(/<body[^>]*>/, '$&<div id="tvSplash">' + splashLogo + '</div>');
  html = html.replace('</body>', '<script>' + JS + '</script></body>');
  return html;
}

// ---------- bare-page player ----------
// Stremio encodes the picked stream as a zlib+base64 token in the player route.
// Decode it server-side (node has zlib) so the bare page stays tiny.
function decodeStreamToken(token) {
  try {
    var t = String(token).replace(/~([0-9A-Fa-f]{2})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
    t = t.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    var out = zlib.inflateSync(Buffer.from(t, 'base64')).toString('utf8');
    return JSON.parse(out);
  } catch (e) { dbg('decode token failed: ' + e.message); return null; }
}

// Stream references keep provider cookies/auth headers out of URLs and browser
// storage. Only a short opaque id crosses the webview boundary.
var streamRefs = {};
var streamRefOrder = [];
var proxySecret = crypto.randomBytes(32);
function safeText(v, max) { return String(v == null ? '' : v).replace(/[\r\n\0]/g, ' ').slice(0, max); }
function safeProxyHeaders(raw) {
  var out = {}, allow = {
    'user-agent': 'User-Agent', 'referer': 'Referer', 'origin': 'Origin',
    'cookie': 'Cookie', 'authorization': 'Authorization', 'accept': 'Accept',
    'accept-language': 'Accept-Language'
  };
  if (!raw || typeof raw !== 'object') return out;
  Object.keys(raw).forEach(function (key) {
    var lk = String(key).toLowerCase(), name = allow[lk];
    if (!name) return;
    var value = safeText(raw[key], 2048);
    if (value) out[name] = value;
  });
  return out;
}
function storeStreamRef(raw) {
  raw = raw || {};
  var streamUrl = safeText(raw.url, 8192);
  if (!/^https?:\/\//i.test(streamUrl)) return '';
  var ref = crypto.randomBytes(12).toString('hex');
  streamRefs[ref] = {
    url: streamUrl, name: safeText(raw.name, 300), title: safeText(raw.title, 700),
    description: safeText(raw.description, 700),
    behaviorHints: { filename: safeText(raw.filename, 500) },
    headers: safeProxyHeaders(raw.headers), notWebReady: !!raw.notWebReady, at: Date.now()
  };
  streamRefOrder.push(ref);
  while (streamRefOrder.length > 40) delete streamRefs[streamRefOrder.shift()];
  return ref;
}
function getStreamRef(ref) {
  ref = String(ref || '');var s = streamRefs[ref];
  if (!s || Date.now() - s.at > 12 * 3600 * 1000) return null;
  s.at = Date.now();var at = streamRefOrder.indexOf(ref);if (at >= 0) streamRefOrder.splice(at, 1);streamRefOrder.push(ref);return s;
}
function readJsonBody(req, maxBytes, cb) {
  var chunks = [], total = 0, done = false;
  function finish(v) { if (done) return; done = true; cb(v); }
  req.on('data', function (d) {
    total += d.length;
    if (total > maxBytes) { try { req.destroy(); } catch (e) {} finish(null); }
    else chunks.push(d);
  });
  req.on('end', function () {
    if (done) return;
    try { finish(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { finish(null); }
  });
  req.on('error', function () { finish(null); });
}
function proxySignature(ref, target) {
  return crypto.createHmac('sha256', proxySecret).update(String(ref) + '\n' + String(target)).digest('hex').slice(0, 32);
}
function signedProxyUrl(ref, target) {
  return 'http://127.0.0.1:' + PORT + '/proxy?ref=' + encodeURIComponent(ref) + '&u=' + encodeURIComponent(target) + '&sig=' + proxySignature(ref, target);
}
function rewriteHls(body, baseUrl, ref) {
  function link(raw) {
    if (!raw || /^data:/i.test(raw)) return raw;
    var absolute;try { absolute = urlmod.resolve(baseUrl, raw); } catch (e) { return raw; }
    return signedProxyUrl(ref, absolute);
  }
  return String(body).replace(/URI="([^"]+)"/g, function (all, u) { return 'URI="' + link(u) + '"'; })
    .split(/\r?\n/).map(function (line) {
      var clean = line.trim();return clean && clean.charAt(0) !== '#' ? link(clean) : line;
    }).join('\n');
}

function cleanTitle(stream) {
  // Prefer a human title from the description (addons put "🎬 Movie (Year)" on
  // the first line); fall back to a cleaned filename; then the stream name.
  var desc = stream.description || stream.title || '';
  var first = (desc.split('\n')[0] || '').replace(/^[^0-9A-Za-z(]+/, '').trim();
  if (first && first.length >= 2) return first;
  var fn = stream.behaviorHints && stream.behaviorHints.filename;
  if (fn) {
    return fn.replace(/\.[^.]+$/, '')
             .replace(/[._]/g, ' ')
             .replace(/\b(1080p|720p|2160p|4k|web[- ]?dl|bluray|x264|x265|h ?264|h ?265|hevc|amzn|ddp?5 1|aac|atmos)\b.*$/i, '')
             .trim();
  }
  return stream.name || 'Stremio';
}

function playerPage(stream, ctx) {
  var streamUrl = stream.url || '';
  ctx = ctx || {};
  var streamHeaders = stream.headers || {};
  if (ctx.streamRef && (stream.notWebReady || Object.keys(streamHeaders).length)) {
    streamUrl = 'http://127.0.0.1:' + PORT + '/proxy?ref=' + encodeURIComponent(ctx.streamRef);
  }
  var meta = ctx.meta || {};
  var title = meta.name || cleanTitle(stream);
  var seLine = (ctx.season && ctx.episode) ? ('Season ' + ctx.season + ' · Episode ' + ctx.episode + (ctx.epTitle ? '  ·  ' + ctx.epTitle : '')) : '';
  var nextVid = ctx.nextVid || '';
  // "Next episode" returns to whichever UI launched us: beta detail page or the v4 route.
  var fromBeta = (ctx.back || '').indexOf('beta') === 0;
  var nextHref = !nextVid ? '' : (fromBeta
    ? 'http://127.0.0.1:8082/beta#detail/' + encodeURIComponent(ctx.type || '') + '/' + encodeURIComponent(ctx.id || '') + '/' + encodeURIComponent(nextVid)
    : 'http://127.0.0.1:8082/#/detail/' + encodeURIComponent(ctx.type || '') + '/' + encodeURIComponent(ctx.id || '') + '/' + encodeURIComponent(nextVid));
  // Browser script below targets Chromium 53 (ES5 only).
  return '<!doctype html><html><head><meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width,initial-scale=1">' +
'<style>' +
'html,body{margin:0;height:100%;background:#000;overflow:hidden;font-family:sans-serif;color:#fff}' +
'#v{position:fixed;top:0;left:0;width:100%;height:100%;background:#000}' +
'#gocov{position:fixed;top:0;left:0;right:0;bottom:0;background:#0c0b11;z-index:2147483647}' +
'#load{position:fixed;top:0;left:0;right:0;bottom:0;background:#0c0b11 center/cover no-repeat;z-index:5}' +
'#load:before{content:"";position:absolute;top:0;left:0;right:0;bottom:0;background:radial-gradient(ellipse at center,rgba(12,11,17,.5),rgba(12,11,17,.93))}' +
'#load .lwrap{position:absolute;top:50%;left:0;right:0;transform:translateY(-50%);text-align:center}' +
'#lname{display:inline-block;font-size:58px;font-weight:700;max-width:84%;text-shadow:0 4px 24px #000;animation:breathe 2.8s ease-in-out infinite}' +
'#lname img{display:block;margin:0 auto}' +
'@keyframes breathe{0%,100%{transform:scale(1);opacity:.8}50%{transform:scale(1.04);opacity:1}}' +
'#sub{position:fixed;left:6%;right:6%;bottom:8%;text-align:center;line-height:1.35;z-index:3;pointer-events:none}' +
'#sub span{display:inline-block;font-size:38px;color:#fff;text-shadow:0 2px 7px #000,0 0 3px #000}' +
'#bar{position:fixed;left:0;right:0;bottom:0;padding:28px 52px 40px;box-sizing:border-box;background:linear-gradient(transparent,rgba(0,0,0,.92));opacity:0;transition:opacity .2s;z-index:4}' +
'#bar.show{opacity:1}' +
'#title{font-size:46px;font-weight:800;letter-spacing:.3px;margin-bottom:6px;text-shadow:0 2px 10px #000}' +
'#tse{font-size:28px;font-weight:600;color:#c9b8ff;letter-spacing:.4px;margin:0 0 16px;text-shadow:0 1px 6px #000}' +
'#tse:empty{display:none}' +
'#buf{position:fixed;top:0;left:0;right:0;bottom:0;display:none;align-items:center;justify-content:center;background:rgba(12,11,17,.5);z-index:8}' +
'#bufart{font-size:54px;font-weight:800;text-align:center;max-width:80%;text-shadow:0 4px 24px #000;animation:breathe 2.6s ease-in-out infinite}' +
'#bufart img{max-width:60%;max-height:34vh;filter:drop-shadow(0 6px 26px #000)}' +
'#seekind{position:fixed;top:32%;left:0;right:0;transform:translateY(-50%);text-align:center;font-size:60px;font-weight:800;letter-spacing:1px;opacity:0;transition:opacity .18s;text-shadow:0 4px 20px #000,0 0 44px rgba(0,0,0,.9);z-index:12;pointer-events:none;color:#fff}' +
'#toast{position:fixed;left:50%;top:8%;transform:translateX(-50%);background:rgba(20,18,30,.86);color:#fff;font-size:24px;font-weight:600;padding:12px 26px;border-radius:30px;opacity:0;transition:opacity .25s;z-index:9;pointer-events:none;box-shadow:0 8px 30px rgba(0,0,0,.5)}' +
'#seekrow{display:flex;align-items:center;gap:26px}' +
'#seek{position:relative;flex:1;height:6px;background:rgba(255,255,255,.22);border-radius:3px}' +
'#fill{position:absolute;left:0;top:0;height:100%;width:0;background:linear-gradient(90deg,#8c5cff,#b794ff);border-radius:3px;transition:width .18s ease}' +
'#knob{position:absolute;top:50%;left:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.6),0 0 0 4px rgba(140,92,255,.35);transition:left .18s ease,width .15s ease,height .15s ease,margin .15s ease}' +
'#seek.seeking{height:8px}' +
'#seek.seeking #knob{width:26px;height:26px;margin:-13px 0 0 -13px;box-shadow:0 2px 16px rgba(0,0,0,.7),0 0 0 7px rgba(140,92,255,.55)}' +
'#time{font-size:26px;font-variant-numeric:tabular-nums;opacity:.92;white-space:nowrap}' +
'#row{position:relative;height:104px;margin-top:20px}' +
'#ctr{position:absolute;left:50%;top:0;transform:translateX(-50%);display:flex;align-items:center;gap:40px}' +
'#rgt{position:absolute;right:0;top:8px;display:flex;align-items:center;gap:24px}' +
'.pbtn{width:86px;height:86px;border-radius:50%;background:rgba(255,255,255,.13);display:flex;align-items:center;justify-content:center;font-size:34px}' +
'.pbtn svg{fill:currentColor;display:block}' +
'.pbtn i{display:inline-block}' +
'.ic-play{width:0;height:0;border-style:solid;border-width:19px 0 19px 31px;border-color:transparent transparent transparent currentColor;margin-left:7px}' +
'.ic-pause{width:30px;height:38px;position:relative}' +
'.ic-pause:before,.ic-pause:after{content:"";position:absolute;top:0;bottom:0;width:10px;background:currentColor;border-radius:2px}' +
'.ic-pause:before{left:1px}.ic-pause:after{right:1px}' +
'.pbtn.big{width:102px;height:102px;font-size:44px;margin-top:-8px}' +
'.pbtn.wide{width:auto;border-radius:46px;padding:0 40px;font-size:27px;font-weight:700}' +
'.pbtn.f{background:#fff;color:#000}' +
'#pv{position:fixed;top:0;left:0;right:0;bottom:0;background:linear-gradient(to right,rgba(0,0,0,.82),transparent 58%),linear-gradient(to top,rgba(0,0,0,.65),transparent 35%),linear-gradient(to bottom,rgba(0,0,0,.55),transparent 28%);opacity:0;transition:opacity .45s;pointer-events:none;z-index:2}' +
'#pv.show{opacity:1}' +
'#pvBox{position:absolute;left:56px;top:76px;max-width:58%}' +
'#pvLbl{font-size:23px;color:rgba(255,255,255,.65);letter-spacing:2.4px;text-transform:uppercase;margin-bottom:12px}' +
'#pvTitle{font-size:62px;font-weight:800;line-height:1.08;text-shadow:0 3px 16px #000}' +
'#pvSe{margin-top:12px;font-size:28px;color:#c9b8ff;font-weight:600}' +
'#pvSe:empty{display:none}' +
'#pvBadges{margin-top:28px}' +
'.bdg{display:inline-block;padding:9px 20px;border:2px solid rgba(255,255,255,.42);border-radius:9px;font-size:23px;font-weight:600;margin:0 14px 12px 0;color:rgba(255,255,255,.95)}' +
'.bdg.cert{background:rgba(255,255,255,.18);border-color:transparent;font-weight:800}' +
'#np{position:fixed;right:52px;bottom:210px;background:rgba(15,13,22,.97);border-radius:16px;padding:22px;display:none;z-index:7;width:470px;box-shadow:0 12px 44px rgba(0,0,0,.65)}' +
'#np.show{display:block}' +
'#npL{font-size:20px;color:rgba(255,255,255,.6);letter-spacing:1.6px;text-transform:uppercase}' +
'#npT{margin-top:8px;font-size:27px;font-weight:700;line-height:1.3;max-height:74px;overflow:hidden}' +
'#npI{width:100%;height:250px;border-radius:10px;margin-top:14px;background:#000;display:none;object-fit:cover}' +
'#npB{margin-top:16px;padding:14px 0;border-radius:10px;text-align:center;font-size:26px;font-weight:700;background:rgba(255,255,255,.14)}' +
'#np.f #npB{background:#fff;color:#000}' +
'#npH{margin-top:10px;font-size:19px;color:rgba(255,255,255,.5);text-align:center}' +
'#spv{position:fixed;top:50%;left:50%;width:512px;height:288px;margin:-176px 0 0 -256px;border-radius:14px;background:#0a0a10;display:none;z-index:9;overflow:hidden;box-shadow:0 16px 60px rgba(0,0,0,.85),0 0 0 3px rgba(255,255,255,.16)}' +
'#spv img{width:100%;height:100%;object-fit:cover}' +
'#spv.load:before{content:"";position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(90deg,#141220,#201c33,#141220);background-size:200% 100%;animation:shim 1.1s linear infinite}' +
'@keyframes shim{0%{background-position:200% 0}100%{background-position:-200% 0}}' +
'#spvT{position:absolute;left:0;right:0;bottom:0;text-align:center;font-size:28px;font-weight:800;padding:12px 0;background:linear-gradient(transparent,rgba(0,0,0,.75));text-shadow:0 2px 8px #000}' +
'#menu{position:fixed;right:52px;bottom:190px;min-width:360px;max-height:64%;overflow:auto;background:rgba(20,18,30,.97);border-radius:14px;padding:12px;display:none;z-index:6}' +
'#menu.show{display:block}' +
'.mi{padding:16px 22px;font-size:25px;border-radius:8px}' +
'.mi.f{background:#8c5cff}' +
'.mi.on{color:#cdbcff;font-weight:600}' +
'.mh{padding:12px 22px;font-size:17px;opacity:.6;text-transform:uppercase}' +
'</style></head><body>' +
'<video id="v" autoplay></video>' +
'<div id="sub"></div>' +
'<div id="buf"><div id="bufart"></div></div>' +
'<div id="seekind"></div>' +
'<div id="toast"></div>' +
'<div id="load"><div class="lwrap"><div id="lname"></div></div></div>' +
'<div id="pv"><div id="pvBox"><div id="pvLbl">Paused</div><div id="pvTitle"></div><div id="pvSe"></div><div id="pvBadges"></div></div></div>' +
'<div id="np"><div id="npL">Next episode</div><div id="npT"></div><img id="npI"><div id="npB">Play next</div><div id="npH">Press Up to select</div></div>' +
'<div id="spv"><img id="spvi"><div id="spvT"></div></div>' +
'<div id="bar"><div id="title"></div><div id="tse"></div><div id="seekrow"><div id="seek"><div id="fill"></div><div id="knob"></div></div><div id="time">0:00 / 0:00</div></div>' +
'<div id="row"><div id="ctr"><div class="pbtn" id="b_rw"><svg viewBox="0 0 24 24" width="42" height="42"><path d="M12 6v12l-9-6 9-6zM22 6v12l-9-6 9-6z"/></svg></div><div class="pbtn big" id="b_pp"><i class=ic-pause></i></div><div class="pbtn" id="b_ff"><svg viewBox="0 0 24 24" width="42" height="42"><path d="M2 6l9 6-9 6V6zM12 6l9 6-9 6V6z"/></svg></div></div><div id="rgt"><div class="pbtn wide" id="b_next" style="display:none">Next episode</div><div class="pbtn" id="b_set"><svg viewBox="0 0 24 24" width="42" height="42"><path d="M19.14 12.94a7.5 7.5 0 000-1.88l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.61-.22l-2.39.96a7.3 7.3 0 00-1.62-.94l-.36-2.54A.5.5 0 0013.5 2h-3a.5.5 0 00-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 00-.61.22L2.7 8.84a.5.5 0 00.12.64l2.03 1.58a7.5 7.5 0 000 1.88L2.82 14.5a.5.5 0 00-.12.64l1.92 3.32a.5.5 0 00.61.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54a.5.5 0 00.5.42h3a.5.5 0 00.5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96a.5.5 0 00.61-.22l1.92-3.32a.5.5 0 00-.12-.64zM12 15.5A3.5 3.5 0 1112 8.5a3.5 3.5 0 010 7z"/></svg></div></div></div></div>' +
'<div id="menu"></div>' +
'<script>(function(){' +
'var URL=' + JSON.stringify(streamUrl) + ',TITLE=' + JSON.stringify(title) + ',TYPE=' + JSON.stringify(ctx.type || '') + ',ID=' + JSON.stringify(ctx.id || '') + ',VID=' + JSON.stringify(ctx.vid || '') + ',LOGO=' + JSON.stringify(meta.logo || '') + ',BG=' + JSON.stringify(meta.background || '') + ',POSTER=' + JSON.stringify(meta.poster || '') + ',SE=' + JSON.stringify(seLine) + ',NEXTVID=' + JSON.stringify(nextVid) + ',NEXTHREF=' + JSON.stringify(nextHref) + ',BACK=' + JSON.stringify(ctx.back || '') + ',NEXTTITLE=' + JSON.stringify(ctx.nextTitle || '') + ',NEXTTHUMB=' + JSON.stringify(ctx.nextThumb || '') + ',SNAME=' + JSON.stringify(String((stream.name || '') + ' ' + (stream.title || stream.description || '')).slice(0, 400)) + ',CERT=' + JSON.stringify((ctx.meta && ctx.meta.cert) || '') + ';' +
'var v=document.getElementById("v"),bar=document.getElementById("bar"),fill=document.getElementById("fill"),' +
'timeEl=document.getElementById("time"),menu=document.getElementById("menu"),subEl=document.getElementById("sub"),' +
'load=document.getElementById("load"),lname=document.getElementById("lname");' +
'document.getElementById("title").textContent=TITLE;' +
'function xhr(u,cb){try{var x=new XMLHttpRequest();x.open("GET",u,true);x.onreadystatechange=function(){if(x.readyState===4){var j=null;try{j=JSON.parse(x.responseText);}catch(e){}cb(j);}};x.send();}catch(e){cb(null);}}' +
// ---- loading art is embedded server-side (no flash): show logo+backdrop now ----
'if(BG)load.style.backgroundImage="url(\\""+BG+"\\")";' +
'var bufArt=document.getElementById("bufart");' +
'if(LOGO){var artHtml="<img src=\\""+LOGO+"\\" style=\\"max-width:64%;max-height:40vh;filter:drop-shadow(0 6px 26px #000)\\">";lname.innerHTML=artHtml;bufArt.innerHTML="<img src=\\""+LOGO+"\\">";}else{lname.textContent=TITLE;bufArt.textContent=TITLE;}' +
'if(SE){document.getElementById("tse").textContent=SE;}' +
'v.src=URL;' +
// ---- resume + Continue Watching (shared with the v4 shell via same-origin localStorage) ----
// The shell keeps watch progress as lib_<first4 of user._id>_<id> items with state.timeOffset
// (ms). We read it to resume and write it so Continue Watching updates after our bare player.
'function libPrefix(){try{var u=JSON.parse(localStorage.getItem("user")||"null");if(u&&u._id)return "lib_"+u._id.slice(0,4)+"_";}catch(e){}for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k.indexOf("lib_")===0){var j=k.indexOf("_",4);if(j>0)return k.slice(0,j+1);}}return "lib_local_";}' +
// one shared account library (lib_<hash>_): progress/watched is pushed to api.strem.io
'var LIBKEY=libPrefix()+ID;' +
// POST helper + push the library item to the account (same datastorePut Stremio uses)
'function xpost(u,body){try{if(u.indexOf("https://api.strem.io/api/")===0)u="/stremioapi?path="+encodeURIComponent(u.slice("https://api.strem.io".length));var x=new XMLHttpRequest();x.open("POST",u,true);x.setRequestHeader("Content-Type","application/json");x.send(JSON.stringify(body));}catch(e){}}' +
'function authKeyLS(){try{return JSON.parse(localStorage.getItem("authKey")||"null");}catch(e){return null;}}' +
'var lastPush=0;' +
'function pushLib(force){var ak=authKeyLS();if(!ak)return;var it=readLib();if(!it||!it._id)return;var n=Date.now();if(!force&&n-lastPush<60000)return;lastPush=n;xpost("https://api.strem.io/api/datastorePut",{authKey:ak,collection:"libraryItem",changes:[it]});}' +
// remember exactly which stream we played so Continue Watching can resume it directly
'try{if(ID)localStorage.setItem("tvstream_"+ID+"_"+(VID||ID),location.search);}catch(e){}' +
// if the name/poster never came back from the server (Cinemeta was slow), fetch it now so
// the Continue Watching entry isn\'t left blank
'if((!TITLE||!POSTER)&&TYPE&&ID){xhr("/meta?type="+encodeURIComponent(TYPE)+"&id="+encodeURIComponent(ID),function(j){if(j){if(!TITLE){TITLE=j.name||"";try{document.getElementById("title").textContent=TITLE;}catch(e){}}if(!POSTER)POSTER=j.poster||"";}});}' +
'function readLib(){try{return JSON.parse(localStorage.getItem(LIBKEY)||"null");}catch(e){return null;}}' +
// NOTE removed:true on auto-created items -> they power Continue Watching (cwItems ignores
// removed) but are kept OUT of the Library grid. Only an explicit + Library flips removed:false.
// Stremio auto-watch semantics: removed:false + temp:true (shows in Library + Continue
// Watching and syncs everywhere). An explicit + Library later flips temp:false.
'function saveProgress(){if(!v.duration||!ID)return;var now=new Date().toISOString();var it=readLib();if(!it||!it.state){it={state:{},_id:ID,removed:false,temp:true,_ctime:now,name:TITLE,type:TYPE,poster:POSTER||"",posterShape:"poster",background:BG||"",logo:LOGO||"",year:""};}else{if(!it.name&&TITLE)it.name=TITLE;if(!it.poster&&POSTER)it.poster=POSTER;if(!it.type&&TYPE)it.type=TYPE;if(!it.posterShape)it.posterShape="poster";}var s=it.state;s.timeOffset=Math.round(v.currentTime*1000);s.duration=Math.round(v.duration*1000);s.video_id=VID||ID;s.lastWatched=now;s.timeWatched=s.timeOffset;if(s.overallTimeWatched==null)s.overallTimeWatched=s.timeOffset;if(s.timesWatched==null)s.timesWatched=0;if(s.flaggedWatched==null)s.flaggedWatched=0;if(s.season==null)s.season=0;if(s.episode==null)s.episode=0;if(!s.watchedEpisodes)s.watchedEpisodes=[];if(s.noNotif==null)s.noNotif=false;if(s.watched==null)s.watched="";it.state=s;it._mtime=now;if(it.removed==null)it.removed=false;if(it.temp==null)it.temp=true;try{localStorage.setItem(LIBKEY,JSON.stringify(it));}catch(e){}}' +
'var didResume=false;function tryResume(){if(didResume)return;didResume=true;var it=readLib();if(it&&it.state&&it.state.video_id===(VID||ID)&&it.state.timeOffset>5000){var sec=it.state.timeOffset/1000;if(!it.state.duration||sec<it.state.duration/1000-30){try{v.currentTime=sec;showToast("Resuming from "+fmt(sec));}catch(e){}}}}' +
'v.addEventListener("loadeddata",tryResume);v.addEventListener("canplay",tryResume);' +
'setInterval(function(){if(!v.paused){saveProgress();pushLib(false);if(v.duration&&v.currentTime/v.duration>0.95)markWatchedLocal();}},10000);v.addEventListener("pause",function(){saveProgress();pushLib(true);});v.addEventListener("ended",function(){saveProgress();pushLib(true);});' +
// local watched flag: add this video id to state.watchedEpisodes (drives the beta checkmarks)
'function markWatchedLocal(){try{var it=readLib();if(!it||!it.state)return;var wv=VID||ID;if(!it.state.watchedEpisodes)it.state.watchedEpisodes=[];for(var i=0;i<it.state.watchedEpisodes.length;i++)if(it.state.watchedEpisodes[i]===wv)return;it.state.watchedEpisodes.push(wv);it.state.flaggedWatched=1;it._mtime=new Date().toISOString();localStorage.setItem(LIBKEY,JSON.stringify(it));pushLib(true);}catch(e){}}' +
// binge: when the episode ends, jump straight to the next one (detail deep-link opens its streams)
'v.addEventListener("ended",function(){markWatchedLocal();var binge=(lsGet("bingeWatch","true")!=="false")&&(lsGet("enableNextVideo","true")!=="false");if(binge&&NEXTHREF){showToast("Next episode\\u2026");setTimeout(function(){location.replace(NEXTHREF);},600);}});' +
// ---- external subtitles (English first) ----
'var extSubs=[],cues=null,embTrack=null,subSize=38,subColor="#fff",subOutline="#000000",subBgOp=0,curSub="off",subDelay=0,subView="root",extLang="";' +
// ---- pull the shell Settings (same-origin localStorage) so they drive OUR player ----
'function lsGet(k,d){try{var v=localStorage.getItem(k);return v==null?d:v;}catch(e){return d;}}' +
'var SIZEPCT={"0":72,"1":80,"2":100,"3":120,"4":140,"5":160,"6":180};' +
'subSize=Math.round(38*((SIZEPCT[lsGet("subtitleSize","2")]||100)/100));' +
'subColor=lsGet("subsColor","#ffffff");subOutline=lsGet("subsOutlineColor","#000000");subBgOp=parseFloat(lsGet("subsBgStyle","0"))||0;' +
'var SEEKSTEP=parseInt(lsGet("seekStep","10"),10)||10;' +
'var EMBMODE=lsGet("embSubsMode","server");' + // "server"=our ffmpeg extraction, "native"=TV textTracks
'var PREVIEW_ON=(lsGet("scrubPreview","false")==="true");' +
// default to English auto-subs when the setting was NEVER configured; a stored "" = user chose Off
'var rawSub=lsGet("subsLang",null);if(rawSub==null)rawSub=lsGet("subtitles",null);var WANTSUB=(rawSub==null?"eng":rawSub).toLowerCase();' +
'var WANTAUD=(lsGet("enableDefaultAudioTrack","false")==="true")?(lsGet("defaultAudioTrack","")||"").toLowerCase():"";' +
'var embTracks=null,embTracksLoading=false,embTracksLoaded=false,embErr="",embReopenArmed=false,embN=-1,embPollAt=0,embFirst=false;' +
'var autoSubDone=false;function autoSub(){if(autoSubDone||curSub!=="off"||!WANTSUB)return;for(var i=0;i<extSubs.length;i++){if((extSubs[i].lang||"").toLowerCase()===WANTSUB){autoSubDone=true;setExtSub(extSubs[i].u);showToast("Subtitles: "+extSubs[i].name);return;}}}' +
'if(TYPE&&VID){xhr("/subs?type="+encodeURIComponent(TYPE)+"&vid="+encodeURIComponent(VID),function(j){if(j&&j.subtitles){extSubs=j.subtitles;autoSub();}});}' +
// honour the Settings default audio language: enable the matching embedded audio track
'var autoAudDone=false;function autoAudio(){if(autoAudDone||!WANTAUD)return;try{var ts=v.audioTracks;if(!ts||!ts.length)return;for(var i=0;i<ts.length;i++){var l=(ts[i].language||"").toLowerCase();if(l===WANTAUD||l.indexOf(WANTAUD)===0||WANTAUD.indexOf(l)===0){autoAudDone=true;for(var j=0;j<ts.length;j++)ts[j].enabled=(j===i);return;}}}catch(e){}}' +
'v.addEventListener("loadeddata",autoAudio);v.addEventListener("canplay",autoAudio);' +
// On this CPU, ffprobe during startup makes the remote stutter. Probe only when
// the user actually opens the subtitle menu.
'function ensureEmbTracks(){if(embTracksLoaded||embTracksLoading)return;embTracksLoading=true;xhr("/embtracks?u="+encodeURIComponent(URL),function(j){embTracksLoading=false;embTracksLoaded=true;embTracks=(j&&j.tracks)||[];embErr=(j&&j.err)||"";});}' +
'function setExtSub(u){curSub="ext:"+u;embTrack=null;embN=-1;cues=null;subEl.innerHTML="";for(var i=0;i<v.textTracks.length;i++){try{v.textTracks[i].mode="disabled";}catch(e){}}xhr("/sub?u="+encodeURIComponent(u),function(j){cues=(j&&j.cues)||[];});}' +
// embedded: the TV never exposes MKV sub cues to JS (textTracks empty), so the server
// demuxes them with ONE sequential ffmpeg read (~9x realtime) and we poll for new cues
// (append-only) rendered in OUR overlay; finished tracks are disk-cached server-side.
'function embQS(){return "u="+encodeURIComponent(URL)+"&n="+embN+"&id="+encodeURIComponent(ID)+"&vid="+encodeURIComponent(VID);}' +
'function pollEmbCues(){if(embN<0)return;var want=embN;' +
'xhr("/embcues?"+embQS()+"&since="+(cues?cues.length:0)+"&t="+(v.currentTime|0),function(j){' +
'if(want!==embN||!j)return;' +
'if(j.gone){setEmbSub(embN);return;}' + // server restarted / job reaped -> re-kick
'if(j.cues&&j.cues.length){if(!cues)cues=[];for(var i=0;i<j.cues.length;i++)cues.push(j.cues[i]);subEl._t=null;' +
'if(!embFirst){embFirst=true;showToast("Subtitles ready");}}' +
'if(j.err&&!cues.length){showToast("Subtitle extraction failed");}' +
'});}' +
// TRY NATIVE: the TV already decodes the MKV; ask its pipeline to render this text track
// (mode="showing"). Far better than demuxing over the network if the TV exposes the tracks.
'function setEmbSub(n,ti){curSub="emb:"+n;embTrack=null;embN=n;cues=[];embFirst=false;subEl.innerHTML="";' +
// Settings: "native" tries the TV's own text track (usually empty on this TV -> falls back)
'if(EMBMODE==="native"){var ok=false;try{for(var i=0;i<v.textTracks.length;i++)v.textTracks[i].mode="disabled";var tt=v.textTracks[ti||0];if(tt){tt.mode="showing";ok=true;}}catch(e){}if(ok){showToast("Native subtitles on");return;}showToast("No native track \\u2014 extracting\\u2026");}' +
'xhr("/embstart?"+embQS()+"&t="+(v.currentTime|0),function(j){' +
'if(embN!==n||!j)return;' +
'if(j.cues&&j.cues.length){cues=j.cues;subEl._t=null;embFirst=true;showToast(j.cached?"Subtitles loaded":"Subtitles ready");}' +
'else if(j.started){showToast("Preparing subtitles\\u2026");}' +
'else if(j.err){showToast("No embedded subtitles");}' +
'});}' +
'function subsOff(){curSub="off";embTrack=null;embN=-1;cues=null;subEl.innerHTML="";}' +
'function subStyle(){var o=subOutline;var sh="text-shadow:-2px 0 "+o+",2px 0 "+o+",0 -2px "+o+",0 2px "+o+",-1px -1px "+o+",1px 1px "+o+",0 0 5px "+o+";";var bg=subBgOp>0?("background:rgba(0,0,0,"+subBgOp+");padding:2px 16px;border-radius:8px;"):"";return "font-size:"+subSize+"px;color:"+subColor+";"+sh+bg;}' +
'function renderSub(){if(curSub==="off")return;var txt="";if(cues&&cues.length){var t=v.currentTime-subDelay;for(var i=0;i<cues.length;i++){if(t>=cues[i].s&&t<=cues[i].e){txt=cues[i].t;break;}}}if(subEl._t!==txt){subEl._t=txt;subEl.innerHTML=txt?("<span style=\\""+subStyle()+"\\">"+txt.replace(/\\n/g,"<br>")+"</span>"):"";}}' +
'function updatePP(){var b=document.getElementById("b_pp");b.innerHTML=v.paused?"<i class=ic-play></i>":"<i class=ic-pause></i>";}' +
'v.addEventListener("play",updatePP);v.addEventListener("pause",updatePP);' +
'if(NEXTVID){document.getElementById("b_next").style.display="";}' +
'var btns=[];(function(){var ids=["b_rw","b_pp","b_ff","b_next","b_set"];for(var i=0;i<ids.length;i++){var el=document.getElementById(ids[i]);if(el&&el.style.display!=="none"){el._base=el.className;btns.push(el);}}})();' +
'function nextEp(){if(NEXTHREF){try{saveProgress();markWatchedLocal();}catch(e){}location.replace(NEXTHREF);}}' +
'var mode="video",bIdx=1,mIdx=0,menuItems=[],hideT=null;' +
'function fmt(s){s=Math.max(0,s|0);var h=(s/3600)|0,m=((s%3600)/60)|0,x=s%60;function p(n){return(n<10?"0":"")+n;}return(h?h+":"+p(m):m)+":"+p(x);}' +
'function showBar(){bar.className="show";if(hideT)clearTimeout(hideT);hideT=setTimeout(function(){if(mode==="video"){bar.className="";}},4000);}' +
'function paintBtns(){for(var i=0;i<btns.length;i++)btns[i].className=btns[i]._base+(mode==="controls"&&i===bIdx?" f":"");}' +
'function hideLoad(){load.style.display="none";}' +
'v.addEventListener("playing",hideLoad);v.addEventListener("loadeddata",function(){setTimeout(hideLoad,300);});' +
'v.addEventListener("error",function(){lname.textContent="Playback error";});' +
// buffering: dim the frozen frame and breathe the art (the same look as initial load)
'var bufEl=document.getElementById("buf");' +
'function showBuf(){if(load.style.display==="none"&&!v.paused){bufEl.style.display="-webkit-flex";bufEl.style.display="flex";}}' +
'function hideBuf(){bufEl.style.display="none";}' +
// a pause fires "waiting"/"stalled" on this TV too; only treat it as buffering while playing
'v.addEventListener("waiting",showBuf);v.addEventListener("stalled",showBuf);v.addEventListener("playing",hideBuf);v.addEventListener("canplay",hideBuf);v.addEventListener("seeked",hideBuf);v.addEventListener("pause",hideBuf);' +
'v.addEventListener("timeupdate",function(){if(seekTarget<0&&!v.paused)hideBuf();if(v.duration&&seekTarget<0){var pct=v.currentTime/v.duration*100;fill.style.width=pct+"%";knob.style.left=pct+"%";timeEl.textContent=fmt(v.currentTime)+" / "+fmt(v.duration);}' +
'renderSub();});' +
// poll on a TIMER, not timeupdate: cues keep arriving while paused / after playback ends
'setInterval(function(){if(embN>=0)pollEmbCues();},4000);' +
'function tog(){if(v.paused)v.play();else v.pause();showBar();}' +
'var seekEl=document.getElementById("seekind"),knob=document.getElementById("knob"),seekBar=document.getElementById("seek"),seekHideT=null,seekTarget=-1,seekTimer=null;' +
'var toastEl=document.getElementById("toast"),toastT=null;function showToast(m){if(!toastEl)return;toastEl.textContent=m;toastEl.style.opacity="1";if(toastT)clearTimeout(toastT);toastT=setTimeout(function(){toastEl.style.opacity="0";},3200);}' +
// seeks accumulate while you keep pressing (+10, +20, ...) and only commit ~0.5s after
// you stop, so the bar/knob glide to the target and we buffer once instead of every press.
'function fmtDelta(d){var a=Math.abs(d),s=(d>=0?"+":"-");if(a>=60){var m=(a/60)|0,x=a%60;return s+m+"m"+(x?(" "+x+"s"):"");}return s+a+"s";}' +
'function showSeekInd(){var d=Math.round(seekTarget-v.currentTime);seekEl.textContent=fmtDelta(d);seekEl.style.opacity="1";if(seekHideT){clearTimeout(seekHideT);seekHideT=null;}}' +
'function paintSeek(){if(!v.duration)return;var pct=Math.max(0,Math.min(100,seekTarget/v.duration*100));fill.style.width=pct+"%";knob.style.left=pct+"%";timeEl.textContent=fmt(seekTarget)+" / "+fmt(v.duration);}' +
'function commitSeek(){if(seekTarget<0)return;var tgt=seekTarget;seekTarget=-1;seekTimer=null;seekBar.className="";v.currentTime=tgt;showBuf();if(embN>=0){embPollAt=Date.now();pollEmbCues();}if(seekHideT)clearTimeout(seekHideT);seekHideT=setTimeout(function(){seekEl.style.opacity="0";},700);}' +
'function seek(d){if(!v.duration)return;var base=seekTarget>=0?seekTarget:v.currentTime;seekTarget=Math.max(0,Math.min(v.duration,base+d));seekBar.className="seeking";showSeekInd();paintSeek();schedPreview();showBar();if(seekTimer)clearTimeout(seekTimer);seekTimer=setTimeout(commitSeek,1200);}' +
'var exited=false;function exit(){if(exited)return;exited=true;try{saveProgress();pushLib(true);}catch(e){}try{v.pause();}catch(e){}' +
'try{window.removeEventListener("popstate",onPop);}catch(e){}' +
// one clean dark cover (same bg as the Stremio splash) so there is no flash, then a flag so
// the shell shows a single "Taking you back to Stremio" loading splash.
'try{var cov=document.createElement("div");cov.id="gocov";document.body.appendChild(cov);}catch(e){}' +
'try{sessionStorage.setItem("tvBack","1");}catch(e){}' +
'var st=null;try{st=history.state;}catch(e){}' +
'try{new Image().src="http://127.0.0.1:8082/log?ev=exit&hl="+history.length+"&tv="+((st&&st.tv)?1:0)+"&t="+(v.currentTime|0);}catch(e){}' +
// Adaptive: if our dummy is still the CURRENT entry (Back didn\'t pop it), drop dummy + /play
// with go(-2); otherwise the Back already popped the dummy and /play is current, so replace it.
// Either way /play is removed from history, so a second Back can\'t loop into the player.
'if(st&&st.tv){try{history.go(-2);return;}catch(e){}}' +
'location.replace("http://127.0.0.1:8082/"+(BACK||""));}' +
'function repush(){try{history.pushState({tv:1},"");}catch(e){}}' +
'function goBack(){if(npFocus){npFocus=false;npShown=false;npDismissed=true;paintNp();repush();}else if(mode==="menu"){menuBack();repush();}else if(mode==="controls"){mode="video";paintBtns();repush();}else{exit();}}' +
// This TV delivers Back as a history pop. We keep ONE dummy entry: popstate closes the
// menu/controls (re-pushing to stay), or exits when nothing is open.
'try{history.pushState({tv:1},"");}catch(e){}' +
'function onPop(){goBack();}window.addEventListener("popstate",onPop);' +
// ---- menus (subtitles = Off + external English-first + embedded; audio = embedded) ----
'function openMenu(view){subView=view;menuItems=[];var html="";if(view==="subsroot"||view==="embedded")ensureEmbTracks();' +
'if(view==="root"){html+="<div class=mh>Settings</div>";html+="<div class=mi>Audio \\u203a</div>";menuItems.push({k:"go",to:"audio"});html+="<div class=mi>Subtitles \\u203a</div>";menuItems.push({k:"go",to:"subsroot"});}' +
'else if(view==="audio"){html+="<div class=mh>Audio</div>";try{for(var a=0;a<v.audioTracks.length;a++){var at=v.audioTracks[a];html+="<div class=\\"mi"+(at.enabled?" on":"")+"\\">"+(at.label||at.language||("Audio "+(a+1)))+(at.enabled?"":"")+"</div>";menuItems.push({k:"aud",idx:a});}}catch(e){}if(!menuItems.length)html+="<div class=mi style=\\"opacity:.5\\">None</div>";}' +
'else if(view==="subsroot"){html+="<div class=mh>Subtitles</div>";var f0=(curSub==="off");html+="<div class=\\"mi"+(f0?" on":"")+"\\">Off"+(f0?"":"")+"</div>";menuItems.push({k:"off"});html+="<div class=mi>Embedded \\u203a</div>";menuItems.push({k:"go",to:"embedded"});html+="<div class=mi>External \\u203a</div>";menuItems.push({k:"go",to:"external"});html+="<div class=mi>Style \\u203a</div>";menuItems.push({k:"go",to:"style"});if(curSub.indexOf("ext:")===0){html+="<div class=mi>Delay \\u203a</div>";menuItems.push({k:"go",to:"delay"});}}' +
'else if(view==="embedded"){html+="<div class=mh>Embedded</div>";if(embTracksLoading||embTracks===null){html+="<div class=mi style=\\"opacity:.5\\">Reading tracks\\u2026</div>";if(!embReopenArmed){embReopenArmed=true;var iv=setInterval(function(){if(!embTracksLoading){clearInterval(iv);embReopenArmed=false;if(subView==="embedded")reopen();}},400);}}else if(embErr){html+="<div class=mi style=\\"opacity:.6;white-space:normal;font-size:22px\\">"+embErr+"</div>";}else if(!embTracks.length){html+="<div class=mi style=\\"opacity:.5\\">None in this file</div>";}else{for(var j=0;j<embTracks.length;j++){var et=embTracks[j];var fb=(curSub==="emb:"+et.n);html+="<div class=\\"mi"+(fb?" on":"")+"\\">"+et.name+(fb?"":"")+"</div>";menuItems.push({k:"emb",idx:et.n,ti:et.ti});}}}' +
'else if(view==="external"){html+="<div class=mh>External \\u2014 language</div>";if(!extSubs.length)html+="<div class=mi style=\\"opacity:.5\\">None found</div>";var seen={};for(var i=0;i<extSubs.length;i++){var L=extSubs[i].lang;if(!seen[L]){seen[L]=1;html+="<div class=mi>"+extSubs[i].name+" \\u203a</div>";menuItems.push({k:"lang",lang:L});}}}' +
'else if(view==="extlang"){var nm="";for(var i=0;i<extSubs.length;i++){if(extSubs[i].lang===extLang){nm=extSubs[i].name;break;}}html+="<div class=mh>"+nm+" subtitles</div>";var c=0;for(var i=0;i<extSubs.length;i++){if(extSubs[i].lang===extLang){c++;var fe=(curSub==="ext:"+extSubs[i].u);html+="<div class=\\"mi"+(fe?" on":"")+"\\">"+nm+" "+c+(fe?"":"")+"</div>";menuItems.push({k:"ext",u:extSubs[i].u});}}}' +
'else if(view==="style"){html+="<div class=mh>Style</div>";html+="<div class=mi>Text bigger</div>";menuItems.push({k:"size+"});html+="<div class=mi>Text smaller</div>";menuItems.push({k:"size-"});html+="<div class=mi>Colour: "+(subColor.toLowerCase()==="#ffe600"?"Yellow":"White")+"</div>";menuItems.push({k:"color"});html+="<div class=mi>Background: "+(subBgOp>0?"On":"Off")+"</div>";menuItems.push({k:"bg"});}' +
'else if(view==="delay"){html+="<div class=mh>Delay: "+(subDelay>0?"+":"")+subDelay.toFixed(1)+"s</div>";html+="<div class=mi>Later (+0.5s)</div>";menuItems.push({k:"d+"});html+="<div class=mi>Earlier (-0.5s)</div>";menuItems.push({k:"d-"});html+="<div class=mi>Reset</div>";menuItems.push({k:"d0"});}' +
'menu.innerHTML=html;menu.className="show";mode="menu";mIdx=0;paintMenu();}' +
'function paintMenu(){var els=menu.querySelectorAll(".mi");for(var i=0;i<els.length;i++)els[i].className="mi"+(i===mIdx?" f":"");if(els[mIdx])els[mIdx].scrollIntoView(false);}' +
'function reopen(){var keep=mIdx;openMenu(subView);mIdx=keep;paintMenu();}' +
'function menuBack(){if(subView==="embedded"||subView==="external"||subView==="style"||subView==="delay")openMenu("subsroot");else if(subView==="extlang")openMenu("external");else if(subView==="audio"||subView==="subsroot")openMenu("root");else{menu.className="";mode="controls";paintBtns();}}' +
'function chooseMenu(){var it=menuItems[mIdx];if(!it){menuBack();return;}' +
'if(it.k==="go"){openMenu(it.to);return;}if(it.k==="lang"){extLang=it.lang;openMenu("extlang");return;}' +
'if(it.k==="size+"){subSize=Math.min(76,subSize+4);subEl._t=null;reopen();return;}if(it.k==="size-"){subSize=Math.max(20,subSize-4);subEl._t=null;reopen();return;}' +
'if(it.k==="color"){subColor=(subColor.toLowerCase()==="#ffe600"?"#ffffff":"#ffe600");subEl._t=null;reopen();return;}if(it.k==="bg"){subBgOp=(subBgOp>0?0:0.6);subEl._t=null;reopen();return;}' +
'if(it.k==="d+"){subDelay+=0.5;reopen();return;}if(it.k==="d-"){subDelay-=0.5;reopen();return;}if(it.k==="d0"){subDelay=0;reopen();return;}' +
'if(it.k==="off")subsOff();else if(it.k==="ext")setExtSub(it.u);else if(it.k==="emb")setEmbSub(it.idx,it.ti);else if(it.k==="aud"){try{for(var j=0;j<v.audioTracks.length;j++)v.audioTracks[j].enabled=(j===it.idx);}catch(e){}}closeMenu();}' +
'function closeMenu(){menu.className="";mode="controls";paintBtns();showBar();}' +
// ---- paused vignette: title + tech badges (ffprobe via /probe, stream-name text as instant fallback) ----
'var pv=document.getElementById("pv");' +
// title = the cover-art LOGO image when we have one (Netflix-style), else clean text; no S/E up here
'(function(){var pt=document.getElementById("pvTitle");if(LOGO){pt.innerHTML="<img src=\\""+LOGO+"\\" style=\\"max-width:640px;max-height:210px;display:block\\">";}else{pt.textContent=TITLE;}})();' +
'function fillBadges(j){var host=document.getElementById("pvBadges");host.innerHTML="";' +
'function ab(t,cls){if(!t)return;var d=document.createElement("div");d.className="bdg"+(cls?" "+cls:"");d.textContent=t;host.appendChild(d);}' +
'if(CERT)ab(CERT,"cert");' +
'var sn=SNAME.toLowerCase();' +
'var rs=(j&&j.res)||(sn.indexOf("2160")>=0||sn.indexOf("4k")>=0?"4K":(sn.indexOf("1080")>=0?"1080p":(sn.indexOf("720")>=0?"720p":"")));ab(rs);' +
'var hd=(j&&j.hdr)||"";if(!hd){if(/dolby.?vision|\\bdv\\b|dovi/.test(sn))hd="Dolby Vision";else if(sn.indexOf("hdr10+")>=0)hd="HDR10+";else if(sn.indexOf("hdr")>=0)hd="HDR";}ab(hd);' +
'var au="";if(sn.indexOf("atmos")>=0)au="Dolby Atmos";if(!au&&j&&j.audio)au=j.audio;if(!au){if(/ddp|dd\\+|eac3|e-ac-3/.test(sn))au="Dolby Digital+";else if(/\\bac3\\b|dolby.?digital/.test(sn))au="Dolby Digital";else if(sn.indexOf("dts")>=0)au="DTS";}ab(au);' +
'if(j&&j.vcodec)ab(j.vcodec);if(j&&j.size)ab(j.size);}' +
'fillBadges(null);' +
'var techProbed=false;function ensureTechProbe(){if(techProbed)return;techProbed=true;xhr("/probe?u="+encodeURIComponent(URL),function(j){if(j)fillBadges(j);});}' +
'var pvT=null;' +
'v.addEventListener("pause",function(){ensureTechProbe();if(pvT)clearTimeout(pvT);pvT=setTimeout(function(){if(v.paused&&mode!=="menu"&&load.style.display==="none")pv.className="show";},350);});' +
'v.addEventListener("play",function(){if(pvT)clearTimeout(pvT);pv.className="";});' +
// ---- end-of-title popup (last 3 min): series -> next episode; movie -> "watch something similar" ----
'var SIMHREF=(BACK.indexOf("beta")===0&&TYPE&&ID&&!NEXTHREF)?("http://127.0.0.1:8082/beta#sim/"+encodeURIComponent(TYPE)+"/"+encodeURIComponent(ID)):"";' +
'var POPHREF=NEXTHREF||SIMHREF,isNextEp=!!NEXTHREF;' +
'var np=document.getElementById("np"),npShown=false,npFocus=false,npDismissed=false;' +
'function paintNp(){np.className=npShown?("show"+(npFocus?" f":"")):"";}' +
'(function(){var L=document.getElementById("npL"),T=document.getElementById("npT"),B=document.getElementById("npB");' +
'if(isNextEp){L.textContent="Next episode";B.textContent="Play next";' +
'if(NEXTTITLE)T.textContent=NEXTTITLE;else if(NEXTVID&&NEXTVID.indexOf(":")>0){var npp=NEXTVID.split(":");T.textContent="S"+npp[npp.length-2]+" E"+npp[npp.length-1];}' +
'if(NEXTTHUMB){var npi=document.getElementById("npI");npi.onload=function(){npi.style.display="block";};npi.src=NEXTTHUMB;}}' +
'else if(SIMHREF){L.textContent="Liked this?";T.textContent="Watch something similar";B.textContent="Find similar";}})();' +
'function npGo(){if(isNextEp)nextEp();else if(SIMHREF){try{saveProgress();}catch(e){}location.replace(SIMHREF);}}' +
'function checkNp(){if(!POPHREF||npDismissed||!v.duration)return;var rem=v.duration-v.currentTime;' +
'if(rem<=180&&rem>2&&!npShown){npShown=true;paintNp();}' +
'else if(rem>180&&npShown){npShown=false;npFocus=false;paintNp();}}' +
'v.addEventListener("timeupdate",checkNp);' +
// ---- scrub previews: /frame grabs one small jpeg at the seek target (debounced) ----
// Centered Netflix-style preview: shimmer while a frame loads, keep the LAST frame instead of
// flashing black, and only re-fetch per 10s bucket. spvi loads async; on load it reveals.
'var spv=document.getElementById("spv"),spvImg=document.getElementById("spvi"),spvTime=document.getElementById("spvT"),spvT=null,spvLast=-1;' +
'spvImg.addEventListener("load",function(){if(spvImg.naturalWidth>0){spvImg.style.opacity="1";spv.className="";}});' +
// kick background sprite extraction ~4s after playback starts (once, when duration is known)
'var spriteKicked=false;function kickSprite(){if(!PREVIEW_ON||spriteKicked||!v.duration||v.duration===Infinity)return;spriteKicked=true;xhr("/spritegen?u="+encodeURIComponent(URL)+"&dur="+Math.floor(v.duration),function(){});}' +
'function schedPreview(){if(!v.duration)return;' +
'if(!PREVIEW_ON){spv.style.display="none";return;}' + // Settings: Scrubbing previews Off
'kickSprite();' +
'spv.style.display="block";spvTime.textContent=fmt(seekTarget)+"  /  "+fmt(v.duration);' +
// /frame snaps to the nearest already-extracted sprite -> returns instantly (or 204 if that
// region isn\'t baked yet, in which case the shimmer/last frame stays)
'var b=(seekTarget|0);b=b-(b%5);if(b===spvLast)return;spvLast=b;' +
'if(spvImg.naturalWidth===0)spv.className="load";' +
'var im=new Image();im.onload=function(){spvImg.src=im.src;spv.className="";};im.onerror=function(){};im.src="/frame?u="+encodeURIComponent(URL)+"&t="+b;}' +
'function hidePreview(){spv.style.display="none";spv.className="";if(spvT){clearTimeout(spvT);spvT=null;}}' +
'v.addEventListener("seeked",hidePreview);v.addEventListener("playing",hidePreview);' +
// ---- key handling ----
'document.addEventListener("keydown",function(e){var k=e.keyCode;' +
'if(k===461||k===8||k===27){e.preventDefault();e.stopPropagation();history.back();return;}' +
'showBar();' +
'if(mode==="menu"){if(k===38){mIdx=Math.max(0,mIdx-1);paintMenu();}else if(k===40){mIdx=Math.min(menuItems.length-1,mIdx+1);paintMenu();}else if(k===13)chooseMenu();e.preventDefault();return;}' +
'if(npFocus){if(k===13){npGo();}else if(k===38){npFocus=false;paintNp();mode="controls";paintBtns();}else if(k===40||k===37||k===39){npFocus=false;paintNp();}e.preventDefault();return;}' +
'if(k===38){if(npShown&&mode==="video"){npFocus=true;paintNp();}else{mode="controls";if(bIdx<0)bIdx=1;paintBtns();}e.preventDefault();return;}' +
'if(k===40){mode="video";paintBtns();e.preventDefault();return;}' +
'if(mode==="controls"){' +
'  if(k===37){bIdx=Math.max(0,bIdx-1);paintBtns();}' +
'  else if(k===39){bIdx=Math.min(btns.length-1,bIdx+1);paintBtns();}' +
'  else if(k===13){var id=btns[bIdx]&&btns[bIdx].id;if(id==="b_rw")seek(-SEEKSTEP);else if(id==="b_pp")tog();else if(id==="b_ff")seek(SEEKSTEP);else if(id==="b_next")nextEp();else if(id==="b_set")openMenu("root");}' +
'  e.preventDefault();return;}' +
'if(k===13){if(seekTarget>=0)commitSeek();else tog();e.preventDefault();}' +
'else if(k===37){seek(-SEEKSTEP);e.preventDefault();}' +
'else if(k===39){seek(SEEKSTEP);e.preventDefault();}' +
'},true);' +
'showBar();' +
// remote-debug hook: lets the CDP inspector read player state / drive sub selection
'window.__tv={st:function(){return {cur:curSub,embN:embN,cues:cues?cues.length:null,cf:(cues&&cues[0])?cues[0].s:null,cl:(cues&&cues.length)?cues[cues.length-1].e:null,t:v.currentTime,paused:v.paused,dur:v.duration,tracks:embTracks};},emb:function(n){setEmbSub(n);},ext:function(u){setExtSub(u);},off:function(){subsOff();}};' +
'})();<\/script></body></html>';
}

// ---------- :8082 injecting web server ----------
// Wait until the streaming server (:11470) is accepting connections, so the
// shell never loads before its backend is ready. Gives up after ~maxMs.
function waitForServer(cb, waited) {
  waited = waited || 0;
  portUp(SERVER_PORT, function (up) {
    if (up || waited >= 25000) return cb();
    setTimeout(function () { waitForServer(cb, waited + 700); }, 700);
  });
}

var shellCache = null, shellCacheAt = 0, shellFetching = false, shellWaiters = [];
// Fetch + inject the shell once, cache it, and fan out to anyone waiting. Pre-warmed
// at startup so the first real request is served from memory (no app.strem.io round-trip).
function fetchShell(cb) {
  if (shellCache && (Date.now() - shellCacheAt) < 600000) return cb(shellCache);
  if (cb) shellWaiters.push(cb);
  if (shellFetching) return;
  shellFetching = true;
  https.get(SHELL_URL, function (r) {
    var chunks = [];
    r.on('data', function (d) { chunks.push(d); });
    r.on('end', function () {
      var html = inject(Buffer.concat(chunks).toString('utf8'));
      shellCache = html; shellCacheAt = Date.now(); shellFetching = false;
      var w = shellWaiters; shellWaiters = [];
      for (var i = 0; i < w.length; i++) w[i](html);
    });
  }).on('error', function () {
    shellFetching = false;
    var w = shellWaiters; shellWaiters = [];
    for (var i = 0; i < w.length; i++) w[i](null); // null => upstream error, served stale or 502
  });
}
function serveShell(res) {
  fetchShell(function (html) {
    if (!html && shellCache) html = shellCache; // fall back to stale cache over an error
    if (!html) { res.writeHead(502); res.end('upstream error'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
}

// ---- helpers for meta/subtitle fetching ----
function sendJson(res, obj) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}
var LANGS = { eng: 'English', spa: 'Spanish', fre: 'French', fra: 'French', ger: 'German', deu: 'German', ita: 'Italian', por: 'Portuguese', rus: 'Russian', ara: 'Arabic', dut: 'Dutch', nld: 'Dutch', pol: 'Polish', tur: 'Turkish', swe: 'Swedish', rum: 'Romanian', ron: 'Romanian', gre: 'Greek', heb: 'Hebrew', hin: 'Hindi', kor: 'Korean', jpn: 'Japanese', chi: 'Chinese', zho: 'Chinese', cze: 'Czech', dan: 'Danish', fin: 'Finnish', nor: 'Norwegian', hun: 'Hungarian', bul: 'Bulgarian', ukr: 'Ukrainian', srp: 'Serbian', hrv: 'Croatian', slo: 'Slovak', slv: 'Slovenian', spl: 'Spanish (LA)', pob: 'Portuguese (BR)' };
function langName(l) { return LANGS[l] || (l ? l.toUpperCase() : 'Unknown'); }
function fetchUrl(u, cb, depth) {
  depth = depth || 0;
  if (!u || depth > 5) return cb(null);
  var lib = u.indexOf('https:') === 0 ? https : http;
  var req;
  try { req = lib.get(u, onres); } catch (e) { return cb(null); }
  function onres(r) {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
      r.resume();
      var loc = r.headers.location;
      if (loc.indexOf('http') !== 0) { var pu = urlmod.parse(u); loc = pu.protocol + '//' + pu.host + (loc.charAt(0) === '/' ? '' : '/') + loc; }
      return fetchUrl(loc, cb, depth + 1);
    }
    var chunks = [];
    r.on('data', function (d) { chunks.push(d); });
    r.on('end', function () {
      var buf = Buffer.concat(chunks);
      if (buf.length > 1 && buf[0] === 0x1f && buf[1] === 0x8b) { try { buf = zlib.gunzipSync(buf); } catch (e) {} }
      cb(buf);
    });
  }
  req.on('error', function () { cb(null); });
  req.setTimeout(12000, function () { try { req.abort(); } catch (e) {} });
}
function fetchJson(u, cb) { fetchUrl(u, function (buf) { if (!buf) return cb(null); try { cb(JSON.parse(buf.toString('utf8'))); } catch (e) { cb(null); } }); }

// Add-on GET bridge: Chromium 53 otherwise fails on modern TLS/CORS. Limit the
// response so a broken add-on cannot exhaust the TV's very small RAM budget.
function fetchAddonJson(u, cb, depth) {
  depth = depth || 0;
  var pu, done = false;
  function finish(v) { if (done) return; done = true; cb(v); }
  try { pu = urlmod.parse(String(u || '')); } catch (e) { return finish(null); }
  if ((pu.protocol !== 'http:' && pu.protocol !== 'https:') || !pu.hostname || depth > 5) return finish(null);
  var lib = pu.protocol === 'https:' ? https : http;
  var opts = { protocol: pu.protocol, hostname: pu.hostname, port: pu.port, path: pu.path,
    method: 'GET', headers: { 'User-Agent': 'Stremio/4.4 webOS-TV', 'Accept': 'application/json,*/*', 'Accept-Encoding': 'gzip' } };
  var rq;
  try { rq = lib.request(opts, function (up) {
    if (up.statusCode >= 300 && up.statusCode < 400 && up.headers.location) {
      up.resume();var loc = up.headers.location;
      if (loc.indexOf('http') !== 0) loc = pu.protocol + '//' + pu.host + (loc.charAt(0) === '/' ? '' : '/') + loc;
      done = true;return fetchAddonJson(loc, cb, depth + 1);
    }
    if (up.statusCode < 200 || up.statusCode >= 300) { up.resume();return finish(null); }
    var chunks = [], total = 0;
    up.on('data', function (d) { total += d.length;if (total > 4 * 1024 * 1024) { try { up.destroy(); } catch (e) {} finish(null); } else chunks.push(d); });
    up.on('end', function () { if (done) return;var buf = Buffer.concat(chunks);
      if (String(up.headers['content-encoding'] || '').toLowerCase() === 'gzip') { try { buf = zlib.gunzipSync(buf); } catch (e) { return finish(null); } }
      if (buf.length > 4 * 1024 * 1024) return finish(null);
      try { finish(JSON.parse(buf.toString('utf8'))); } catch (e) { finish(null); }
    });
    up.on('error', function () { finish(null); });
  }); } catch (e) { return finish(null); }
  rq.on('error', function () { finish(null); });
  rq.setTimeout(45000, function () { try { rq.abort(); } catch (e) {} finish(null); });
  rq.end();
}

// ---- byte proxy for ffmpeg ----
// The bundled ffmpeg/ffprobe are statically linked against glibc, so getaddrinfo
// can't load libnss_dns and EVERY hostname fails ("Name or service not known").
// So ffmpeg never touches the network directly: it talks plain HTTP to us on
// 127.0.0.1 and node (which resolves DNS fine) does the real HTTPS fetch, follows
// debrid redirects, and streams the bytes back, honouring Range so ffmpeg can seek.
function localProxy(u) { return 'http://127.0.0.1:' + PORT + '/proxy?u=' + encodeURIComponent(u); }
var resolveCache = {}; // original debrid url -> { url: resolved-CDN-url, at: ts }
function redirectedHeaders(fromUrl, toUrl, headers) {
  var out = headers || {};
  try {
    if (urlmod.parse(fromUrl).hostname !== urlmod.parse(toUrl).hostname) {
      out = Object.assign({}, out);delete out.Authorization;delete out.Cookie;
    }
  } catch (e) {}
  return out;
}
function proxyStream(target, range, method, clientRes, orig, depth, triedFresh, customHeaders, cacheKey, originalHeaders, refId) {
  depth = depth || 0;
  originalHeaders = originalHeaders || customHeaders || {};
  if (!target || depth > 6) { try { if (!clientRes.headersSent) clientRes.writeHead(502); clientRes.end(); } catch (e) {} return; }
  var pu;
  try { pu = urlmod.parse(target); } catch (e) { try { clientRes.writeHead(502); clientRes.end(); } catch (x) {} return; }
  var lib = pu.protocol === 'https:' ? https : http;
  var hdrs = { 'User-Agent': 'Stremio-TV/1.2.2', 'Accept': '*/*', 'Accept-Encoding': 'identity' };
  Object.keys(customHeaders || {}).forEach(function (k) { hdrs[k] = customHeaders[k]; });
  if (range) hdrs.Range = range;
  var opts = { protocol: pu.protocol, hostname: pu.hostname, port: pu.port, path: pu.path, method: method === 'HEAD' ? 'HEAD' : 'GET', headers: hdrs };
  var upReq;
  try { upReq = lib.request(opts, onUp); } catch (e) { try { clientRes.writeHead(502); clientRes.end(); } catch (x) {} return; }
  function onUp(up) {
    var sc = up.statusCode;
    if (sc >= 300 && sc < 400 && up.headers.location) {
      up.resume();
      var loc = up.headers.location;
      if (loc.indexOf('http') !== 0) loc = pu.protocol + '//' + pu.host + (loc.charAt(0) === '/' ? '' : '/') + loc;
      var nextHeaders = redirectedHeaders(target, loc, customHeaders);
      return proxyStream(loc, range, method, clientRes, orig, depth + 1, triedFresh, nextHeaders, cacheKey, originalHeaders, refId);
    }
    // A cached signed CDN url likely expired — restart from the original once.
    if ((sc === 403 || sc === 410 || sc === 404) && !triedFresh && target !== orig) {
      up.resume(); delete resolveCache[cacheKey || orig];
      return proxyStream(orig, range, method, clientRes, orig, 0, true, originalHeaders, cacheKey, originalHeaders, refId);
    }
    if (orig) {
      if (Object.keys(resolveCache).length > 80) resolveCache = {};
      resolveCache[cacheKey || orig] = { url: target, at: Date.now() };
    } // remember the working CDN url
    var h = {};
    ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'].forEach(function (k) {
      if (up.headers[k] != null) h[k] = up.headers[k];
    });
    var isHls = refId && method !== 'HEAD' && (String(up.headers['content-type'] || '').toLowerCase().indexOf('mpegurl') >= 0 || /\.m3u8(?:$|\?)/i.test(target));
    if (isHls) {
      var playlist = [], playlistBytes = 0, playlistDone = false;
      function failPlaylist() { if (playlistDone) return;playlistDone = true;try { if (!clientRes.headersSent) clientRes.writeHead(502);clientRes.end(); } catch (e) {} }
      up.on('data', function (d) { playlistBytes += d.length;if (playlistBytes > 2 * 1024 * 1024) { try { up.destroy(); } catch (e) {} failPlaylist(); } else playlist.push(d); });
      up.on('end', function () {
        if (playlistDone) return;playlistDone = true;
        var rewritten = Buffer.from(rewriteHls(Buffer.concat(playlist).toString('utf8'), target, refId), 'utf8');
        h['content-type'] = 'application/vnd.apple.mpegurl';h['content-length'] = rewritten.length;
        delete h['content-range'];h['accept-ranges'] = 'none';
        try { clientRes.writeHead(sc, h);clientRes.end(rewritten); } catch (e) {}
      });
      up.on('error', failPlaylist);return;
    }
    if (!h['accept-ranges']) h['accept-ranges'] = 'bytes';
    try { clientRes.writeHead(sc, h); } catch (e) { try { up.destroy(); } catch (x) {} return; }
    up.pipe(clientRes);
    up.on('error', function () { try { clientRes.end(); } catch (e) {} });
  }
  upReq.on('error', function () { try { if (!clientRes.headersSent) clientRes.writeHead(502); clientRes.end(); } catch (x) {} });
  upReq.setTimeout(20000, function () { try { upReq.abort(); } catch (e) {} });
  clientRes.on('close', function () { try { upReq.abort(); } catch (e) {} }); // ffmpeg drops the connection on every seek
  upReq.end();
}
function parseSrt(srt) {
  srt = srt.replace(/\r/g, '');
  var blocks = srt.split(/\n\n+/), cues = [];
  for (var b = 0; b < blocks.length; b++) {
    var lines = blocks[b].split('\n'), tc = -1;
    for (var i = 0; i < lines.length; i++) { if (lines[i].indexOf('-->') >= 0) { tc = i; break; } }
    if (tc < 0) continue;
    var m = lines[tc].match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) continue;
    var s = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
    var e = (+m[5]) * 3600 + (+m[6]) * 60 + (+m[7]) + (+m[8]) / 1000;
    var txt = lines.slice(tc + 1).join('\n').replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '');
    if (txt) cues.push({ s: s, e: e, t: txt });
  }
  return cues;
}

// ---- embedded subtitles via windowed ffmpeg ----
// This TV's native player never hands MKV sub cues to JS, so we demux them
// ourselves: ffprobe lists the text tracks, ffmpeg pulls ~10min at a time.
var FFMPEG = process.env.TV_FFMPEG || path.join(DIR, 'bin', 'ffmpeg');   // env override = offline testing on the Mac
var FFPROBE = process.env.TV_FFPROBE || path.join(DIR, 'bin', 'ffprobe');
var IMG_SUB = { hdmv_pgs_subtitle: 1, dvd_subtitle: 1, dvb_subtitle: 1, xsub: 1, dvb_teletext: 1 };

function embTracks(u, res) {
  if (!u) return sendJson(res, { tracks: [] });
  var args = ['-v', 'error', '-print_format', 'json', '-show_entries',
    'stream=index,codec_name:stream_tags=language,title', '-select_streams', 's', localProxy(u)];
  var out = [], err = [], done = false, pr;
  function finish() {
    if (done) return; done = true; clearTimeout(to);
    var tracks = [], errStr = '';
    try {
      var j = JSON.parse(Buffer.concat(out).toString('utf8')), ss = j.streams || [], ti = 0;
      for (var i = 0; i < ss.length; i++) {
        if (IMG_SUB[ss[i].codec_name || '']) continue; // image subs can't render as text
        var tg = ss[i].tags || {}, lang = (tg.language || '').toLowerCase();
        var nm = langName(lang); if (tg.title) nm += ' — ' + tg.title;
        tracks.push({ n: i, ti: ti, name: nm }); // n=ffmpeg 0:s:n index; ti=index among TEXT tracks (native textTracks[])
        ti++;
      }
    } catch (e) {
      errStr = (Buffer.concat(err).toString('utf8').split('\n')[0] || 'probe failed').slice(0, 160);
    }
    console.log('[embtracks] found=' + tracks.length + (errStr ? ' err=' + errStr : ''));
    sendJson(res, { tracks: tracks, err: tracks.length ? '' : errStr });
  }
  try { pr = spawn(FFPROBE, args); } catch (e) { return sendJson(res, { tracks: [], err: 'ffprobe missing' }); }
  var to = setTimeout(function () { try { pr.kill(); } catch (e) {} finish(); }, 20000);
  pr.stdout.on('data', function (d) { out.push(d); });
  pr.stderr.on('data', function (d) { err.push(d); });
  pr.on('error', function (e) { if (done) return; done = true; clearTimeout(to); sendJson(res, { tracks: [], err: 'ffprobe error: ' + (e && e.code || e) }); });
  pr.on('close', finish);
}

// ---- progressive embedded-subtitle extraction ----
// The windowed approach failed: every window re-seeked the container over the network
// and got truncated. But a straight sequential read measured ~9x realtime on this TV.
// So: ONE ffmpeg reading from the playhead to EOF, cues parsed as they stream out,
// the player polls for increments, and finished tracks are cached on disk so a file
// is only ever extracted once.
var crypto = require('crypto');
var SUBCACHE = path.join(DIR, 'subcache');
try { fs.mkdirSync(SUBCACHE); } catch (e) {}
function subKey(q) {
  var tail = String(q.u || '').split('/').pop().slice(0, 48);
  return crypto.createHash('sha1').update((q.id || '') + '|' + (q.vid || '') + '|' + (q.n || 0) + '|' + tail).digest('hex');
}
function pruneSubcache() {
  try {
    var fl = fs.readdirSync(SUBCACHE);
    if (fl.length <= 40) return;
    var st = [];
    for (var i = 0; i < fl.length; i++) { try { st.push({ f: fl[i], m: fs.statSync(path.join(SUBCACHE, fl[i])).mtimeMs }); } catch (e) {} }
    st.sort(function (a, b) { return a.m - b.m; });
    for (var j = 0; j < st.length - 40; j++) { try { fs.unlinkSync(path.join(SUBCACHE, st[j].f)); } catch (e) {} }
  } catch (e) {}
}
var embJob = null; // single slot (low-RAM TV)
function killJob() {
  if (!embJob) return;
  try { if (embJob.pr) embJob.pr.kill('SIGKILL'); } catch (e) {}
  embJob = null;
}
function spawnJobProc(job, fromT) {
  job.baseT = fromT;
  job.tail = '';
  job.startedAt = Date.now();
  var args = ['-nostdin'];
  if (fromT > 0) args.push('-ss', String(fromT));
  // -copyts: keep ORIGINAL absolute timestamps. Without it, -ss output may be seek-relative
  // or absolute depending on the file, which silently desynced mid-file extractions.
  args.push('-i', localProxy(job.u), '-copyts', '-map', '0:s:' + job.n, '-f', 'srt', 'pipe:1');
  var pr;
  try { pr = spawn(FFMPEG, args); } catch (e) { job.done = true; job.err = 'spawn failed'; return; }
  job.pr = pr;
  pr.stdout.on('data', function (d) {
    if (embJob !== job || job.pr !== pr) return;
    job.tail += d.toString('utf8');
    // parse only COMPLETE srt blocks; keep the trailing partial block for the next chunk
    var cut = job.tail.lastIndexOf('\n\n');
    if (cut < 0) return;
    var ready = job.tail.slice(0, cut);
    job.tail = job.tail.slice(cut + 2);
    var cues = parseSrt(ready);
    for (var i = 0; i < cues.length; i++) {
      // -copyts => timestamps are already absolute; no offset arithmetic
      job.cues.push(cues[i]);
      if (cues[i].e > job.frontier) job.frontier = cues[i].e;
    }
  });
  pr.stderr.on('data', function (d) { job.errTail = (job.errTail + d.toString('utf8')).slice(-400); });
  pr.on('error', function () { if (embJob === job && job.pr === pr) { job.done = true; job.err = 'ffmpeg error'; } });
  pr.on('close', function (code) {
    if (embJob !== job || job.pr !== pr) return;
    var last = parseSrt(job.tail); // flush the final block (timestamps already absolute via -copyts)
    for (var i = 0; i < last.length; i++) job.cues.push(last[i]);
    job.tail = ''; job.pr = null; job.done = true;
    var secs = ((Date.now() - job.startedAt) / 1000) | 0;
    console.log('[embjob] done key=' + job.key.slice(0, 8) + ' cues=' + job.cues.length + ' base=' + job.baseT + ' took=' + secs + 's code=' + code);
    // cache only full-coverage runs (started at the very beginning) that yielded cues
    if (code === 0 && job.baseT <= 5 && job.cues.length) {
      try { fs.writeFileSync(path.join(SUBCACHE, job.key + '.json'), JSON.stringify({ v: 1, cues: job.cues })); pruneSubcache(); } catch (e) {}
    }
  });
}
function embStart(q, res) {
  if (!q.u) return sendJson(res, { err: 'no url' });
  var key = subKey(q), n = parseInt(q.n || '0', 10) || 0, t = Math.max(0, Math.floor(parseFloat(q.t || '0') || 0));
  // instant path: already extracted this track before
  try {
    var cachedRaw = fs.readFileSync(path.join(SUBCACHE, key + '.json'), 'utf8');
    var cached = JSON.parse(cachedRaw);
    if (cached && cached.cues && cached.cues.length) {
      console.log('[embjob] cache hit key=' + key.slice(0, 8) + ' cues=' + cached.cues.length);
      return sendJson(res, { cached: true, done: true, cues: cached.cues });
    }
  } catch (e) {}
  if (embJob && embJob.key === key && !embJob.err) {
    return sendJson(res, { started: true, cues: embJob.cues, done: embJob.done });
  }
  killJob();
  // start slightly behind the playhead; if they later rewind past this, we restart from 0
  var from = Math.max(0, t - 30);
  embJob = { key: key, u: q.u, n: n, cues: [], frontier: from, baseT: from, done: false, err: '', errTail: '', lastPoll: Date.now(), pr: null, tail: '' };
  spawnJobProc(embJob, from);
  console.log('[embjob] start key=' + key.slice(0, 8) + ' n=' + n + ' from=' + from);
  sendJson(res, { started: true, cues: [], done: false });
}
function embCues(q, res) {
  var key = subKey(q), since = parseInt(q.since || '0', 10) || 0, t = parseFloat(q.t || '0') || 0;
  if (!embJob || embJob.key !== key) return sendJson(res, { cues: [], done: true, gone: true });
  var job = embJob;
  job.lastPoll = Date.now();
  // user rewound before our start point -> restart from 0 (keeps already-parsed cues)
  if (!job.done && job.baseT > 5 && t > 0 && t < job.baseT - 5 && !job.restarted0) {
    job.restarted0 = true;
    try { if (job.pr) job.pr.kill('SIGKILL'); } catch (e) {}
    console.log('[embjob] rewind -> restart from 0');
    spawnJobProc(job, 0);
  }
  // user jumped far past the extraction frontier -> hop the reader forward
  else if (!job.done && t > job.frontier + 300 && !job.hopped) {
    job.hopped = true; // one hop per job keeps it simple; cache is skipped anyway once baseT>5
    try { if (job.pr) job.pr.kill('SIGKILL'); } catch (e) {}
    console.log('[embjob] far seek -> hop to ' + ((t - 30) | 0));
    spawnJobProc(job, Math.max(0, Math.floor(t - 30)));
  }
  sendJson(res, { cues: job.cues.slice(since), done: job.done, err: job.err });
}
// reap the job if the player stopped polling (left playback)
setInterval(function () {
  if (embJob && (Date.now() - embJob.lastPoll) > 90000) { console.log('[embjob] idle reap'); killJob(); }
}, 30000);

// ---- YouTube trailer resolver ----
// Innertube ANDROID first (direct googlevideo mp4 when Google allows it), then
// public Piped instances (they proxy the stream themselves, so their URL plays
// from anywhere). The final URL is wrapped in our localhost /proxy so the TV's
// old TLS/CA stack never talks to the outside world.
var ytCache = {}; // videoId -> { lo, hi, at }  (lo=360p-ish, hi=720p-ish)
var PIPED = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.ducks.party',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.adminforge.de'
];
var pipedGood = -1; // remember the instance that worked last
var pipedBad = {};   // instance idx -> last-failure ts (3min cooldown)
var ytFail = {};     // videoId -> ts (10min negative cache; stop hammering dead videos)
function postJsonUpstream(host, path, headers, body, cb) {
  var req = https.request({ hostname: host, path: path, method: 'POST', headers: headers }, function (r) {
    var chunks = [];
    r.on('data', function (d) { chunks.push(d); });
    r.on('end', function () {
      var buf = Buffer.concat(chunks);
      if (buf.length > 1 && buf[0] === 0x1f && buf[1] === 0x8b) { try { buf = zlib.gunzipSync(buf); } catch (e) {} }
      try { cb(JSON.parse(buf.toString('utf8'))); } catch (e) { cb(null); }
    });
  });
  req.on('error', function () { cb(null); });
  req.setTimeout(10000, function () { try { req.abort(); } catch (e) {} });
  req.end(body);
}
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
    postJsonUpstream('api.strem.io', apiPath, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(raw),
      'User-Agent': 'Stremio-UJ3/' + APP_VERSION,
      'Accept': 'application/json'
    }, raw, function (json) {
      if (!json) {
        res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end('{"error":"stremio_api_unavailable"}');
        return;
      }
      sendJson(res, json);
    });
  });
}
function ytInnertube(vid, cb) {
  var body = JSON.stringify({
    videoId: vid,
    context: { client: { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, hl: 'en', gl: 'US' } },
    contentCheckOk: true, racyCheckOk: true
  });
  postJsonUpstream('www.youtube.com', '/youtubei/v1/player?prettyPrint=false', {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
    'X-Youtube-Client-Name': '3',
    'X-Youtube-Client-Version': '19.09.37'
  }, body, function (j) {
    if (!j) return cb(null);
    var fm = (j.streamingData && j.streamingData.formats) || [];
    var out = { lo: '', hi: '' };
    for (var i = 0; i < fm.length; i++) {
      var f = fm[i];
      if (!f.url || String(f.mimeType || '').indexOf('video/mp4') !== 0) continue;
      if (f.itag === 22) out.hi = f.url;
      else if (f.itag === 18) out.lo = f.url;
      else if (!out.lo) out.lo = f.url;
    }
    cb((out.lo || out.hi) ? out : null);
  });
}
function ytPiped(vid, idx, cb) {
  var now = Date.now(), fresh = [], cooling = [];
  function push(i) { ((pipedBad[i] && now - pipedBad[i] < 180000) ? cooling : fresh).push(i); }
  if (pipedGood >= 0) push(pipedGood);
  for (var i = 0; i < PIPED.length; i++) if (i !== pipedGood) push(i);
  var order = fresh.concat(cooling); // throttled instances only as a last resort
  function tryOne(k) {
    if (k >= order.length) return cb(null);
    var ii = order[k];
    var u = PIPED[ii] + '/streams/' + encodeURIComponent(vid);
    fetchJson(u, function (j) {
      var vs = (j && j.videoStreams) || [];
      var out = { lo: '', hi: '' };
      for (var s = 0; s < vs.length; s++) {
        var v = vs[s];
        if (v.videoOnly || !v.url || String(v.mimeType || '').indexOf('video/mp4') !== 0) continue;
        var q = parseInt(v.quality, 10) || 0;
        if (q >= 480) { if (!out.hi) out.hi = v.url; }
        else if (!out.lo) out.lo = v.url;
      }
      if (out.lo || out.hi) { pipedGood = ii; delete pipedBad[ii]; dbg('[yt] piped ok via ' + PIPED[ii]); return cb(out); }
      if (!j) pipedBad[ii] = Date.now(); // network/parse fail -> cool this instance down
      tryOne(k + 1);
    });
  }
  tryOne(0);
}
function ytResolve(vid, lq, cb) {
  if (!/^[\w-]{6,16}$/.test(vid)) return cb('', 'bad id');
  function pick(cc) {
    var u = lq ? (cc.lo || cc.hi) : (cc.hi || cc.lo);
    return u ? localProxy(u) : ''; // play through our proxy: node's TLS, Range honoured
  }
  var c = ytCache[vid];
  if (c && (Date.now() - c.at) < 2 * 3600 * 1000) { var u0 = pick(c); return cb(u0, u0 ? '' : 'no format'); }
  if (ytFail[vid] && (Date.now() - ytFail[vid]) < 180000) return cb('', 'unavailable'); // retry after 3min (mirror outages recover)
  ytInnertube(vid, function (a) {
    if (a) { a.at = Date.now(); ytCache[vid] = a; return cb(pick(a), ''); }
    ytPiped(vid, 0, function (b) {
      if (b) { b.at = Date.now(); ytCache[vid] = b; return cb(pick(b), ''); }
      ytFail[vid] = Date.now();
      dbg('[yt] ' + vid + ' unresolved');
      cb('', 'unavailable');
    });
  });
}

// ---- stream tech-info probe (for the paused-player vignette badges) ----
var probeCache = {};
function probeInfo(u, res) {
  if (!u) return sendJson(res, {});
  if (probeCache[u]) return sendJson(res, probeCache[u]);
  var args = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', localProxy(u)];
  var out = [], done = false, pr;
  function finish() {
    if (done) return; done = true; clearTimeout(to);
    var info = {};
    try {
      var j = JSON.parse(Buffer.concat(out).toString('utf8'));
      var ss = j.streams || [], fmtI = j.format || {}, vs = null, as = null;
      for (var i = 0; i < ss.length; i++) {
        var cn = String(ss[i].codec_name || '');
        if (!vs && ss[i].codec_type === 'video' && cn !== 'mjpeg' && cn !== 'png') vs = ss[i];
        if (!as && ss[i].codec_type === 'audio') as = ss[i];
      }
      if (vs) {
        var h = vs.height || 0;
        info.res = h >= 2000 ? '4K' : (h >= 1000 ? '1080p' : (h >= 690 ? '720p' : (h ? h + 'p' : '')));
        var vc = String(vs.codec_name || '').toLowerCase();
        info.vcodec = vc === 'hevc' ? 'HEVC' : (vc === 'h264' ? 'H.264' : (vc === 'av1' ? 'AV1' : vc.toUpperCase()));
        var trc = String(vs.color_transfer || '').toLowerCase();
        if (String(vs.codec_tag_string || '').toLowerCase().indexOf('dvh') === 0) info.hdr = 'Dolby Vision';
        else if (trc === 'smpte2084') info.hdr = 'HDR10';
        else if (trc === 'arib-std-b67') info.hdr = 'HLG';
        var sd = vs.side_data_list || [];
        for (var s2 = 0; s2 < sd.length; s2++) { if (String(sd[s2].side_data_type || '').toLowerCase().indexOf('dovi') >= 0) info.hdr = 'Dolby Vision'; }
      }
      if (as) {
        var ac = String(as.codec_name || '').toLowerCase();
        var nm = ac === 'eac3' ? 'Dolby Digital+' : (ac === 'ac3' ? 'Dolby Digital' : (ac === 'truehd' ? 'Dolby TrueHD' : (ac.indexOf('dts') === 0 ? 'DTS' : ac.toUpperCase())));
        var ch = as.channels || 0;
        var lay = ch === 8 ? '7.1' : (ch === 6 ? '5.1' : (ch === 2 ? '2.0' : (ch ? ch + 'ch' : '')));
        info.audio = nm + (lay ? ' ' + lay : '');
      }
      var sz = parseInt(fmtI.size || '0', 10);
      if (sz > 0) info.size = sz >= 1073741824 ? (Math.round(sz / 107374182.4) / 10) + ' GB' : Math.round(sz / 1048576) + ' MB';
      var br = parseInt(fmtI.bit_rate || '0', 10);
      if (br > 0) info.br = (Math.round(br / 100000) / 10) + ' Mb/s';
    } catch (e) {}
    if (Object.keys(probeCache).length > 20) probeCache = {};
    probeCache[u] = info;
    console.log('[probe] ' + JSON.stringify(info));
    sendJson(res, info);
  }
  try { pr = spawn(FFPROBE, args); } catch (e) { return sendJson(res, {}); }
  var to = setTimeout(function () { try { pr.kill(); } catch (e) {} finish(); }, 25000);
  pr.stdout.on('data', function (d) { out.push(d); });
  pr.on('error', function () { finish(); });
  pr.on('close', finish);
}

// ---- scrub-preview: background coarse-sprite cache (Netflix-style, adapted for a remote
// stream on weak hardware). On player load /spritegen extracts ~SPRITE_N evenly-spaced
// thumbnails ONE AT A TIME in the background; /frame snaps the seek target to the nearest
// already-extracted bucket and serves it INSTANTLY (204 while that region isn't ready yet).
// The header/Cues are fetched once by the first seek, so each extra thumb is cheap.
var SPRITE_N = 24;
var spriteJob = null; // { key, u, buckets:[t...], frames:{i:buf}, queue:[i...], act, prs:[], done }
function spriteKeyOf(u) { return crypto.createHash('sha1').update(String(u)).digest('hex').slice(0, 16); }
function spriteExtractNext() {
  var job = spriteJob;
  if (!job) return;
  if (!job.queue.length) { if (!job.act) { job.done = true; console.log('[sprite] done ' + Object.keys(job.frames).length + '/' + job.buckets.length); } return; }
  while (job.act < 1 && job.queue.length) spriteSpawnOne(job); // one process: preserve CPU for playback and remote input
}
function spriteSpawnOne(job) {
  var idx = job.queue.shift(), t = job.buckets[idx];
  job.act++;
  var args = ['-nostdin', '-probesize', '900000', '-analyzeduration', '900000', '-ss', String(t), '-noaccurate_seek', '-i', localProxy(job.u), '-an', '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '7', '-f', 'mjpeg', 'pipe:1'];
  var chunks = [], pr, closed = false;
  try { pr = spawn(FFMPEG, args); } catch (e) { job.act--; return; }
  job.prs.push(pr);
  var to = setTimeout(function () { try { pr.kill('SIGKILL'); } catch (e) {} }, 12000);
  pr.stdout.on('data', function (d) { chunks.push(d); });
  function step() { if (closed) return; closed = true; clearTimeout(to);
    var pi = job.prs.indexOf(pr); if (pi >= 0) job.prs.splice(pi, 1);
    if (spriteJob !== job) return;
    var buf = Buffer.concat(chunks); if (buf.length > 500) job.frames[idx] = buf;
    job.act--; setTimeout(spriteExtractNext, 250); }
  pr.on('error', step);
  pr.on('close', step);
}
// coarse-first order: every 6th bucket, then every 3rd, then the rest -> the WHOLE movie
// gets rough coverage in the first ~10 extractions instead of baking left-to-right.
function spriteOrder(n) {
  var out = [], seen = {}, strides = [6, 3, 1];
  for (var s = 0; s < strides.length; s++) for (var i = 0; i < n; i += strides[s]) if (!seen[i]) { seen[i] = 1; out.push(i); }
  return out;
}
function spriteGen(q, res) {
  var u = q.u || '', dur = Math.floor(parseFloat(q.dur || '0') || 0);
  if (!u || dur < 30) { sendJson(res, { ok: false }); return; }
  var key = spriteKeyOf(u);
  if (spriteJob && spriteJob.key === key) { sendJson(res, { ok: true, buckets: spriteJob.buckets, done: spriteJob.done }); return; }
  if (spriteJob && spriteJob.prs) { for (var kp = 0; kp < spriteJob.prs.length; kp++) { try { spriteJob.prs[kp].kill('SIGKILL'); } catch (e) {} } }
  var n = Math.min(SPRITE_N, Math.max(10, Math.floor(dur / 20))); // ~1/20s, capped at 60
  var buckets = [];
  for (var i = 0; i < n; i++) buckets.push(Math.floor(dur * (i + 0.5) / n));
  spriteJob = { key: key, u: u, buckets: buckets, frames: {}, queue: spriteOrder(n), act: 0, prs: [], done: false };
  console.log('[sprite] start n=' + n + ' dur=' + dur);
  spriteExtractNext();
  sendJson(res, { ok: true, buckets: buckets });
}
// ---- backdrop resizer: full-res art (1920x1080 = 8.3MB decoded) shrunk to 960x540
// (2MB decoded) for the BROWSING backdrop — sharp enough upscaled, 4x lighter on the
// decode cache that was thrashing during long sessions. LRU-cached per title.
var bgzCache = {}, bgzOrder = [], bgzActive = 0;
function bgResize(q, res) {
  var u = q.u || '';
  if (!u) { res.writeHead(404); res.end(); return; }
  var key = crypto.createHash('sha1').update(u).digest('hex').slice(0, 16);
  if (bgzCache[key]) { res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=86400', 'Access-Control-Allow-Origin': '*' }); res.end(bgzCache[key]); return; }
  if (bgzActive >= 2) { res.writeHead(204); res.end(); return; } // client falls back to /small
  bgzActive++;
  var args = ['-nostdin', '-i', localProxy(u), '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '6', '-f', 'mjpeg', 'pipe:1'];
  var chunks = [], done = false, pr;
  function finish(ok) {
    if (done) return; done = true; clearTimeout(to); bgzActive--;
    var buf = Buffer.concat(chunks);
    if (ok && buf.length > 2000) {
      bgzCache[key] = buf; bgzOrder.push(key);
      while (bgzOrder.length > 24) delete bgzCache[bgzOrder.shift()];
      try { res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=86400', 'Access-Control-Allow-Origin': '*' }); res.end(buf); } catch (e) {}
    } else { try { res.writeHead(204); res.end(); } catch (e) {} }
  }
  try { pr = spawn(FFMPEG, args); } catch (e) { bgzActive--; res.writeHead(204); res.end(); return; }
  var to = setTimeout(function () { try { pr.kill('SIGKILL'); } catch (e) {} finish(false); }, 9000);
  pr.stdout.on('data', function (d) { chunks.push(d); });
  pr.on('error', function () { finish(false); });
  pr.on('close', function (code) { finish(code === 0); });
}

function grabFrame(q, res) {
  var u = q.u || '', t = Math.max(0, parseInt(q.t || '0', 10) || 0);
  if (!u) { res.writeHead(404); res.end(); return; }
  if (spriteJob && spriteJob.key === spriteKeyOf(u)) {
    var job = spriteJob, b = job.buckets;
    // nearest BAKED bucket
    var best = -1, bd = 1e9;
    for (var i = 0; i < b.length; i++) { if (job.frames[i] != null) { var d = Math.abs(b[i] - t); if (d < bd) { bd = d; best = i; } } }
    // nearest bucket overall; if it isn't baked yet, bump it to the FRONT of the queue so
    // the region being scrubbed bakes next (priority-on-demand)
    var want = -1, wd = 1e9;
    for (var j = 0; j < b.length; j++) { var dj = Math.abs(b[j] - t); if (dj < wd) { wd = dj; want = j; } }
    if (want >= 0 && job.frames[want] == null && !job.done) {
      var qi = job.queue.indexOf(want);
      if (qi > 0) { job.queue.splice(qi, 1); job.queue.unshift(want); }
    }
    if (best >= 0) { res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); res.end(job.frames[best]); return; }
  }
  res.writeHead(204); res.end();
}

http.createServer(function (req, res) {
  var p = req.url.split('?')[0];
  var q = urlmod.parse(req.url, true).query;
  if (p === '/health') {
    sendJson(res, { ok: true, version: APP_VERSION, port: PORT, runtime: process.version });
  } else if (p === '/ping') {
    // Instant readiness probe for the app launcher — proves :8082 is bound so it can
    // redirect here instead of guessing on a timer (which races a cold node start).
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end('ok');
  } else if (p === '/stremioapi' && req.method === 'POST') {
    postStremioApi(String(q.path || ''), req, res);
  } else if (p === '/streamref' && req.method === 'POST') {
    readJsonBody(req, 16384, function (body) {
      var ref = body && storeStreamRef(body);
      sendJson(res, ref ? { ref: ref } : { error: 'invalid_stream' });
    });
  } else if (p === '/addon') {
    fetchAddonJson(q.u || '', function (j) {
      if (!j) { res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });res.end('{"error":"addon_unavailable"}'); }
      else sendJson(res, j);
    });
  } else if (p === '/log') {
    console.log('[clientlog] ' + JSON.stringify(q));
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end('ok');
  } else if (p === '/' || p === '/index.html') {
    waitForServer(function () { serveShell(res); });
  } else if (p === '/beta') {
    // The custom Netflix-like shell — a real file on disk (never strings-in-strings again).
    // Read per-request: tiny file, always fresh after an scp, no restart needed.
    // NO waitForServer here: unlike the v4 shell, beta doesn't need :11470 at boot
    // (only torrent playback does, and server.js starts in parallel) — faster cold start.
    readUiAsset('beta.html', EMBEDDED_BETA_HTML_B64, function (err, buf) {
      if (err) { dbg('[ui] beta.html failed: ' + err.message);res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });res.end('UJ3_ASSET HTML ' + err.message);return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, max-age=0' });
      res.end(buf);
    });
  } else if (p === '/beta-app.js') {
    readUiAsset('beta-app.js', EMBEDDED_BETA_APP_B64, function (err, buf) {
      if (err) { dbg('[ui] beta-app.js failed: ' + err.message);res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });res.end('UJ3_ASSET SCRIPT ' + err.message);return; }
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store, max-age=0' });
      res.end(buf);
    });
  } else if (p === '/play') {
    var stream = getStreamRef(q.ref || '') || decodeStreamToken(q.token || '');
    if (!stream && q.u) stream = { url: q.u }; // beta shell passes the stream URL directly
    if (!stream || !stream.url) {
      if (q.ref && q.back) {
        res.writeHead(302, { Location: 'http://127.0.0.1:' + PORT + '/' + String(q.back).replace(/^\/+/, '') });res.end();return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<body style="background:#000;color:#fff;font-family:sans-serif;text-align:center;padding-top:40vh">Could not read stream. <a style="color:#8c5cff" href="http://127.0.0.1:8082/">Back</a></body>');
      return;
    }
    var ctx = { type: q.type || '', id: q.id || '', vid: q.vid || '', back: q.back || '', streamRef: q.ref || '', meta: null };
    function servePlayer() {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(playerPage(stream, ctx));
    }
    // Fetch artwork server-side so the loading screen shows the logo/backdrop
    // immediately (no plain-text flash). Short timeout; falls back to text.
    if (ctx.type && ctx.id) {
      var settled = false;
      fetchJson('https://v3-cinemeta.strem.io/meta/' + encodeURIComponent(ctx.type) + '/' + encodeURIComponent(ctx.id) + '.json', function (j) {
        if (settled) return; settled = true;
        var m = (j && j.meta) || {};
        ctx.meta = { name: m.name || '', logo: m.logo || '', background: m.background || m.poster || '', poster: m.poster || '', cert: m.certification || '' };
        // Series: pull season/episode + episode title, and compute the next episode id.
        var vid = ctx.vid || '';
        if (vid.indexOf(':') >= 0) {
          var pp = vid.split(':');
          ctx.episode = pp[pp.length - 1]; ctx.season = pp[pp.length - 2];
          ctx.nextVid = pp[0] + ':' + ctx.season + ':' + (parseInt(ctx.episode, 10) + 1);
          if (m.videos) {
            for (var i = 0; i < m.videos.length; i++) {
              var mv = m.videos[i];
              if (mv.id === vid) ctx.epTitle = mv.name || mv.title || '';
              if (mv.id === ctx.nextVid) { ctx.nextTitle = mv.name || mv.title || ''; ctx.nextThumb = mv.thumbnail || ''; }
            }
          }
        }
        servePlayer();
      });
      setTimeout(function () { if (!settled) { settled = true; servePlayer(); } }, 2500);
    } else { servePlayer(); }
  } else if (p === '/meta') {
    fetchJson('https://v3-cinemeta.strem.io/meta/' + encodeURIComponent(q.type || 'movie') + '/' + encodeURIComponent(q.id || '') + '.json', function (j) {
      var meta = (j && j.meta) || {};
      sendJson(res, { name: meta.name || '', poster: (meta.poster || '').replace('/small/', '/medium/'), background: meta.background || meta.poster || '', logo: meta.logo || '' });
    });
  } else if (p === '/subs') {
    fetchJson('https://opensubtitles-v3.strem.io/subtitles/' + encodeURIComponent(q.type || 'movie') + '/' + encodeURIComponent(q.vid || '') + '.json', function (j) {
      var subs = (j && j.subtitles) || [], out = [], per = {};
      for (var i = 0; i < subs.length; i++) {
        var lang = (subs[i].lang || '').toLowerCase();
        if (!lang || !subs[i].url) continue;
        per[lang] = (per[lang] || 0) + 1;
        if (per[lang] > 12) continue; // cap per language
        out.push({ lang: lang, name: langName(lang), u: subs[i].url, n: per[lang] });
      }
      out.sort(function (a, b) { if (a.lang === 'eng' && b.lang !== 'eng') return -1; if (b.lang === 'eng' && a.lang !== 'eng') return 1; if (a.name !== b.name) return a.name < b.name ? -1 : 1; return a.n - b.n; });
      sendJson(res, { subtitles: out });
    });
  } else if (p === '/sub') {
    fetchUrl(q.u || '', function (buf) { sendJson(res, { cues: buf ? parseSrt(buf.toString('utf8')) : [] }); });
  } else if (p === '/proxy') {
    var refStream = getStreamRef(q.ref || '');
    var signedTarget = refStream && q.u && q.sig === proxySignature(q.ref, q.u) ? String(q.u) : '';
    var orig = signedTarget || (refStream ? refStream.url : (q.u || ''));
    var cacheKey = refStream ? ('ref:' + q.ref + ':' + orig) : orig;
    var customHeaders = refStream ? redirectedHeaders(refStream.url, orig, refStream.headers) : null;
    var c = resolveCache[cacheKey];
    var start = (c && (Date.now() - c.at) < 120000) ? c.url : orig; // reuse a fresh resolved CDN url
    var startHeaders = start === orig ? customHeaders : redirectedHeaders(orig, start, customHeaders);
    proxyStream(start, req.headers.range, req.method, res, orig, 0, false, startHeaders, cacheKey, customHeaders, refStream ? String(q.ref) : '');
  } else if (p === '/watchedbits') {
    // Decode Stremio's watched bitfield: "<anchorVideoId>:<anchorLen>:<zlib-b64>".
    // The browser has no zlib, so we inflate here and hand back raw bits.
    var wf = String(q.f || '');
    var wparts = wf.split(':');
    var wb64 = wparts.pop();
    var walen = parseInt(wparts.pop(), 10) || 0;
    var wanchor = wparts.join(':');
    var wbits = [];
    try {
      var wbuf = zlib.inflateSync(Buffer.from(wb64, 'base64'));
      for (var wi = 0; wi < wbuf.length * 8; wi++) wbits.push((wbuf[wi >> 3] & (0x80 >> (wi % 8))) ? 1 : 0);
    } catch (e) {}
    sendJson(res, { anchor: wanchor, alen: walen, bits: wbits });
  } else if (p === '/logo.png') {
    if (LOGO_PNG) { res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400', 'Access-Control-Allow-Origin': '*' }); res.end(LOGO_PNG); }
    else { res.writeHead(404); res.end(); }
  } else if (p === '/yt') {
    ytResolve(String(q.v || ''), !!q.lq, function (url, err) { sendJson(res, url ? { url: url } : { err: err || 'unavailable' }); });
  } else if (p === '/probe') {
    probeInfo(q.u || '', res);
  } else if (p === '/frame') {
    grabFrame(q, res);
  } else if (p === '/spritegen') {
    spriteGen(q, res);
  } else if (p === '/bgz') {
    bgResize(q, res);
  } else if (p === '/embtracks') {
    embTracks(q.u || '', res);
  } else if (p === '/embstart') {
    embStart(q, res);
  } else if (p === '/embcues') {
    embCues(q, res);
  } else {
    res.writeHead(302, { Location: SHELL_URL.replace(/\/$/, '') + req.url });
    res.end();
  }
}).listen(PORT, '127.0.0.1', function () {
  dbg('listening on :' + PORT); console.log('tvserver on :' + PORT);
  // Pre-warm the shell so the first real request is served from memory (saves the
  // app.strem.io round-trip on launch). Runs in parallel with the streaming server boot.
  fetchShell(function () { dbg('shell prewarmed'); });
});
