# StremCompat technical notes

Background for contributors and curious users: why the project ships separate builds, how the package is put together, where the code lives, the memory profile of each television generation, how to adapt it to another TV and how releases are verified and published. Installation and everyday use are covered in the [README](../README.md).

## One build for every TV

LG changed the browser engine and the service runtime across webOS generations:

| webOS generation | Browser engine | System JavaScript service runtime |
|---|---|---|
| webOS 3.x, 2016-2017 | Chromium 38 | Node.js 0.12.2 |
| webOS 4.x, 2018-2019 | Chromium 53 | Node.js 0.12.2 |
| webOS 5 and newer | Newer Chromium versions | Node.js 8.12 to 20 |

The same build serves all of them, in two graphics resolutions. Its interface is ES5, which every generation runs. Its server is prepared for the oldest Node by `scripts/lib/legacy-node.js`, which writes out destructuring and shorthand properties and refuses anything else Node 0.12 lacks, while `service/compat.js` fills in the few library functions missing. Its programs are static, so they do not depend on the libraries of any webOS version. `useSmallTvLimits()` in `service/profile.js` applies the `smallTv` values of the profile when the interface first asks for its page: on Chromium 38, or when the TV has under 900 MB of memory.

Graphics resolution is declared in the package manifest before the application starts, so responsive CSS alone cannot change it. The profile `lg-armv7` declares `1280x720`, which LG scales to the whole screen on every panel and which takes less than half the memory of a `1920x1080` surface; `lg-armv7-1080` builds the same package with `1920x1080`, which is sharper on Full HD and 4K panels but is cut off on smaller ones. Both are released, each with its own Homebrew repository, because a repository offers one package for each app.

Official references:

