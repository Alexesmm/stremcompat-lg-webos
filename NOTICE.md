# Project notice

StremCompat is an unofficial community compatibility project for legacy LG webOS televisions. It is not affiliated with or endorsed by Stremio or LG Electronics.

## Attribution

The packaged webOS bootstrap, manifest structure and launcher were adapted from [kieranbrown/stremio-webos](https://github.com/kieranbrown/stremio-webos), with contributions in that repository attributed to its maintainers and contributors. That project states that its Theater television interface was built from [NoobyGains/stremio-vidaa-tv](https://github.com/NoobyGains/stremio-vidaa-tv).

The local runtime and server architecture were adapted from [simussu9-wq/stremiobrew](https://github.com/simussu9-wq/stremiobrew). The build also extracts the ARMv7 Node.js, FFmpeg, FFprobe, shared libraries and Stremio streaming server from a pinned StremioBrew 1.0.0 package.

StremCompat-specific work includes the dedicated webOS 3 and webOS 4 compatibility profiles, low-memory interface, legacy-JavaScript boot path, account and addon bridges, stream filtering and sorting, playback integration, profile-aware packaging and automated verification.

## Current licensing status

No repository-wide open-source license is currently asserted.

At the time of the October 22, 2026 provenance audit, the two earlier interface repositories named above did not publish license files. Their source is therefore not presumed to be covered by a permissive open-source license. The current StremioBrew repository publishes GPL-3.0, while the pinned 1.0.0 package used here did not embed a license or corresponding source-revision notice.

The bundled FFmpeg binary reports GPLv3 build flags. Anyone redistributing release packages should satisfy the applicable GPLv3 obligations and provide exact corresponding source and build information. Until the inherited unlicensed bootstrap code is replaced or explicit permission is obtained, and the runtime source provenance is completed, public redistribution has unresolved licensing risk.

This notice is a factual provenance record, not legal advice. See [THIRD_PARTY.md](THIRD_PARTY.md) for the component inventory.
