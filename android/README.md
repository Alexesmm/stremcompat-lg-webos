# StremCompat for Android TV

A small Android app around the same pages and local server as the LG packages:

- `NodeRunner` copies the staged server out of the package and starts it on nodejs-mobile's Node (the C++ part in `src/main/cpp` only calls `node::Start`).
- `MainActivity` shows the pages in a WebView laid out as a 1920x1080 screen, and turns the remote's Back, media and colour keys into the codes webOS sends.
- `TvPlayer` is ExoPlayer, drawn under the transparent page; `src/platform/android/player.js` presents it to the player code as a `<video>` element.

## Building

```
npm run package:android
```

This stages the server with the `android-tv` profile, downloads nodejs-mobile once into `.cache`, and runs Gradle. It needs:

- the Android SDK with platform 35, build-tools 35, NDK 27.2 and CMake 3.22 (`ANDROID_HOME`, by default `~/Android/sdk`);
- a JDK 17 or newer (`JAVA_HOME`);
- FFmpeg and FFprobe in `service/bin` (`npm run runtime`).

## Signing

A release is signed with the key named in `~/Android/stremcompat-signing.properties` (or the file in `STREMCOMPAT_SIGNING`):

```
storeFile=C:/Users/you/Android/stremcompat-release.jks
storePassword=...
keyAlias=stremcompat
keyPassword=...
```

Keep a backup of the key and its password outside this repository: Android installs an update only over a package signed with the same key.
