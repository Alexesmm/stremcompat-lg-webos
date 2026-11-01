# StremCompat for LG webOS

<p align="center">
  <img src="docs/assets/stremcompat-hero-en.png" alt="StremCompat home interface running on LG webOS" width="1200">
</p>

<p align="center">
  <a href="https://github.com/Alexesmm/stremcompat-lg-webos/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/Alexesmm/stremcompat-lg-webos?display_name=tag&color=0F766E"></a>
  <img alt="LG webOS 3.x and 4.x" src="https://img.shields.io/badge/LG%20webOS-3.x%20%7C%204.x-0F766E">
  <img alt="ARMv7" src="https://img.shields.io/badge/architecture-ARMv7-0F766E">
  <img alt="1280x720 and 1920x1080 graphics" src="https://img.shields.io/badge/UI-1280x720%20%7C%201920x1080-0F766E">
  <img alt="No root required" src="https://img.shields.io/badge/root-not%20required-2ea44f">
  <img alt="Unofficial community project" src="https://img.shields.io/badge/project-unofficial%20community-ea345e">
  <a href="https://github.com/Alexesmm/stremcompat-lg-webos/discussions"><img alt="GitHub Discussions" src="https://img.shields.io/badge/community-Discussions-2ea44f"></a>
  <a href="https://buymeacoffee.com/Alexesmm"><img alt="Buy me a coffee" src="https://img.shields.io/badge/support-Buy%20me%20a%20coffee-ffdd00?logo=buymeacoffee&logoColor=black"></a>
</p>

## About

StremCompat is an independent, unofficial client for older LG televisions that cannot install the official Stremio app. It works with your Stremio account and addons, with an interface designed for the TV remote. It installs through LG Developer Mode and webOS Dev Manager and does **not** require root access or Homebrew Channel.

It combines its own lightweight television interface with a small local server that runs on the TV's own Node.js, FFmpeg built only with what the app needs and a torrent engine that runs only while a torrent plays. The whole package is about 6 MB and needs no computer, not even for torrents.

