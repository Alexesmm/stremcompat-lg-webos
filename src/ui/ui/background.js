// Hero backdrop: one decoded texture, debounced while the remote is scrolling.
var bgCur = '',
  bgT = null,
  bgDipT = null,
  BG_DIP_MS = 200;
/* A new title fades through the dark background instead of popping in: the old image goes
   out first, so only one image is on screen and no second layer has to be blended. */
function showBg(u) {
  var bg = $('bg');
  function swap() {
    bgDipT = null;
    if (bgCur !== u) return;
    bg.style.backgroundImage = 'url("' + u + '")';
    bg.className = 'on';
    $('bg2').className = '';
    $('bg2').style.backgroundImage = 'none';
  }
  if (bgDipT) clearTimeout(bgDipT);
  if (bg.className === 'on') {
    bg.className = '';
    bgDipT = setTimeout(swap, BG_DIP_MS);
  } else swap();
}
/* This TV has ~38MB free RAM + a weak GPU, so large backdrop textures are the
   scroll-jank/"black blockiness" culprit. Keep one cropped texture, swap only after the
   replacement decodes, and debounce hard so rapid scrolling never thrashes the decoder. */
function setBg(u) {
  if (u === bgCur) return;
  bgCur = u;
  if (bgT) clearTimeout(bgT);
  bgT = setTimeout(function bgGo() {
    if (Date.now() - accel.last < 300) {
      bgT = setTimeout(bgGo, 220);
      return;
    } /* still scrolling: wait */
    if (!u) {
      $('bg').className = '';
      $('bg2').className = '';
      setTimeout(function () {
        if (!bgCur) {
          $('bg').style.backgroundImage = 'none';
          $('bg2').style.backgroundImage = 'none';
        }
      }, 560);
      return;
    }
    var img = new Image();
    img.onload = function () {
      if (bgCur !== u || !img.naturalWidth) return;
      showBg(u);
    };
    img.onerror = function () {
      if (bgCur !== u) return;
      var m = u.match(/^\/bgz\?u=(.*)$/);
      if (m) {
        var raw = decodeURIComponent(m[1]).replace(
          /(images\.metahub\.space\/background\/)[a-z]+\//,
          '$1small/'
        );
        bgCur = raw;
        var im2 = new Image();
        im2.onload = function () {
          if (bgCur !== raw) return;
          showBg(raw);
        };
        im2.src = raw;
      }
    };
    img.src = u;
  }, 280);
}
