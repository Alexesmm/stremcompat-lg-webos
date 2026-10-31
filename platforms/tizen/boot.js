// Starts the local service, then the interface. Runs inline in index.html, before anything
// that needs the service. A server of another version is asked to leave first.
(function () {
  var tries = 0,
    replaced = false;
  function launch() {
    try {
      tizen.application.launchAppControl(
        new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/service'),
        '__SERVICE_ID__',
        function () {},
        function () {}
      );
    } catch (e) {}
  }
  function start() {
    window.__STREMCOMPAT_APP__();
    window.__STREMIO_SCRIPT_LOADED__();
  }
  function again() {
    tries++;
    if (tries >= 80) {
      window.__STREMIO_BOOT_ERROR__('The app service did not start.', 'SERVICE');
      return;
    }
    setTimeout(ping, 500);
  }
  function get(path, done) {
    var x = new XMLHttpRequest(),
      ended = false;
    function end(status, text) {
      if (ended) return;
      ended = true;
      done(status, text);
    }
    try {
      x.open('GET', path, true);
      x.timeout = 1500;
      x.onreadystatechange = function () {
        if (x.readyState === 4) end(x.status, x.responseText);
      };
      x.ontimeout = function () {
        end(0, '');
      };
      x.onerror = function () {
        end(0, '');
      };
      x.send();
    } catch (e) {
      end(0, '');
    }
  }
  function ping() {
    get('/health?boot=' + Date.now(), function (status, text) {
      var health = null;
      try {
        health = JSON.parse(text);
      } catch (e) {}
      if (status !== 200 || !health) return again();
      if (health.version === '__APP_VERSION__') return start();
      if (!replaced) {
        replaced = true;
        get('/quit', function () {
          setTimeout(launch, 800);
        });
      }
      again();
    });
  }
  launch();
  ping();
})();
