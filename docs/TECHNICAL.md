# StremCompat technical notes

Background for contributors and curious users: why the project ships separate builds, how the package is put together, where the code lives, the memory profile of each television generation, how to adapt it to another TV and how releases are verified and published. Installation and everyday use are covered in the [README](../README.md).

## Why separate builds are required

LG changed the browser engine and available runtime across webOS generations:

| webOS generation | Browser engine | System JavaScript service runtime | Recommended build |
|---|---|---|---|
| webOS 3.x, 2016-2017 | Chromium 38 | Node.js 0.12.2 | `uj3-native-armv7` |
| webOS 4.x, 2018-2019 | Chromium 53 | Node.js 0.12.2 | `um4-armv7` |
| webOS 5 and newer | Newer Chromium versions | Node.js 8.12 to 20 | Not officially supported; `um4-armv7` reported working on webOS 7.0, needs testing per model |

Chromium 38 rejects JavaScript syntax and browser APIs that work on newer televisions. Old TV certificate stores can also reject otherwise valid HTTPS services. A single modern web application therefore cannot be assumed to work across all LG generations.

Graphics resolution is a separate compatibility decision. The value is declared in the package manifest before the application starts, so responsive CSS alone cannot correct a package launched with the wrong webOS graphics mode. StremCompat therefore shares one resolution-aware interface implementation while publishing separate `1920x1080` and `1280x720` manifests for each supported webOS generation.

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

The UM4 1920x1080 and 1280x720 builds use ports `8082` and `8084`. The UJ3 1920x1080 and 1280x720 builds use ports `8093` and `8094`. Each edition has its own app and service identity, so a test build cannot attach to a stale process from another edition.

## Code map

Edit the sources below, not the generated files.

| Area | Location | Notes |
|---|---|---|
| Launcher | `app/index.html` | Starts the service, waits for `/health`, opens the interface, shows startup errors |
| webOS service | `service/launch.js` | ES5 for Node.js 0.12; starts the bundled Node.js 18 runtime |
| Local server | `service/tvserver.js`, `service/server/` | Node.js 18; `routes.js` holds every HTTP route |
| Interface screens | `src/ui/views/` | Home, title page, source list, search, settings, login and others |
| Interface data | `src/ui/data/` | Account and library sync, catalogs, metadata, sources |
| Interface foundation | `src/ui/core/`, `src/ui/ui/`, `src/ui/input/`, `src/ui/features/` | Network and storage helpers, navigation, cards, remote and pointer input, trailers |
| Interface page and styles | `src/ui/index.html`, `src/ui/styles/` | One stylesheet per area; `compact-720p.css` adapts the 1280x720 packages |
| Player | `src/player/`, `service/player/player.css`, `service/player/player-body.html` | Controls, seeking, subtitles, progress and next episode |
| Shared by interface and player | `src/shared/` | Translations (`strings.js`), the finished-title rule, addon selection |
| Television editions | `profiles/` | Identity, version, port, resolution and memory limits of each package |
| Build and tests | `scripts/` | See below |

### Generated files

`npm run build:ui` generates these files, which are committed. `node scripts/build-ui.js --check` fails when one is stale.

| Generated file | Sources | Order |
|---|---|---|
| `service/beta-app.js` | `src/ui/` and `src/shared/` | `src/ui/modules.json` |
| `service/player/player-client.js` | `src/player/` and `src/shared/` | `src/player/modules.json` |
| `service/beta.html` | `src/ui/index.html` and `src/ui/styles/` | `src/ui/styles/styles.json` |

The scripts are plain fragments joined in the listed order, with no `import` or module loader. All modules of a bundle share one scope, so a function from one file can be called directly from another. A new file must be added to the matching `modules.json`, and order matters for code that runs at load time.

Browser code must stay ES5 and run on Chromium 38, which rejects newer syntax and block-level function declarations in strict mode. `service/launch.js` must also stay ES5. Only `service/tvserver.js` and `service/server/` can use modern JavaScript.

### Build, test and package

| Command | What it does |
|---|---|
| `npm run build:ui` | Regenerates the three files above |
| `npm test` | Interface and player tests in a Node.js VM, then runtime tests against a real local server |
| `npm run test:chrome38` | Runs the interface and player UI in real Chromium 38 (needs the snapshot in `.cache/chromium38`) |
| `npm run test:visual:layouts` | Checks the layouts of all four packages (needs Chrome) |
| `npm run lint`, `npm run format:check` | ESLint and Prettier |
| `npm run verify` | Checks syntax targets, required features, manifests and the bundled runtime |
| `npm run runtime` | Downloads the pinned runtime the packages need |
| `npm run package:all` | Builds, verifies and packages all four IPKs into `dist/` |

