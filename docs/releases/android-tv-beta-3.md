# StremCompat for Android TV (test version 3)

> **This is a test version.** Expect problems, and please report them. **The stable version is the one for LG webOS.**

StremCompat 4.2.1 for Android TV and Google TV: the same interface, with your Stremio or Nuvio account and addons.

## New since test version 2
Everything from LG 4.1 and 4.2:
- A black-and-white look with featured titles on Home, and Nuvio Collections.
- Best source asks the audio language, and the source list filters by dubbed audio or embedded subtitles, with Dolby Vision, Atmos and Remux badges.
- Player buttons for audio and subtitles, episodes and sources, and skip intro and recap.
- Titles in your language with a metadata addon such as TMDB, and Korean, Japanese and Chinese.

## What works
- Sign in with Stremio or Nuvio (QR code or email), Nuvio profiles, Home, Discover, Search and Library.
- **Video with Android's own player (ExoPlayer):** MKV, HEVC and surround sound, with the file's audio and subtitle tracks, addon subtitles and the player's menu.
- Torrents, debrid and direct links.
- The remote's Back, play/pause and colour keys; trailers that cannot play here open in the YouTube app.

## How to install
1. On the TV, install **Downloader** from the Play Store and allow it to install unknown apps.
2. Open this page's link to `StremCompat-AndroidTV-test-3.apk` in Downloader, or copy the file to a USB drive.
3. Or, from a computer with ADB: `adb connect TV_IP` and `adb install StremCompat-AndroidTV-test-3.apk`.

It installs over test version 2. Requires Android TV or Google TV 7.0 or newer, on an ARM device.

## Tell me how it went
Post in [Discussions](https://github.com/Alexesmm/stremcompat-lg-webos/discussions) with your device and Android version, and whether login, Home, playback, torrents, audio and subtitles worked.

StremCompat is unofficial and is not affiliated with or endorsed by Stremio, Nuvio, Google or LG. It is licensed under GPL-3.0.
