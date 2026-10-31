# Third-party components and provenance

This repository is an unofficial compatibility project and is not affiliated with or endorsed by LG Electronics or Stremio.

## Source lineage

The following source projects influenced or supplied parts of this repository:

| Upstream | Use in StremCompat | License status observed during the October 22, 2026 audit |
|---|---|---|
| [kieranbrown/stremio-webos](https://github.com/kieranbrown/stremio-webos) | Starting point for the packaged webOS application bootstrap, manifest layout and service launcher. The audited upstream revision was `296548a52b45af19a6df9e083f117a485bd71afc`. | No license file was present in the audited repository. Copyright remains with its contributors. |
| [NoobyGains/stremio-vidaa-tv](https://github.com/NoobyGains/stremio-vidaa-tv) | Identified by `kieranbrown/stremio-webos` as the source of its Theater television interface. | No license file was present in the audited repository. Copyright remains with its contributors. |
| [simussu9-wq/stremiobrew](https://github.com/simussu9-wq/stremiobrew) | Starting point for the local server architecture and source of the pinned ARMv7 runtime package. The current upstream revision audited was `4080c4e6119f39861714f71070216053b6f128b3`. | The current upstream repository publishes GPL-3.0. The pinned 1.0.0 IPK did not contain an embedded license or source-revision notice. |

StremCompat adds a separately implemented low-memory television UI, account and addon bridges, source filtering and sorting, playback helpers, profile-based packaging, compatibility diagnostics and verification tests. A list of changes does not override the rights or license status of inherited code.

## Bundled runtime

The build uses a runtime archive (`runtime-v2.0.0`, SHA-256 `3a63ba8ce3c3a6cafc3fd1eb6d0187231c8261150b06868a0b67835224ad246b`) made by `scripts/make-runtime-archive.js` from the StremioBrew 1.0.0 IPK (SHA-256 `36c81015d851bfd4b12c40372edbe7b51fb67fe1d8cec828d0aefa6ce8343df7`). License texts ship in `service/licenses/`.

The extracted package includes:

- Node.js 18 for ARMv7: [Node.js licensing information](https://github.com/nodejs/node/blob/main/LICENSE)
- FFmpeg and FFprobe: [FFmpeg legal information](https://ffmpeg.org/legal.html)
- Shared libraries needed by the ARMv7 runtime

The bundled FFmpeg binary identifies itself as configured with `--enable-gpl` and `--enable-version3`, along with GPL-enabled libraries including libx264. Treat that binary as GPLv3-covered distribution material. The pinned IPK does not identify the exact FFmpeg source revision or provide a corresponding source offer, so the runtime provenance is not yet sufficient for a fully documented public redistribution. A future release should replace it with a reproducible build and publish the exact corresponding source and build configuration.

## Downloaded by the television

Stremio's streaming server (`https://dl.strem.io/server/v4.20.17/webos/server.js`, SHA-256 `ecef1b5a4f67f5fd94ffc0c39e7567d6a6efdd46849ea7a2da48ccc84bd49c1d`) is closed-source and is not part of the release packages. The television downloads it directly from Stremio on first use. Its use remains subject to Stremio's terms.

## Bundled font

`service/fonts/` contains the Latin subset of [Inter](https://github.com/rsms/inter) in its regular (400) and bold (700) weights, taken from the `@fontsource/inter` 5.1.0 package as WOFF 1 files (Chromium 38 rejects current WOFF2 files). Inter is copyright 2016 The Inter Project Authors and is distributed under the SIL Open Font License 1.1, reproduced in `service/fonts/OFL.txt`.

## Build tooling and platform documentation

- [LG webOS TV CLI](https://webostv.developer.lge.com/develop/tools/cli-dev-guide)
- [LG webOS TV Developer documentation](https://webostv.developer.lge.com/)
- [FFmpeg](https://ffmpeg.org/)
- [Node.js](https://nodejs.org/)

## Trademarks, services and addons

Stremio and LG are trademarks of their respective owners. Addons and media services are external to this repository. Users are responsible for complying with the terms of the addons and media sources they choose to use.

Third-party binaries and source code remain subject to their respective licenses and terms. This repository does not grant additional rights to those components. See [NOTICE.md](NOTICE.md) before redistributing source or release packages.
