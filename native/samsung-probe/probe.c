/* An empty library for the Samsung test build. service/main.js tries to load it and the result shows
   in Settings > Diagnostics: "did not self-register" means the TV allows loading native code, the
   condition for running the torrent engine there. It registers nothing on purpose. */
int stremcompat_probe(void) {
  return 1;
}