Packaging stages each edition in `.build/<profile>/` first: `scripts/build-stage.js` copies `app/` and `service/`, writes `service/profile.json` and fills in the launcher's port, version and service ID. Without `profile.json`, a source checkout runs as a development profile.

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

## Performance profile and image-quality trade-offs

StremCompat is intentionally optimized for televisions with old Chromium engines, slow CPUs and limited free memory. It does not attempt to render the same number of full-resolution interface assets as a current streaming box. This is what allows the UI, account data, addons and native player to coexist more reliably on the target televisions.

| Limit | UM4 for webOS 4.x | UJ3 for webOS 3.x |
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
- The UM4 edition keeps higher-resolution artwork, a larger cache and more workers because the confirmed 50UM7500PSB handles that profile.
- The UJ3 edition deliberately prefers stability over backdrop sharpness. It uses smaller artwork, fewer cached images, fewer catalog entries and a simpler low-memory transition path.
- Only the focused item's backdrop and logo are warmed ahead of time. Neighboring full-screen backgrounds are not all decoded while the user scrolls.
- Metadata, library, source and paginated Discover lists are capped per profile to prevent a large account or addon response from exhausting the television's memory.
- Backdrop and metadata updates are delayed briefly during rapid remote navigation, and obsolete requests are ignored or cancelled before they can repaint the current selection.
- Account, addon and artwork requests are bridged through the bundled Node.js runtime to avoid legacy browser TLS and CORS failures.
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

## Choosing a build for another television

Use the webOS TV version shown in the television information screen, not the firmware number by itself. Then select the graphics mode separately.

- Choose UJ3 for a 2016-2017 ARMv7 television running webOS 3.x and Chromium 38.
- Choose UM4 for an ARMv7 television running webOS 4.x and Chromium 53.
- Choose 1920x1080 graphics when the interface fills the screen correctly; choose 1280x720 graphics when a 1920 package is confined to the upper-left portion of the display.
- For a 1366x768 television panel, choose the 1280x720 graphics package.
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
npm run package:um4-hd
npm run package:uj3-native
npm run package:uj3-native-hd
```

The first runtime preparation downloads a pinned StremioBrew package, verifies SHA-256 `36c81015d851bfd4b12c40372edbe7b51fb67fe1d8cec828d0aeFA6CE8343DF7` case-insensitively, and extracts the required ARMv7 runtime files. Runtime binaries are not committed to this repository. The original upstream file was removed after version 2.0.0 replaced that architecture, so an unchanged checksum-verified copy is retained in the `runtime-v1.0.0` build-dependency prerelease. It is not a TV application download.

To add another profile:

1. Copy the closest JSON file from `profiles/`.
2. Give the profile a unique `profile`, `appId`, `serviceId` and localhost `port`.
3. Set `graphicsResolution` to either `1920x1080` or `1280x720`. Do not use the physical panel resolution `1366x768` in the manifest.
4. Set `ecmaTarget` to `chrome38` for webOS 3.x or `chrome53` for webOS 4.x.
5. Keep `lowMemory` enabled for older televisions.
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
- Executable permissions for Node.js, FFmpeg and FFprobe inside the IPK.
- Presence of the account, addon, HLS and protected stream bridges.
- Package manifests and final IPK contents.

Additional local tests exercise startup, remote focus, login/Home transitions, storage failures, addon requests, protected headers and relative HLS rewriting. The Chromium 38 integration test requires the official legacy Chromium snapshot in the local test cache.

`npm run test:visual:layouts` builds all four profiles, opens each staged interface in a local browser at its declared viewport, verifies the login layout and a 14-catalog Home with interleaved addon failures, checks that remote navigation skips failed rows, and saves screenshots under `.build/visual-tests/`. This is a local layout check, not a substitute for physical-TV confirmation.

## Releases

Builds are released together under the StremCompat project version. Tags follow Semantic Versioning, such as `v1.0.4`. Each television port keeps its own internal version in the asset filename because the ports can evolve independently. The GitHub Actions release workflow builds all four generation-and-resolution combinations, verifies them, gives them descriptive filenames and attaches them to the matching GitHub Release.

Maintainer example:

```powershell
git tag v1.0.4
git push origin v1.0.4
```

Users do not need to create a Release. They only download the matching IPK from the Releases page.
