// Interface side of the Tizen platform.
/* the YouTube app is not opened from here on Samsung yet */
function openYoutubeApp() {
  return false;
}
function exitApp() {
  var left = false;
  function leave() {
    if (left) return;
    left = true;
    try {
      tizen.application.getCurrentApplication().exit();
    } catch (e) {}
  }
  try {
    var x = new XMLHttpRequest();
    x.open('GET', '/quit', true);
    x.onreadystatechange = function () {
      if (x.readyState === 4) leave();
    };
    x.send();
  } catch (e) {}
  setTimeout(leave, 500);
}
