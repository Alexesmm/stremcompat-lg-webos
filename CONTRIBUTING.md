# Contributing to StremCompat

Thank you for helping improve compatibility on older LG televisions. Contributions are most useful when they are based on a reproducible result from a real device.

Before participating, read the [Code of Conduct](CODE_OF_CONDUCT.md), [project notice](NOTICE.md) and [third-party component record](THIRD_PARTY.md).

## Discussions and Issues have different purposes

Use [GitHub Discussions](https://github.com/Alexesmm/stremcompat-lg-webos/discussions) for:

- Installation help and general questions.
- Ideas and feature proposals.
- Early test results that still need investigation.
- Requests for help identifying the correct package.

Use [GitHub Issues](https://github.com/Alexesmm/stremcompat-lg-webos/issues) for:

- Reproducible defects.
- Confirmed regressions between releases.
- Structured compatibility results that should update project documentation or code.

Search existing Issues and Discussions before opening a new report.

## Reporting a defect

Use the bug report form and include:

- Complete television model and regional suffix.
- Full webOS TV version and firmware version.
- Exact IPK filename and StremCompat release.
- Available internal storage.
- Whether Developer Mode and its timer are active.
- Clear reproduction steps, expected result and actual result.
- Complete error code, logs or a photograph when relevant.

Before reporting an update failure, close the app, power off the television, unplug it for at least 30 seconds and try again. Quick Start+ can retain an older local service after an IPK is installed over the same application ID.

Never publish passwords, authentication tokens, cookies or an active pairing QR code.

## Reporting television compatibility

Use the compatibility report form after testing the correct generation and graphics package. Test startup, login, Home catalogs, directional navigation and playback of a moderate H.264 source with AAC or AC3 audio.

A family prefix or similar model number is not enough to mark a television as confirmed. Confirmation requires a physical-device report with the exact model and system version.

## Preparing a code change

Requirements:

- Windows PowerShell.
- A supported Node.js version and npm.
- Network access for the first runtime download.

Install dependencies and run the standard verification:

```powershell
npm ci
npm run runtime
npm test
npm run verify
```

Build all supported packages with:

```powershell
npm run package:all
```

For interface changes, also run:

```powershell
npm run test:visual:layouts
```

Changes that affect the webOS 3 interface must remain compatible with Chromium 38 and the Node.js 0.12 launcher. Do not introduce modern JavaScript syntax into files that the legacy launcher or television browser executes directly.

## Pull requests

- Keep each pull request focused on one problem.
- Explain the user-visible effect and the televisions or profiles affected.
- Include test results and screenshots for interface changes.
- Do not commit generated IPKs, `.build`, `dist`, runtime binaries, credentials or pairing data.
- Do not copy source, artwork, fonts or binaries unless you have the right to contribute and redistribute them.
- Preserve third-party notices and document newly introduced components in `THIRD_PARTY.md`.

The repository currently does not assert one project-wide open-source license because parts of its inherited source and bundled runtime still have unresolved provenance. Discuss substantial code reuse or a new bundled dependency before investing in an implementation. Submitting a contribution does not override third-party copyright or license terms.