**The stable version is the one for LG.** There is also a [test version for older Samsung TVs](#samsung-tvs-test-version).

This project is not affiliated with or endorsed by Stremio, LG Electronics or Samsung. Use only addons and media sources that you are authorized to access.

## Screenshots

Captured at the 1920x1080 size the interface uses on the TV. Sources are shown with an example addon.

<table>
  <tr>
    <td><img src="docs/assets/screens/discover.jpg" alt="Discover grid with filters" width="100%"></td>
    <td><img src="docs/assets/screens/series.jpg" alt="Series page with episodes" width="100%"></td>
  </tr>
  <tr>
    <td><img src="docs/assets/screens/sources.jpg" alt="Source list with quality and language tags" width="100%"></td>
    <td><img src="docs/assets/screens/settings.jpg" alt="Settings screen" width="100%"></td>
  </tr>
</table>

## Table of contents

1. [Downloads](#downloads)
2. [Compatibility](#compatibility)
3. [Installation](#installation)
4. [First use](#first-use)
5. [Features](#features)
6. [How it works](#how-it-works)
7. [Samsung TVs (test version)](#samsung-tvs-test-version)
8. [Troubleshooting](#troubleshooting)
9. [Feedback and compatibility reports](#feedback-and-compatibility-reports)
10. [Support development](#support-development)
11. [Credits and licensing](#credits-and-licensing)

## Downloads

One package for every supported LG TV: download `StremCompat-3.0.0.ipk` from the [Releases page](https://github.com/Alexesmm/stremcompat-lg-webos/releases). The app chooses its limits by itself when it opens, with lighter artwork and shorter lists on the weakest TVs.

> Version 3.0.0 is in final testing. Until it is released, the Releases page offers 2.1.0 and the Homebrew repository below is not online.

## Compatibility

The package targets LG televisions with an ARM processor running **webOS 3.x and 4.x**, roughly the 2016-2019 models, the ones that cannot install the official app. Newer versions should work and reports are welcome.

| webOS | Typical years | Example families |
|---|---|---|
| 3.0 / 3.5 | 2016-2017 | OLED B6/C6/E6/G6, B7/C7/E7/G7/W7; LCD UH6x-UH9x, SJ8x-SJ9x, UJ6x-UJ7x, LJ5x |
| 4.0 / 4.5 | 2018-2019 | OLED B8/C8/E8/W8/Z8, B9/C9/E9/W9/Z9; LCD SK8x-SK9x, UK6x-UK7x, SM8x-SM9x, UM69-UM80, LK5x-LK6x, LM5x-LM6x |

webOS 1.x and 2.x are not supported. LG can change processors inside a family, so a model not listed below is a candidate until someone reports it.

### Tested televisions

| Television | webOS / firmware | App version | Result | Source |
|---|---|---|---|---|
| LG 50UM7500PSB | 4.x | 3.0.0 | Working | Maintainer |
| LG 49UJ6565-SB | 3.9.3 | Before 3.0 | Working | Maintainer |
| LG 43LH600T | 3.4.3 / 05.70.50 | 2.1.0, 1280x720 | Working; Magic Remote not tested | User report |
| LG UJ6300 | Not stated | Not stated | Working so far | User report |
| LG OLED C9 | Not stated | Not stated | Working | User report |
| Not stated | 4.5 | Not stated | Working | User report |
| Not stated | 7.0.0 / 4.60.90 | Not stated | Working | User report |

Most reports come from versions before 3.0, whose packages were different, so a new report helps even for a model on this list. Tried it on another TV? [Send a compatibility report](https://github.com/Alexesmm/stremcompat-lg-webos/issues/new?template=compatibility-report.yml).

## Installation

Root access is not required.

**With the Homebrew Channel**, which also makes updates easy:

1. Install the [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel) on the TV.
2. In its settings, add this repository: `https://alexesmm.github.io/stremcompat-lg-webos/apps.json`
3. Install StremCompat from the channel. The app tells you when a new version is out.

**With Developer Mode:**

1. Install LG's **Developer Mode** app on the television, sign in, and enable Developer Mode and Key Server.
2. Add the television in **webOS Dev Manager**.
3. Download the IPK from Releases and install it.
4. Open `StremCompat`.

> **Coming from 2.x?** If you used `StremCompat`, this updates it. If you used `StremCompat HD`, `StremCompat UJ3` or `StremCompat UJ3 HD`, remove that app: this package replaces all of them. Your library and addons are on your Stremio account, and you may need to sign in again.

The IPK is about 6 MB and uses about 13 MB once installed, plus up to 768 MB of free storage while a torrent plays, which is cleared when it stops. Developer Mode installations expire with the Developer Mode timer, so renew it before it reaches zero.

> **After updating over an existing installation**, the app's local service from the previous version can keep running in the background. From 1.3.3 on, the new version replaces it by itself. If the app ever stays on the loading screen (`RUNTIME_START_TIMEOUT`), unplug the television for at least 30 seconds and open it again; turning it off with the remote is not enough when Quick Start+ is on. This does not erase your account or settings.

## First use

StremCompat has no accounts or sources of its own. It uses your Stremio account and the addons installed on it.

1. Create a free account at [stremio.com/register](https://www.stremio.com/register), if you do not have one.
2. Install your addons in the Stremio app or website. They come from the account, so without any addon that provides sources, titles open but have nothing to play.
3. On the TV, sign in with the QR code or with your email and password.

## Features

**Account and library**

- Login by email or phone pairing code. Interface in English, Brazilian Portuguese, Spanish, French, German, Italian and Russian; corrections to the translations are welcome.
- Library, watched state, progress and addon synchronization with the Stremio account, in both directions: episodes and films watched on the TV show as watched in the other Stremio apps, and the other way round.
- Continue Watching with the episode and minutes left; a finished episode becomes the next one, also when it was finished on another device.
- Home rows for New episodes of followed series and My list.
- The next episode starts straight from the player, with the same release when the addon marks it, or the same addon, quality and audio language. When nothing matches, the source list opens instead of changing language silently.
- History controls to clear recent searches or Continue Watching, and **Do not save history**: while it is on, no progress, watched state, played source or search is saved on the TV or sent to your account. Addons and streaming servers still receive their normal requests.

**Browsing**

- Addon-driven Home, Discover, Search and Library, with a See all card at the end of each catalog row.
- On-screen search keyboard with results that update while typing, plus recent searches.
- One-press Continue / Play buttons on title pages, episode details and continuous numbering for long series.
- Audio and subtitle choices are remembered for each title, with a backup language when the first is not available.
- **Best source** starts the source that suits this TV and the speed of its connection, without opening the list.
- Remote and LG Magic Remote navigation built for the television, with an optional larger interface text.

**Sources and playback**

- Quality filters, duplicate removal and source tags (quality, language, HDR/DV, codec, audio, size, seeders), with a recommended source for the TV.
- Optional preferred source language that lists sources in that language first, and a language filter when the sources come in several languages.
- Addons that do not answer are named, and a source that will not play offers another one.
- Direct, debrid, torrent and HLS playback through the local bridge, using the TV's hardware decoder.
- Playback waits up to ten seconds for a subtitle you choose in the menu, so it starts with the line being spoken.
- Torrents play on the TV itself. The engine starts with the first torrent and stops when nothing plays, keeping only part of the film on storage. A streaming server on another computer can be used instead: **Settings > Streaming server > Address**. The address is saved only after a server answers there, and **Use this TV** goes back to the built-in behaviour.
- Subtitles and audio-track selection, remembered per title along with the subtitle delay.
- Next-episode countdown with an "are you still watching?" check.
- LG remote shortcuts: red subtitles, green audio, yellow skips 85 seconds, blue settings, digits jump through the video.

**Television resources**

- Separate memory profiles for webOS 3.x and 4.x hardware: the interface uses lighter artwork while the video keeps its full resolution.
- The local server restarts on its own if it exits.
- **Settings > Diagnostics** shows memory, CPU load, Home load time and recent playback or addon problems.

## How it works

The package contains a small webOS launcher and a local server written for the television's own Node.js (0.12 on webOS 3 and 4). The interface, account and addon requests, stream headers, HLS handling and subtitles go through that server, which avoids the old browsers' TLS and CORS limits, and playback uses the TV's hardware decoder.

Two small programs built from source come with it: FFmpeg, for artwork, seek previews and subtitles inside the video, and a torrent engine over [Nuvio Engine](https://github.com/NuvioMedia/nuvio-engine) and libtorrent. Both are single files that depend on nothing in the TV's system, so a webOS version does not change how they run. Architecture details are in [docs/TECHNICAL.md](docs/TECHNICAL.md).

## Samsung TVs (test version)

> **This is a test version.** It has only been tested on one TV (Samsung UN75NU7100, Tizen 4.0), so expect problems. The stable version is the one for LG webOS.

| Samsung TVs | Tizen | Status |
|---|---|---|
| 2018, N series | 4.0 | Tested on one TV |
| 2017, M series | 3.0 | Should work, not tested yet |
| 2019 and 2020, R and T series | 5.0 and 5.5 | May work, not tested |
| 2021 and 2022 | 6.0 and 6.5 | May work, not tested; these TVs can use the official Stremio app |
| 2023 and newer | 7.0 and newer | Not tested; the package has to be signed again with your own Samsung certificate |
| 2015 and 2016 | 2.x | Not supported |

It differs from the LG version in a few ways:

- **Torrents** need a streaming server on another computer: **Settings > Streaming server > Address**. Debrid and direct links work without one.
- **Not available:** seek previews, technical badges on the paused screen and background trailers, which depend on FFmpeg.

Download the package from the [test release](https://github.com/Alexesmm/stremcompat-lg-webos/releases/tag/tizen-beta-1), which has the installation steps. Please report how it went with your TV model and Tizen version in [Discussions](https://github.com/Alexesmm/stremcompat-lg-webos/discussions).

## Troubleshooting

- **"Can't reach Stremio" message, or nothing loads (login QR code, email login or catalogs) while other TV apps and Stremio on a phone work:** your network probably hands out IPv6 without a working IPv6 connection. Update to 1.2.3 or later, which tries IPv4 first. On older versions, turn IPv6 off on the television (Settings > Network > Wi-Fi or Wired connection > Advanced settings > IPv6) or on the router.
- **Check that the app's local service is running** by opening `http://127.0.0.1:8082/health` in the TV browser.
- **App stuck after an update:** power cycle the television as described in [Installation](#installation).
- **Interface only in the upper-left part of the screen:** install the `graphics-1280x720` package.
- **Torrents do not start, but debrid and direct links work:** **Settings > Diagnostics** shows the state of the engine. Few seeders or little free storage can also keep a torrent from starting.
- **Error screen at startup:** note the full `APP_BOOT` or `APP_ASSET` message before reinstalling.
- **A source appears but does not play:** usually a codec, bitrate or addon issue. Try a moderate H.264/AAC source first; very large 4K remuxes and some audio formats can exceed what older firmware supports.
- Make sure Developer Mode is still active, and remove old test versions if storage is low.

## Feedback and compatibility reports

Use [GitHub Discussions](https://github.com/Alexesmm/stremcompat-lg-webos/discussions) for questions, ideas and compatibility results, and [GitHub Issues](https://github.com/Alexesmm/stremcompat-lg-webos/issues) for reproducible bugs. See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a report, and [SECURITY.md](SECURITY.md) for security issues.

When reporting a television, include the full model and regional suffix, webOS TV version, firmware version, the exact IPK filename, and whether startup, login, catalogs and playback worked. Never post passwords, tokens or an active pairing QR code.

## Support development

StremCompat is a free community project developed and maintained in my spare time.

If StremCompat has been useful to you and you'd like to support its continued development, you can buy me a coffee. Contributions are entirely optional and help support ongoing maintenance and compatibility improvements.

[☕ Buy me a coffee](https://buymeacoffee.com/Alexesmm)

StremCompat is free to use, and donations are never required.

## Credits and licensing

- **[StremioBrew](https://github.com/simussu9-wq/stremiobrew)**: StremCompat started from its 1.0.0 package and has since been rewritten. See [NOTICE.md](NOTICE.md).
- **[kieranbrown/stremio-webos](https://github.com/kieranbrown/stremio-webos)**: StremCompat started as a fork of this project, whose earlier interface came from [NoobyGains/stremio-vidaa-tv](https://github.com/NoobyGains/stremio-vidaa-tv). The launcher and interface have since been rewritten.
- [Nuvio Engine](https://github.com/NuvioMedia/nuvio-engine) and libtorrent power the torrent engine. FFmpeg, the Inter typeface and LG webOS tooling are also used. Stremio is a trademark of its owner.

StremCompat is licensed under [GPL-3.0](LICENSE). The license does not cover other third-party components, or the names and logos of StremCompat, Stremio, LG and Samsung. See [NOTICE.md](NOTICE.md) and [THIRD_PARTY.md](THIRD_PARTY.md) for project lineage, component provenance and open items.
