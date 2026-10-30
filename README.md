# StremCompat for LG webOS

<p align="center">
  <img src="docs/assets/stremcompat-hero-en.png" alt="StremCompat home interface running on LG webOS" width="1200">
</p>

<p align="center">
  <a href="https://github.com/Alexesmm/stremcompat-lg-webos/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/Alexesmm/stremcompat-lg-webos?display_name=tag&color=8d5bd4"></a>
  <img alt="LG webOS 3.x and 4.x" src="https://img.shields.io/badge/LG%20webOS-3.x%20%7C%204.x-8d5bd4">
  <img alt="ARMv7" src="https://img.shields.io/badge/architecture-ARMv7-6f45b5">
  <img alt="1280x720 and 1920x1080 graphics" src="https://img.shields.io/badge/UI-1280x720%20%7C%201920x1080-6f45b5">
  <img alt="No root required" src="https://img.shields.io/badge/root-not%20required-2ea44f">
  <img alt="Unofficial community project" src="https://img.shields.io/badge/project-unofficial%20community-ea345e">
  <a href="https://github.com/Alexesmm/stremcompat-lg-webos/discussions"><img alt="GitHub Discussions" src="https://img.shields.io/badge/community-Discussions-2ea44f"></a>
  <a href="https://buymeacoffee.com/Alexesmm"><img alt="Buy me a coffee" src="https://img.shields.io/badge/support-Buy%20me%20a%20coffee-ffdd00?logo=buymeacoffee&logoColor=black"></a>
</p>

## About

StremCompat is an unofficial, remote-friendly Stremio client for older LG televisions that cannot install the official Stremio app. It installs through LG Developer Mode and webOS Dev Manager and does **not** require root access or Homebrew Channel.

It combines its own lightweight television interface with a bundled ARMv7 Node.js runtime, FFmpeg tools and a local compatibility server, so legacy webOS televisions can sign in, sync the account library and addons, browse catalogs and play media with the TV's hardware video decoder.

This project is not affiliated with or endorsed by Stremio or LG Electronics. Use only addons and media sources that you are authorized to access.

## Table of contents

