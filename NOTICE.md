# Project notice

StremCompat is an unofficial community compatibility project for legacy LG webOS televisions. It is not affiliated with or endorsed by Stremio or LG Electronics.

## Attribution

StremCompat started as a fork of [kieranbrown/stremio-webos](https://github.com/kieranbrown/stremio-webos), whose earlier Theater television interface came from [NoobyGains/stremio-vidaa-tv](https://github.com/NoobyGains/stremio-vidaa-tv). The launcher and interface have since been rewritten. A line-by-line comparison on October 29, 2026 found only standard webOS boilerplate lines in common with the original launcher and no remaining code from the Theater interface. Since 2.0.0 the application has its own name, icon, splash image and application ID; versions before 2.0.0 used the Stremio logo and the `io.strem.tv` ID inherited from the original project.

The local runtime and server architecture were adapted from [simussu9-wq/stremiobrew](https://github.com/simussu9-wq/stremiobrew), and part of the local server code is still derived from it (about 28 % of its lines were identical to StremioBrew 1.0.0 on October 29, 2026, mainly subtitles, media, YouTube, routing and proxy code). The build also takes the ARMv7 Node.js, FFmpeg, FFprobe and shared libraries from a pinned StremioBrew 1.0.0 package. Since 2.0.0, Stremio's closed-source streaming server is no longer redistributed: the television downloads it directly from Stremio on first use. Stremio has not been confirmed to authorize this use.

StremCompat-specific work includes the dedicated webOS 3 and webOS 4 compatibility profiles, low-memory interface, legacy-JavaScript boot path, account and addon bridges, stream filtering and sorting, playback integration, profile-aware packaging and automated verification.

## Current licensing status

No repository-wide open-source license is currently asserted.

At the time of the October 22, 2026 provenance audit, the two earlier interface repositories named above did not publish license files. Their source is therefore not presumed to be covered by a permissive open-source license. The current StremioBrew repository publishes GPL-3.0, while the pinned 1.0.0 package used here did not embed a license or corresponding source-revision notice.

The bundled FFmpeg binary reports GPLv3 build flags. Anyone redistributing release packages should satisfy the applicable GPLv3 obligations and provide exact corresponding source and build information. The inherited unlicensed bootstrap and interface code has since been replaced (see Attribution); the StremioBrew-derived server code and runtime still need their source provenance completed. Until then, public redistribution has unresolved licensing risk.

This notice is a factual provenance record, not legal advice. See [THIRD_PARTY.md](THIRD_PARTY.md) for the component inventory.
