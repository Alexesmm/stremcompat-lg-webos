// Interface side of the LG platform.
function exitApp() {
  try {
    window.close();
  } catch (e) {}
}
/* a trailer this app cannot play opens in the TV's own YouTube app; false when it cannot */
function openYoutubeApp(videoId) {
  try {
    if (typeof PalmServiceBridge === 'undefined') return false;
    new PalmServiceBridge().call(
      'luna://com.webos.applicationManager/launch',
      JSON.stringify({
        id: 'youtube.leanback.v4',
        params: { contentTarget: 'https://www.youtube.com/tv?v=' + videoId }
      })
    );
    return true;
  } catch (e) {
    return false;
  }
}
