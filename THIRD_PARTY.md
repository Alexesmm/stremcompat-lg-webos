# Third-party components and provenance

This repository is an unofficial compatibility project and is not affiliated with or endorsed by LG Electronics, Samsung or Stremio.

## Source lineage

The following source projects influenced or supplied parts of this repository:

| Upstream | Use in StremCompat | License status observed during the October 22, 2026 audit |
|---|---|---|
| [kieranbrown/stremio-webos](https://github.com/kieranbrown/stremio-webos) | Starting point for the packaged webOS application bootstrap, manifest layout and service launcher. The audited upstream revision was `296548a52b45af19a6df9e083f117a485bd71afc`. | No license file was present in the audited repository. Copyright remains with its contributors. |
| [NoobyGains/stremio-vidaa-tv](https://github.com/NoobyGains/stremio-vidaa-tv) | Identified by `kieranbrown/stremio-webos` as the source of its Theater television interface. | No license file was present in the audited repository. Copyright remains with its contributors. |
| [simussu9-wq/stremiobrew](https://github.com/simussu9-wq/stremiobrew) | Starting point for the local server architecture. Its 1.0.0 package supplied the ARMv7 runtime before StremCompat 3.0.0. The current upstream revision audited was `4080c4e6119f39861714f71070216053b6f128b3`. | The current upstream repository publishes GPL-3.0. The pinned 1.0.0 IPK did not contain an embedded license or source-revision notice. |

StremCompat adds a separately implemented low-memory television UI, account and addon bridges, source filtering and sorting, playback helpers, profile-based packaging, compatibility diagnostics and verification tests. A list of changes does not override the rights or license status of inherited code.

## Programs in the package

Built from source by `native/build-ffmpeg.sh` and `native/build-engine.sh`, as static ARM executables. The result is published as the `runtime-v3.0.0` archive, which `scripts/fetch-runtime.ps1` checks against its SHA-256. License texts ship in `service/licenses/`.

- FFmpeg and FFprobe 7.1.1, LGPL build: [FFmpeg legal information](https://ffmpeg.org/legal.html). Exact source and options: `service/licenses/ffmpeg-build-info.txt`
- `sc-engine`: `native/engine/sc-engine.cpp` over [Nuvio Engine](https://github.com/NuvioMedia/nuvio-engine) (GPL-3.0-or-later) at a pinned commit, with [libtorrent](https://github.com/arvidn/libtorrent) and Boost
- zlib, musl and LLVM libc++, linked into those programs

The local server runs on the Node.js that comes with the television, which is not part of the package.


The bundled FFmpeg binary identifies itself as configured with `--enable-gpl` and `--enable-version3`, along with GPL-enabled libraries including libx264. Treat that binary as GPLv3-covered distribution material. The pinned IPK does not identify the exact FFmpeg source revision or provide a corresponding source offer, so the runtime provenance is not yet sufficient for a fully documented public redistribution. A future release should replace it with a reproducible build and publish the exact corresponding source and build configuration.

## Samsung package

The Samsung test package contains no Node.js, FFmpeg or FFprobe binary, because it runs on the television's own service runtime. It carries the Inter font and a list of root certificates generated at build time from `tls.rootCertificates` in Node.js, which comes from the Mozilla CA store. It does not download Stremio's streaming server. Packaging uses [Samsung's Tizen CLI tools](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html).

## Android TV package

The Android TV test package carries [nodejs-mobile](https://github.com/nodejs-mobile/nodejs-mobile) (Node.js for Android, MIT) to run the local server, [Media3 ExoPlayer](https://github.com/androidx/media) (Apache-2.0) for video, and [WebTorrent](https://github.com/webtorrent/webtorrent) (MIT) with its dependencies, bundled into one file, as the torrent engine. It also carries the same FFmpeg and FFprobe programs as the LG packages. It is built with the Android SDK and NDK.

## Downloaded by the television


## Bundled font

`service/fonts/` contains the Latin subset of [Inter](https://github.com/rsms/inter) in its regular (400) and bold (700) weights, taken from the `@fontsource/inter` 5.1.0 package as WOFF 1 files (Chromium 38 rejects current WOFF2 files). Inter is copyright 2016 The Inter Project Authors and is distributed under the SIL Open Font License 1.1, reproduced in `service/fonts/OFL.txt`.

## Build tooling and platform documentation

- [LG webOS TV CLI](https://webostv.developer.lge.com/develop/tools/cli-dev-guide)
- [LG webOS TV Developer documentation](https://webostv.developer.lge.com/)
- [FFmpeg](https://ffmpeg.org/)
- [Node.js](https://nodejs.org/)

## Trademarks, services and addons

Stremio, LG and Samsung are trademarks of their respective owners. Addons and media services are external to this repository. Users are responsible for complying with the terms of the addons and media sources they choose to use.

Third-party binaries and source code remain subject to their respective licenses and terms. The [GPL-3.0 license of this repository](LICENSE) does not grant additional rights to those components. See [NOTICE.md](NOTICE.md) before redistributing source or release packages.
