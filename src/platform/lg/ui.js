// Interface side of the LG platform.
function exitApp() {
  try {
    window.close();
  } catch (e) {}
}
/* A newer package installed by the Homebrew Channel's service, which downloads it and checks its
   checksum. onStatus(text, percent) while it works; done(ok) at the end. The TV closes the app
   while it replaces it, so on success it is opened again. */
function installUpdate(info, onStatus, done) {
  var ended = false;
  function end(ok) {
    if (ended) return;
    ended = true;
    done(ok);
  }
  try {
    if (typeof PalmServiceBridge === 'undefined' || !info.ipkUrl || !info.sha256) return end(false);
    var bridge = new PalmServiceBridge();
    bridge.onservicecallback = function (raw) {
      var r = {};
      try {
        r = JSON.parse(raw);
      } catch (e) {}
      if (r.finished) {
        end(true);
        relaunchApp();
      } else if (r.returnValue === false || r.errorText || r.errorCode) end(false);
      else if (r.statusText) onStatus(r.statusText, r.progress);
    };
    bridge.call(
      'luna://org.webosbrew.hbchannel.service/install',
      JSON.stringify({ ipkUrl: info.ipkUrl, ipkHash: info.sha256, id: 'io.github.alexesmm.legacytv' })
    );
  } catch (e) {
    end(false);
  }
}
function launchApp(id, params) {
  try {
    if (typeof PalmServiceBridge === 'undefined') return false;
    new PalmServiceBridge().call(
      'luna://com.webos.applicationManager/launch',
      JSON.stringify({ id: id, params: params || {} })
    );
    return true;
  } catch (e) {
    return false;
  }
}
function relaunchApp() {
  launchApp('io.github.alexesmm.legacytv');
}
/* where updates are installed by hand when the app cannot do it */
function openUpdater() {
  return launchApp('org.webosbrew.hbchannel');
}
/* a trailer this app cannot play opens in the TV's own YouTube app; false when it cannot */
function openYoutubeApp(videoId) {
  try {
    if (typeof PalmServiceBridge === 'undefined') return false;
    return launchApp('youtube.leanback.v4', { contentTarget: 'https://www.youtube.com/tv?v=' + videoId });
  } catch (e) {
    return false;
  }
}