1. [Downloads](#downloads)
2. [Compatibility](#compatibility)
3. [Installation](#installation)
4. [Features](#features)
5. [How it works](#how-it-works)
6. [Troubleshooting](#troubleshooting)
7. [Feedback and compatibility reports](#feedback-and-compatibility-reports)
8. [Support development](#support-development)
9. [Credits and licensing](#credits-and-licensing)

## Downloads

Download the IPK that matches your television's webOS generation and graphics mode from the [Releases page](https://github.com/Alexesmm/stremcompat-lg-webos/releases).

| Package | For | Status | App name on the TV |
|---|---|---|---|
| `StremCompat-webOS4-UM4-armv7-graphics-1920x1080-1.2.32.ipk` | webOS 4.x | Confirmed on LG 50UM7500PSB | Stremio |
| `StremCompat-webOS4-UM4-armv7-graphics-1280x720-1.2.32.ipk` | webOS 4.x, 720p/HD interface | Locally validated, reports welcome | Stremio HD |
| `StremCompat-webOS3-UJ3-armv7-graphics-1920x1080-1.0.29.ipk` | webOS 3.x | Confirmed on LG 49UJ6565-SB (webOS 3.9.3) | Stremio UJ3 |
| `StremCompat-webOS3-UJ3-armv7-graphics-1280x720-1.0.29.ipk` | webOS 3.x, 720p/HD interface | Locally validated, reports welcome | Stremio UJ3 HD |

How to choose:

- **Generation:** UJ3 for webOS 3.x, UM4 for webOS 4.x. Check **Settings > General > About This TV > webOS TV Version**; the firmware number (such as `05.40.97`) is not the webOS version.
- **Graphics mode:** use `graphics-1920x1080` when the interface fills the screen. Use `graphics-1280x720` on 1280x720 or 1366x768 panels, or when the 1920 package appears only in the upper-left part of the screen. The graphics mode affects the interface only, not video resolution.

## Compatibility

The packages target 32-bit ARM (ARMv7) LG televisions running **webOS 3.x and 4.x**, roughly the 2016–2019 models:

| webOS | Typical years | Example families |
|---|---|---|
| 3.0 / 3.5 (UJ3 package) | 2016–2017 | OLED B6/C6/E6/G6, B7/C7/E7/G7/W7; LCD UH6x–UH9x, SJ8x–SJ9x, UJ6x–UJ7x, LJ5x |
| 4.0 / 4.5 (UM4 package) | 2018–2019 | OLED B8/C8/E8/W8/Z8, B9/C9/E9/W9/Z9; LCD SK8x–SK9x, UK6x–UK7x, SM8x–SM9x, UM69–UM80, LK5x–LK6x, LM5x–LM6x |

Only the two models in the Downloads table are physically confirmed; the rest are candidates, since LG can change processors inside a family. webOS 1.x/2.x is not supported.

**webOS 5 and newer:** not officially supported, but it may work. There are reports of the UM4 package running well on webOS 7.0 (firmware 4.60.90). Newer TVs still include the 32-bit ARM support the bundled runtime needs, but this is not guaranteed and needs testing on each model. If you try it, please share the result.

## Installation

Root access is not required.

1. Install LG's **Developer Mode** app on the television, sign in, and enable Developer Mode and Key Server.
2. Add the television in **webOS Dev Manager**.
3. Download the matching IPK from Releases and install it.
4. Open the app (`Stremio`, `Stremio HD`, `Stremio UJ3` or `Stremio UJ3 HD`).

The IPK is about 46 MiB and uses about 92 MiB once installed. Developer Mode installations expire with the Developer Mode timer, so renew it before it reaches zero.

> **After updating over an existing installation**, the app's local service from the previous version can keep running in the background. From 1.3.3 on, the new version replaces it by itself. When updating from an older version, if the app stays on the loading screen (`RUNTIME_START_TIMEOUT`), unplug the television for at least 30 seconds and open it again; turning it off with the remote is not enough when Quick Start+ is on. This does not erase your account or settings.

## Features

**Account and library**

- Login by email or phone pairing code; English or Brazilian Portuguese interface.
- Library, watched state, progress and addon synchronization with the Stremio account, in both directions: episodes and films watched on the TV show as watched in the other Stremio apps, and the other way round.
- Continue Watching with the episode and minutes left; a finished episode becomes the next one, also when it was finished on another device.
- Home rows for New episodes of followed series and My list.
- History controls to clear recent searches or Continue Watching.

**Browsing**

- Addon-driven Home, Discover, Search and Library, with a See all card at the end of each catalog row.
- On-screen search keyboard with results that update while typing, plus recent searches.
- One-press Continue / Play buttons on title pages, episode details and continuous numbering for long series.
- Remote and LG Magic Remote navigation built for the television, with an optional larger interface text.

**Sources and playback**

- Quality filters, duplicate removal and source tags (quality, language, HDR/DV, codec, audio, size, seeders), with a recommended source for the TV.
- Optional preferred source language that lists sources in that language first, and a language filter when the sources come in several languages.
- Addons that do not answer are named, and a source that will not play offers another one.
- Direct, debrid, torrent and HLS playback through the local bridge, using the TV's hardware decoder.
- Subtitles and audio-track selection, remembered per title along with the subtitle delay.
- Next-episode countdown with an "are you still watching?" check.
- LG remote shortcuts: red subtitles, green audio, yellow skips 85 seconds, blue settings, digits jump through the video.

**Television resources**

- Separate memory profiles for webOS 3.x and 4.x hardware: the interface uses lighter artwork while the video keeps its full resolution.
- The local server restarts on its own if it exits.
- **Settings > Diagnostics** shows memory, CPU load, Home load time and recent playback or addon problems.

## How it works

The package contains a small webOS launcher and a background service written in ES5, so it runs on the television's own old Node.js. That service starts a bundled ARMv7 Node.js 18 runtime, which runs a local server on `127.0.0.1`. The interface, account and addon requests, stream headers, HLS handling and subtitles go through that server, which avoids the old browsers' TLS and CORS limits, and playback uses the TV's native HTML5 video pipeline.

webOS 3 and 4 need separate packages because they ship different browser engines (Chromium 38 and 53), and each generation comes in a 1920x1080 and a 1280x720 interface edition. Architecture details, memory limits per generation, how to adapt the project to another TV and how builds are verified and released are in [docs/TECHNICAL.md](docs/TECHNICAL.md).

## Troubleshooting

- **"Can't reach Stremio" message, or nothing loads (login QR code, email login or catalogs) while other TV apps and Stremio on a phone work:** your network probably hands out IPv6 without a working IPv6 connection. Update to 1.2.3 or later, which tries IPv4 first. On older versions, turn IPv6 off on the television (Settings > Network > Wi-Fi or Wired connection > Advanced settings > IPv6) or on the router.
- **Check that the app's local service is running** by opening `http://127.0.0.1:<port>/health` in the TV browser, with port `8082` (UM4 1920x1080), `8084` (UM4 1280x720), `8093` (UJ3 1920x1080) or `8094` (UJ3 1280x720). A JSON answer means it is running.
- **App stuck after an update:** power cycle the television as described in [Installation](#installation).
- **Interface only in the upper-left part of the screen:** install the `graphics-1280x720` package.
- **Error screen at startup:** note the full `UJ3_BOOT` or `UJ3_ASSET` message before reinstalling.
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

- **[StremioBrew](https://github.com/simussu9-wq/stremiobrew)**: the bundled runtime (Node.js 18, FFmpeg, FFprobe and the Stremio streaming server) comes from its package, and part of the local server is still derived from its code.
- **[kieranbrown/stremio-webos](https://github.com/kieranbrown/stremio-webos)**: StremCompat started as a fork of this project, whose earlier interface came from [NoobyGains/stremio-vidaa-tv](https://github.com/NoobyGains/stremio-vidaa-tv). The launcher and interface have since been rewritten.
- Stremio, Node.js, FFmpeg, the Inter typeface and LG webOS tooling are also used or interoperated with.

See [NOTICE.md](NOTICE.md) and [THIRD_PARTY.md](THIRD_PARTY.md) for project lineage, component provenance and redistribution caveats. No repository-wide open-source license is currently asserted.
