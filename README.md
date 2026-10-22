# Stremio Legacy for LG webOS

An unofficial, remote-friendly Stremio client for older LG TVs. It bundles an ARMv7 Node 18 runtime and FFmpeg because the JavaScript service included with webOS 3.x/4.x is Node 0.12.2.

> This project is not affiliated with Stremio or LG. Use only addons and media you are authorized to access.

## Builds

| Profile | Status | Intended devices | App ID | Main limitations |
|---|---|---|---|---|
| `um4-armv7` 1.2.2 | Stable | Confirmed on LG 50UM7500PSB, firmware 05.40.97; other ARMv7 webOS 4.x TVs may work | `io.strem.tv` | Chromium 53; heavy 4K/remux/transcoding can exceed the TV's CPU or RAM |
| `uj3-armv7` 0.9.1 | Experimental | Test target: LG 49UJ6565-SB, webOS 3.9.3; similar 2016–2017 UJ/LJ/SJ ARMv7 models may work | `io.strem.tv.legacy3` | Chromium 38, smaller caches, lower source caps, older MSE/codec support |

Do not install these ARMv7 packages on ARM64-only TVs or webOS 1.x/2.x. A TV also needs the 32-bit ARM loader at `/lib/ld-linux.so.3`. Models from the same product family can still use different SoCs, so a family name alone is not a guarantee. Newer supported TVs should normally use the official Stremio app.

## Install

1. Enable **Developer Mode** and **Key Server** on the TV.
2. In webOS Dev Manager, add the TV and install the matching `.ipk` from Releases.
3. On first start, allow up to 60 seconds. Normal starts are usually faster.

The UJ build has a different app/service ID and port, so it does not overwrite the UM build. Version 0.9.1 loads the Chromium 38 application separately and reports its last startup phase with an `UJ3_BOOT` code instead of pulsing forever. Developer Mode expires and may remove sideloaded apps; renew it before expiry.

## Features and limits

- Stremio account login, library/progress and addon synchronization.
- Quality filters for 4K, 1440p, 1080p, 720p, SD and other sources.
- Duplicate removal and descending seeder sorting when addons provide a seeder count.
- Local addon bridge for old TLS/CORS engines and playback headers.
- Direct video, HLS rewriting, audio selection and subtitles.
- Addon availability is external and cannot be guaranteed. DRM, codec, profile and bitrate support remain limited by the TV hardware/firmware. Prefer direct/debrid H.264 or TV-supported HEVC with AAC/AC3 on older models.

## Build or adapt a profile

Requires Node.js and PowerShell on Windows:

```powershell
npm install
npm run package:um4
npm run package:uj3
```

The first build downloads a pinned runtime package, verifies its SHA-256 and extracts the required ARMv7 files locally. Third-party runtime binaries and `server.js` are not stored in this repository.

To target another TV, copy the closest file in `profiles/`, give it unique app/service IDs and a free localhost port, then run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build.ps1 -Profile your-profile
```

Use `chrome38` for webOS 3.x and `chrome53` for webOS 4.x. Keep `lowMemory` enabled for 2016–2017 sets. Confirm the webOS version in TV information; confirm the CPU/loader through a developer shell before changing architecture. The build validates ES5 syntax, manifests, ARM ELF binaries, ports, service IDs and executable modes inside the IPK.

See [THIRD_PARTY.md](THIRD_PARTY.md) for attribution and upstream components.
