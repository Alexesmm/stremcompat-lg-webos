// Hero backdrop: one decoded texture, debounced while the remote is scrolling.
/* Dynamic tint: the backdrop already decoded is drawn into an 8x6 canvas once per change
   and its average colour lights a single gradient layer, faded with opacity only. A
   cross-origin fallback image cannot be read and simply leaves the tint off. */
var tintCanvas = null,
  tintT = null;
function tintEnabled() {
  return lsRaw('dynamicTint', TV_PROFILE.lowMemory ? 'false' : 'true') === 'true';
}
function tintColor(img) {
  try {
    if (!tintCanvas) tintCanvas = document.createElement('canvas');
    tintCanvas.width = 8;
    tintCanvas.height = 6;
    var cx = tintCanvas.getContext('2d');
    cx.drawImage(img, 0, 0, 8, 6);
    var d = cx.getImageData(0, 0, 8, 6).data,
      r = 0,
      g = 0,
      b = 0,
      n = d.length / 4;
    for (var i = 0; i < d.length; i += 4) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
    }
    r /= n;
    g /= n;
    b /= n;
    /* same hue at a fixed brightness, so dark and bright posters tint equally */
    var k = 150 / Math.max(1, r, g, b);
    return [Math.round(r * k), Math.round(g * k), Math.round(b * k)];
  } catch (e) {
    return null;
  }
}
function paintTint(img) {
  var el = $('bgtint'),
    c = img && tintEnabled() ? tintColor(img) : null;
  if (tintT) clearTimeout(tintT);
  el.className = '';
  if (!c) return;
  tintT = setTimeout(function () {
    var rgb = c.join(',');
    el.style.backgroundImage =
      'radial-gradient(ellipse at 74% 22%,rgba(' + rgb + ',.34),rgba(' + rgb + ',0) 64%)';
    el.className = 'on';
  }, 320);
}
var bgCur = '',
  bgT = null;
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
      paintTint(null);
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
      $('bg').style.backgroundImage = 'url("' + u + '")';
      $('bg').className = 'on';
      $('bg2').className = '';
      $('bg2').style.backgroundImage = 'none';
      paintTint(img);
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
          $('bg').style.backgroundImage = 'url("' + raw + '")';
          $('bg').className = 'on';
          $('bg2').className = '';
          $('bg2').style.backgroundImage = 'none';
        };
        im2.src = raw;
      }
    };
    img.src = u;
  }, 280);
}