- [LG web engine versions](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine)
- [LG JavaScript service and Node.js versions](https://webostv.developer.lge.com/develop/guides/js-service-basics)
- [LG TLS and root certificate compatibility](https://webostv.developer.lge.com/develop/specifications/tls)
- [LG webOS 3.5 audio and video formats](https://webostv.developer.lge.com/develop/specifications/video-audio-35)
- [LG streaming protocol and DRM support](https://webostv.developer.lge.com/develop/specifications/streaming-protocol-drm)

## Architecture

The installed package contains two webOS components:

1. A small packaged web application starts immediately and requests the Luna service.
2. The Luna service `service/launch.js`, in ES5, starts `service/local-server.js` on the same Node, as a process of its own that it can restart.
3. That local server listens on `127.0.0.1:8082`. The TV interface, account bridge, addon requests, stream headers, HLS rewriting, subtitles and playback helpers are served from it.
4. The browser uses the television's hardware-backed HTML5 media pipeline for playback.

### Torrents

The interface and the player know a torrent by an address on `127.0.0.1:11470`, `/<infohash>/<file index>`, the form a Stremio streaming server answers on another computer. `service/server/streaming-server.js` answers that address:

1. The first request starts `bin/sc-engine`, which gets its orders over its stdin and answers with one JSON object per line on its stdout (`native/engine/sc-engine.cpp`).
2. The engine finds the torrent's metadata and prepares the file. An addon that names no file arrives as file 0, so a file that is not a video, or is much smaller than the largest video, gives way to the largest video.
3. The request gets a redirect to the engine's own link on the loopback interface, so video bytes never pass through JavaScript.
4. After two quiet minutes with nothing playing, the engine is stopped, and it clears what it kept on storage. It also leaves when its stdin closes, so it cannot outlive the server.

The engine keeps a window of the film on storage: between 64 and 768 MiB, up to 70 % of what is free above a 150 MB reserve. `native/build-engine.sh` lowers the engine's own floor to get there, and `native/test-e2e.py` checks that it holds.

The source list is capped per profile (`sourceCap`). Within the cap every addon that answered keeps a share, so one addon with many well-ranked sources cannot push the others off the list. A debrid link has no seeder count, so with the default ranking by seeders torrents come first; the `sourcePrefer` setting (Debrid links first) ranks debrid, then plain links, then torrents. Each row's first tag says how the source reaches the TV: TORRENT (the TV's own engine), DEBRID (read from the addon's own marker, such as `[RD+]`) or DIRECT.

## Code map

Edit the sources below, not the generated files.

| Area | Location | Notes |
|---|---|---|
| Launcher | `app/index.html` | Starts the service, waits for `/health`, opens the interface, shows startup errors |
| webOS service | `service/launch.js` | ES5 for Node.js 0.12; starts the local server on the same Node |
| Local server | `service/local-server.js`, `service/server/` | Prepared for Node.js 0.12 by the build; `routes.js` holds every HTTP route, `streaming-server.js` the torrents |
| Native programs | `native/` | Build scripts for FFmpeg and the torrent engine, run on Linux or WSL; they need no installed compiler |
| Interface screens | `src/ui/views/` | Home, title page, source list, search, settings, login and others |
| Interface data | `src/ui/data/` | Account and library sync, catalogs, metadata, sources |
| Interface foundation | `src/ui/core/`, `src/ui/ui/`, `src/ui/input/`, `src/ui/features/` | Network and storage helpers, navigation, cards, remote and pointer input, trailers |
| Interface page and styles | `src/ui/index.html`, `src/ui/styles/` | One stylesheet per area; `compact-720p.css` adapts the 1280x720 surface |
| Player | `src/player/`, `service/player/player.css`, `service/player/player-body.html` | Controls, seeking, subtitles, progress and next episode |
| Shared by interface and player | `src/shared/` | Translations (`strings.js`), the finished-title rule, addon selection |
| Package profiles | `profiles/` | Identity, version, port, resolution and memory limits |
| Build and tests | `scripts/` | See below |

### Generated files

`npm run build:ui` generates these files, which are committed. `node scripts/build-ui.js --check` fails when one is stale.

| Generated file | Sources | Order |
|---|---|---|
| `service/interface.js` | `src/ui/` and `src/shared/` | `src/ui/modules.json` |
| `service/player/player-client.js` | `src/player/` and `src/shared/` | `src/player/modules.json` |
| `service/interface.html` | `src/ui/index.html` and `src/ui/styles/` | `src/ui/styles/styles.json` |

The scripts are plain fragments joined in the listed order, with no `import` or module loader. All modules of a bundle share one scope, so a function from one file can be called directly from another. A new file must be added to the matching `modules.json`, and order matters for code that runs at load time.

Browser code must stay ES5 and run on Chromium 38, which rejects newer syntax and block-level function declarations in strict mode. `service/launch.js` must also stay ES5. Only `service/local-server.js` and `service/server/` can use modern JavaScript.

### Build, test and package

| Command | What it does |
|---|---|
| `npm run build:ui` | Regenerates the three files above |
| `npm test` | Interface and player tests in a Node.js VM, then runtime tests against a real local server |
| `npm run test:chrome38` | Runs the interface and player UI in real Chromium 38 (needs the snapshot in `.cache/chromium38`) |
| `npm run test:visual:layouts` | Checks the layouts at both surface sizes (needs Chrome) |
| `npm run lint`, `npm run format:check` | ESLint and Prettier |
| `npm run verify` | Checks syntax targets, required features, manifests and the bundled runtime |
| `npm run runtime` | Downloads the pinned runtime the packages need |
| `npm run package` | Builds, verifies and packages the IPK into `dist/` |
| `STREMCOMPAT_SERVER_NODE=<node> node scripts/selftest-runtime.js <stage> 8082 <version> file` | Runtime tests with the staged server on another Node, such as a real 0.12 |
| `node scripts/audit-lineage.js <stremiobrew-1.0.0.ipk>` | Counts what is still identical to the package the project started from |

Packaging stages each edition in `.build/<profile>/` first: `scripts/build-stage.js` copies `app/` and `service/`, writes `service/profile.json` and fills in the launcher's port, version and service ID. Without `profile.json`, a source checkout runs as a development profile.

## webOS 3 adaptation

The same package runs on Chromium 38 and low-memory 2017 hardware:

- ES5-only interface syntax verified against Chromium 38 rules.
- No block-level strict-mode function declarations, which Chromium 38 rejects.
- Synchronous boot with preserved `APP_BOOT` diagnostics.
- Guarded event binding and remote-control focus handling.
- Interface assets embedded inside the local server, with file loading only as the first option.
- Stremio account requests, addons and metadata bridged through the local server, which avoids the old browser's TLS roots and CORS implementation.
- Reduced catalog, library, source, backdrop and worker limits.
- Smaller 640-pixel backdrops and a six-item backdrop cache.

## Performance profile and image-quality trade-offs

StremCompat is intentionally optimized for televisions with old Chromium engines, slow CPUs and limited free memory. It does not attempt to render the same number of full-resolution interface assets as a current streaming box. This is what allows the UI, account data, addons and native player to coexist more reliably on the target televisions.

| Limit | Normal | Small TVs (webOS 3) |
|---|---:|---:|
| Browsing backdrop width | 960 pixels | 640 pixels |
| Decoded backdrop memory, approximately | 2.0 MiB at 960x540 RGBA | 0.9 MiB at 640x360 RGBA |
| Backdrops retained in the local cache | 24 | 6 |
| Simultaneous backdrop resize workers | 2 | 1 |
| Sources retained per item | 60 | 30 |
| Library items retained in memory | 60 | 30 |
| Catalog items retained per row | 16 | 10 |
| Addon catalog rows retained on Home | 24 | 16 |
| Discover items retained across incremental pages | 80 | 40 |

For comparison, one decoded 1920x1080 RGBA background can occupy about 8 MiB before browser and GPU overhead. Repeated full-resolution backgrounds caused memory pressure and sluggish focus movement on the target hardware. Therefore:

- Backgrounds and some catalog artwork can look softer than they do in a modern desktop or official current-generation application, especially when viewed close to a 4K panel.
- Normal limits keep higher-resolution artwork, a larger cache and more workers because the confirmed 50UM7500PSB handles them.
- Small TVs deliberately prefer stability over backdrop sharpness. It uses smaller artwork, fewer cached images, fewer catalog entries and a simpler low-memory transition path.
- Only the focused item's backdrop and logo are warmed ahead of time. Neighboring full-screen backgrounds are not all decoded while the user scrolls.
- Metadata, library, source and paginated Discover lists are capped per profile to prevent a large account or addon response from exhausting the television's memory.
- Backdrop and metadata updates are delayed briefly during rapid remote navigation, and obsolete requests are ignored or cancelled before they can repaint the current selection.
- Account, addon and artwork requests are bridged through the local server to avoid legacy browser TLS and CORS failures.
- Video playback still uses the source selected by the user through the television's hardware-backed HTML5 media pipeline. The backdrop limits affect **interface artwork only**; they do not reduce a 1080p or 4K video's resolution.

This tuning cannot add codec support or processing power that the firmware does not have. A visually lighter interface can improve navigation, but unsupported audio, containers, DRM, unusually high bitrates and very large remux files can still fail during playback.

## Playback limits

The application cannot expand the codecs or processing power available in the television firmware.

- Prefer direct or debrid sources using H.264 or television-supported HEVC with AAC or AC3.
- Very large 4K remux files, unsupported audio codecs and high bitrates can fail or exhaust memory.
- Addon availability, source metadata and seeder counts are controlled by external addon services.
- Seeder sorting works only when the addon exposes a recognizable number.
- Some HLS tags and multi-audio behavior are limited on webOS 3.x.
- DRM playback remains subject to the firmware's MSE, EME, Widevine and PlayReady versions.

## Television requirements

- A 32-bit-capable ARMv7 processor. A model that is x86 needs a different build of the programs in `native/`.
- A webOS JavaScript service runtime, which every webOS version has.

Models similar to a confirmed television are compatibility candidates, not confirmed devices. Add a television to the confirmed list only after installation, account login, catalog loading and playback have been tested on the physical device.

## Adapting the project to another TV

Requirements on the build computer:

- Windows PowerShell
- A supported Node.js version
- npm
- Network access for the first runtime download

Install dependencies and build the package:

```powershell
npm ci
npm run runtime
npm run package
```

The runtime preparation downloads the pinned archive from the `runtime-v3.0.0` build-dependency prerelease and verifies its SHA-256. Runtime binaries are not committed to this repository. To build them instead, on Linux or WSL:

```bash
native/build-ffmpeg.sh && native/build-engine.sh && native/collect.sh <folder>
node scripts/make-runtime-archive.js <folder> .cache/stremcompat-runtime-3.0.0.tar.gz
```

The scripts fetch their pinned compiler and tools into `~/stremcompat-build`, without installing anything on the system.

Torrent links name the server on the TV (`127.0.0.1:11470`). `service/server/server-address.js` keeps the optional address from Settings in `$HOME/.stremcompat/server-address.json` and rewrites those links when a stream reference is stored, so the player and the interface do not need to know which server is in use. An address is kept only after `/settings` or `/stats.json` answers there. `/serverconfig` refuses a POST that is not `application/json`, so a web page cannot change it without a preflight, which this server never allows.

To add another profile:

1. Copy the closest JSON file from `profiles/`.
2. Give the profile a unique `profile`, `appId`, `serviceId` and localhost `port`.
3. Set `graphicsResolution` to either `1920x1080` or `1280x720`. Do not use the physical panel resolution `1366x768` in the manifest.
4. Keep `ecmaTarget` at `chrome38`.
5. Keep the `smallTv` values for older televisions.
6. Reduce `sourceCap`, `libraryCap`, `catalogCap`, backdrop width, cache and workers for weak hardware.
7. Build with the new profile name:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build.ps1 -Profile your-profile
```

8. Test the resulting IPK on the physical television before declaring it compatible.

## Verification performed by the build

The build fails when it detects an incompatible or incomplete package. It checks:

- ES5 syntax for the system Node.js 0.12 launcher.
- Browser syntax for the selected Chromium target.
- Chromium 38 strict-mode function placement.
- Application and service IDs, versions and local ports.
- Supported `1920x1080` or `1280x720` graphics resolution in the staged manifest and final IPK.
- Resolution-aware card-row calculations at both viewport widths.
- Embedded UI byte equality with the packaged UI files.
- ARM32 little-endian ELF headers.
- Executable permissions for the torrent engine, FFmpeg and FFprobe inside the IPK.
- Presence of the account, addon, HLS and protected stream bridges.
- Package manifests and final IPK contents.
- That the server parses as ES5 and uses nothing Node.js 0.12 lacks.
- That the IPK does not contain Stremio's streaming server or the old logo.

Additional local tests exercise startup, remote focus, login/Home transitions, storage failures, addon requests, protected headers and relative HLS rewriting. The Chromium 38 integration test requires the official legacy Chromium snapshot in the local test cache.

`npm run test:visual:layouts` builds both profiles, opens each staged interface in a local browser at its declared viewport, verifies the login layout and a 14-catalog Home with interleaved addon failures, checks that remote navigation skips failed rows, and saves screenshots under `.build/visual-tests/`. This is a local layout check, not a substitute for physical-TV confirmation.

## Releases

Builds are released together under the StremCompat project version. Tags follow Semantic Versioning, such as `v1.0.4`. Each television port keeps its own internal version in the asset filename because the ports can evolve independently. The GitHub Actions release workflow builds all four generation-and-resolution combinations, verifies them, gives them descriptive filenames and attaches them to the matching GitHub Release.

Maintainer example:

```powershell
git tag v1.0.4
git push origin v1.0.4
```

Users do not need to create a Release. They only download the matching IPK from the Releases page.

## Samsung Tizen (test version)

The Samsung package shares the interface, the player and the local server with the LG packages. `src/platform/lg` and `src/platform/tizen` hold what differs, and `scripts/build-ui.js` picks one folder per platform.

- **Pages:** `index.html` and `player.html` are files inside the `.wgt`, so they can reach the `tizen` and `webapis` objects. A `<base>` tag points their requests at the local server. `appUrl()` handles moving between pages.
- **Service:** `platforms/tizen/service/main.js` runs `service/server/*.js` on the TV's own Node (4.4.3 on Tizen 3 and 4). `scripts/lib/legacy-node.js` rewrites `var { A } = require()` and stops the build on anything else Node 4 cannot run. `node4.js` fills in missing APIs and shares one TLS context with current root certificates, since Node 4's own list rejects Let's Encrypt's current chain. The service leaves about 90 seconds after the last request, and the pages ask it something every 30 seconds.
- **Player:** `src/platform/tizen/player.js` exposes AVPlay as the `<video>` element the player code expects.
- **What Tizen does not allow:** other programs cannot run, so there is no FFmpeg, FFprobe or torrent engine. Features that need them are off through `HAS_MEDIA_TOOLS`. The local streaming server is off through `localTorrents` in the profile.
- **Security:** a POST preflight is only answered for the app's own pages (`Origin: file://` or `null`).

```powershell
npm run build:tizen     # stage .build/tizen-armv7
npm run package:tizen   # build and sign dist/tizen/*.wgt (needs the Tizen CLI and the author certificate)
```

`NODE4=path\to\node.exe npm test` also checks the certificates and the API shims on a real Node 4. Updates must be signed with the same author certificate, which is kept outside the repository.
