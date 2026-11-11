# StremCompat for Android TV (test version 1)

> **This is a test version**, tested so far on the Google TV emulator. Expect problems. **The stable version is the one for LG webOS.**

The interface and local server of StremCompat 4.0 for LG, inside an Android TV app. It works with your Stremio or Nuvio account and addons.

## What works
- Sign in with Stremio or Nuvio (QR code or email), Nuvio profiles, Home, Discover, Search and Library.
- **Video with Android's own player (ExoPlayer):** MKV, HEVC and surround sound play, with the file's audio and subtitle tracks, addon subtitles and the player's menu.
- The remote's Back, play/pause and colour keys work as on LG; trailers that cannot play here open in the YouTube app.

## Not yet
- **Torrents on the TV itself:** use a streaming server on another computer, in **Settings > Streaming server > Address**. Debrid and direct links work without one.

## How to install
1. On the TV, install **Downloader** from the Play Store and allow it to install unknown apps.
2. Open this page's link to `StremCompat-AndroidTV-test-1.apk` in Downloader, or copy the file to a USB drive.
3. Or, from a computer with ADB: `adb connect TV_IP` and `adb install StremCompat-AndroidTV-test-1.apk`.

Requires Android TV or Google TV 7.0 or newer, on an ARM device.

## Tell me how it went
Post in [Discussions](https://github.com/Alexesmm/stremcompat-lg-webos/discussions) with your device and Android version, and whether login, Home, playback, audio and subtitles worked.

StremCompat is unofficial and is not affiliated with or endorsed by Stremio, Nuvio, Google or LG. It is licensed under GPL-3.0.
