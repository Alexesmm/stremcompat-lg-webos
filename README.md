# StremCompat for LG webOS

An unofficial, remote-friendly Stremio client for older LG televisions that are not supported by the current LG Content Store application.

The project provides separate builds for different webOS generations. It combines a lightweight television interface, a bundled ARMv7 Node.js runtime, FFmpeg tools, a local compatibility server, account synchronization and a native HTML5 video player.

This project is not affiliated with or endorsed by Stremio or LG Electronics. Use only addons and media sources that you are authorized to access.

## Downloads

Use the IPK that matches the television generation. StremCompat 1.0.0 publishes the two confirmed ports as separate, clearly named assets on the [Releases page](https://github.com/Alexesmm/stremio-universal-lg-tv-ports/releases).

| Build | Status | Confirmed television | Platform | App name and ID |
|---|---|---|---|---|
| `um4-armv7` 1.2.2 | Confirmed | LG 50UM7500PSB, firmware 05.40.97 | webOS 4.x, Chromium 53, ARMv7 | Stremio, `io.strem.tv` |
| `uj3-native-armv7` 1.0.1 | Confirmed | LG 49UJ6565-SB, webOS 3.9.3-6280413 (`dreadlocks2-dudhwa`) | webOS 3.x, Chromium 38, ARMv7 | Stremio UJ3, `io.strem.tv.uj3native` |

Release assets:

- `StremCompat-webOS4-UM4-armv7-1.2.2.ipk`
- `StremCompat-webOS3-UJ3-armv7-1.0.1.ipk`

The older `uj3-armv7` 0.9.3 profile is retained only as development history. It was replaced by `uj3-native-armv7` and is not a recommended release.

Do not use these packages on ARM64-only televisions or webOS 1.x/2.x. Televisions using webOS 5 or newer should normally use the official Stremio application when it is available.

## Why separate builds are required

LG changed the browser engine and available runtime across webOS generations:

| webOS generation | Browser engine | System JavaScript service runtime | Recommended build |
|---|---|---|---|
| webOS 3.x, 2016-2017 | Chromium 38 | Node.js 0.12.2 | `uj3-native-armv7` |
| webOS 4.x, 2018-2019 | Chromium 53 | Node.js 0.12.2 | `um4-armv7` |
| webOS 5 and newer | Newer Chromium versions | Newer platform runtime | Official Stremio app preferred |

Chromium 38 rejects JavaScript syntax and browser APIs that work on newer televisions. Old TV certificate stores can also reject otherwise valid HTTPS services. A single modern web application therefore cannot be assumed to work across all LG generations.

Official references:

- [LG web engine versions](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine)
- [LG JavaScript service and Node.js versions](https://webostv.developer.lge.com/develop/guides/js-service-basics)
- [LG TLS and root certificate compatibility](https://webostv.developer.lge.com/develop/specifications/tls)
- [LG webOS 3.5 audio and video formats](https://webostv.developer.lge.com/develop/specifications/video-audio-35)
- [LG streaming protocol and DRM support](https://webostv.developer.lge.com/develop/specifications/streaming-protocol-drm)

## Architecture

The installed package contains two webOS components:

1. A small packaged web application starts immediately and requests the matching Luna service.
2. The Luna service is deliberately written in ES5 so it can run on the TV's Node.js 0.12.2 runtime.
3. The service starts the bundled ARMv7 Node.js 18 runtime with its matching shared libraries.
4. Node.js 18 runs a local compatibility server on `127.0.0.1`.
5. The TV interface, account bridge, addon requests, stream headers, HLS rewriting, subtitles and playback helpers are served from that local origin.
6. The browser uses the television's hardware-backed HTML5 media pipeline for playback.

The UM4 build uses port `8082`. The dedicated UJ3 build uses a separate app ID, service ID and port `8093`, so it does not share a stale process with another edition.

## webOS 3 adaptation

The UJ3 edition is not just a renamed UM package. It includes the following changes for Chromium 38 and low-memory 2017 hardware:

- ES5-only interface syntax verified against Chromium 38 rules.
- No block-level strict-mode function declarations, which Chromium 38 rejects.
- Synchronous boot with preserved `UJ3_BOOT` diagnostics.
- Guarded event binding and remote-control focus handling.
- Interface assets embedded inside the local server, with file loading only as the first option. This prevents the former `beta shell missing` failure.
- Stremio account POST requests bridged through local Node.js 18. This avoids relying on the old browser's TLS roots and CORS implementation.
- Addon and metadata GET requests bridged through the same local runtime.
- Reduced catalog, library, source, backdrop and worker limits.
- Smaller 640-pixel backdrops and a six-item backdrop cache.
- Separate application and service identity: `io.strem.tv.uj3native` and `io.strem.tv.uj3native.server`.

The confirmed UJ3 package was tested with the official Chromium 38 snapshot. Startup reached login, remote navigation moved focus correctly, a stored account reached Home, embedded UI fallback worked, and live Cinemeta, Stremio account API and Stremio pairing requests returned valid data.

## Features

- Stremio account login by email or mobile pairing code.
- Account library, watched state and progress synchronization.
- Account addon synchronization.
- Addon-driven Home, Discover, Search and Library screens.
- Quality filters for 4K, 1440p, 1080p, 720p, SD and unknown quality.
- Duplicate source removal.
- Descending seeder sorting when an addon exposes a recognizable seeder count.
- Direct video and HLS playback through the local stream bridge.
- Forwarding of required authorization, referer and range headers.
- Audio-track selection, subtitles, resume and watched progress.
- Low-memory behavior tuned separately per profile.

## Installation

1. Install and open LG's Developer Mode application on the television.
2. Sign in, enable Developer Mode and enable Key Server.
3. Add the television in webOS Dev Manager.
4. Download the matching IPK from Releases.
5. Install the IPK and open the corresponding application name.

The compressed IPK is approximately 46 MiB. The installed package uses approximately 92 MiB because the runtime and media tools are compressed inside the IPK. Remove obsolete test editions if the television has limited internal storage.

A power cycle is not normally required. Restart only if webOS Dev Manager reports a successful installation but the new application does not appear or its Luna service cannot be started.

Developer Mode installations expire with the Developer Mode timer and may be removed by the television after expiry. Renew the timer before it reaches zero.

## Choosing a build for another television

Use the webOS TV version shown in the television information screen, not the firmware number by itself.

- Choose UJ3 for a 2016-2017 ARMv7 television running webOS 3.x and Chromium 38.
- Choose UM4 for an ARMv7 television running webOS 4.x and Chromium 53.
- Do not assume that every model in a marketing family has the same processor.
- The bundled runtime requires a 32-bit ARMv7 CPU and the soft-float loader at `/lib/ld-linux.so.3`.
- A model that is ARM64-only, x86 or missing that loader needs a different runtime build.

Models similar to a confirmed television are compatibility candidates, not confirmed devices. Add a television to the confirmed table only after installation, account login, catalog loading and playback have been tested on the physical device.

## Adapting the project to another TV

Requirements on the build computer:

- Windows PowerShell
- A supported Node.js version
- npm
- Network access for the first runtime download

Install dependencies and build the confirmed profiles:

```powershell
npm ci
npm run runtime
npm run package:um4
npm run package:uj3-native
```

The first runtime preparation downloads a pinned StremioBrew package, verifies SHA-256 `36c81015d851bfd4b12c40372edbe7b51fb67fe1d8cec828d0aeFA6CE8343DF7` case-insensitively, and extracts the required ARMv7 runtime files. Runtime binaries are not committed to this repository. The original upstream file was removed after version 2.0.0 replaced that architecture, so an unchanged checksum-verified copy is retained in the `runtime-v1.0.0` build-dependency prerelease. It is not a TV application download.

To add another profile:

1. Copy the closest JSON file from `profiles/`.
2. Give the profile a unique `profile`, `appId`, `serviceId` and localhost `port`.
3. Set `ecmaTarget` to `chrome38` for webOS 3.x or `chrome53` for webOS 4.x.
4. Keep `lowMemory` enabled for older televisions.
5. Reduce `sourceCap`, `libraryCap`, `catalogCap`, backdrop width, cache and workers for weak hardware.
6. Build with the new profile name:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build.ps1 -Profile your-profile
```

7. Test the resulting IPK on the physical television before declaring it compatible.

## Verification performed by the build

The build fails when it detects an incompatible or incomplete package. It checks:

- ES5 syntax for the system Node.js 0.12 launcher.
- Browser syntax for the selected Chromium target.
- Chromium 38 strict-mode function placement.
- Application and service IDs, versions and local ports.
- Embedded UI byte equality with the packaged UI files.
- ARM32 little-endian ELF headers.
- Executable permissions for Node.js, FFmpeg and FFprobe inside the IPK.
- Presence of the account, addon, HLS and protected stream bridges.
- Package manifests and final IPK contents.

Additional local tests exercise startup, remote focus, login/Home transitions, storage failures, addon requests, protected headers and relative HLS rewriting. The Chromium 38 integration test requires the official legacy Chromium snapshot in the local test cache.

## Playback limits

The application cannot expand the codecs or processing power available in the television firmware.

- Prefer direct or debrid sources using H.264 or television-supported HEVC with AAC or AC3.
- Very large 4K remux files, unsupported audio codecs and high bitrates can fail or exhaust memory.
- Addon availability, source metadata and seeder counts are controlled by external addon services.
- Seeder sorting works only when the addon exposes a recognizable number.
- Some HLS tags and multi-audio behavior are limited on webOS 3.x.
- DRM playback remains subject to the firmware's MSE, EME, Widevine and PlayReady versions.

## Troubleshooting

- Confirm that the correct application was opened. The dedicated webOS 3 edition is named `Stremio UJ3`.
- Remove superseded test editions if storage is low.
- Verify that Developer Mode is still active.
- If an error screen appears, record the complete `UJ3_BOOT` or `UJ3_ASSET` message before reinstalling.
- A source that appears but does not play is usually a codec, container, bitrate, header or addon issue rather than an application startup problem.
- Test a moderate H.264/AAC direct source before diagnosing large 4K or torrent sources.

## Releases

Confirmed builds are released together under the StremCompat project version. Tags follow Semantic Versioning, such as `v1.0.0`. Each television port keeps its own internal version in the asset filename because the two ports can evolve independently. The GitHub Actions release workflow builds both recommended IPKs, verifies them, gives them descriptive filenames and attaches them to the matching GitHub Release.

Maintainer example:

```powershell
git tag v1.0.0
git push origin v1.0.0
```

Users do not need to create a Release. They only download the matching IPK from the Releases page.

## Credits and licensing

The implementation is based on and interoperates with Stremio, the Stremio streaming server, StremioBrew, the original community webOS port, Node.js, FFmpeg and LG webOS tooling. Exact upstream references and runtime provenance are listed in [THIRD_PARTY.md](THIRD_PARTY.md).

Third-party names, trademarks, binaries and source code remain subject to their respective licenses and terms. This repository does not grant additional rights to those components.
