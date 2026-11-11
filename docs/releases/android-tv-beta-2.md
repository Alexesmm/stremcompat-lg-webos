# StremCompat for Android TV (test version 2)

> **This is a test version.** Expect problems, and please report them. **The stable version is the one for LG webOS.**

StremCompat 4.0.1 for Android TV and Google TV: the same interface, with your Stremio or Nuvio account and addons.

## New since test version 1
- **Torrents play on the TV itself**, with no computer: a torrent engine now runs inside the app. A streaming server on another computer still works, if you prefer one (**Settings > Streaming server > Address**).
- The fixes of LG 4.0.1.

## What works
- Sign in with Stremio or Nuvio (QR code or email), Nuvio profiles, Home, Discover, Search and Library.
- **Video with Android's own player (ExoPlayer):** MKV, HEVC and surround sound, with the file's audio and subtitle tracks, addon subtitles and the player's menu.
- Torrents, debrid and direct links.
- The remote's Back, play/pause and colour keys; trailers that cannot play here open in the YouTube app.

## How to install
1. On the TV, install **Downloader** from the Play Store and allow it to install unknown apps.
2. Open this page's link to `StremCompat-AndroidTV-test-2.apk` in Downloader, or copy the file to a USB drive.
3. Or, from a computer with ADB: `adb connect TV_IP` and `adb install StremCompat-AndroidTV-test-2.apk`.

It installs over test version 1. Requires Android TV or Google TV 7.0 or newer, on an ARM device.

## Tell me how it went
Post in [Discussions](https://github.com/Alexesmm/stremcompat-lg-webos/discussions) with your device and Android version, and whether login, Home, playback, torrents, audio and subtitles worked.

StremCompat is unofficial and is not affiliated with or endorsed by Stremio, Nuvio, Google or LG. It is licensed under GPL-3.0.
