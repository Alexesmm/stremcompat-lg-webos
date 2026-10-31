# Project notice

StremCompat is an unofficial community compatibility project for legacy LG webOS televisions, with a test version for older Samsung Tizen televisions. It is not affiliated with or endorsed by Stremio, LG Electronics or Samsung.

## Attribution

StremCompat started as a fork of [kieranbrown/stremio-webos](https://github.com/kieranbrown/stremio-webos), whose earlier Theater television interface came from [NoobyGains/stremio-vidaa-tv](https://github.com/NoobyGains/stremio-vidaa-tv). The launcher and interface have since been rewritten. A line-by-line comparison on October 29, 2026 found only standard webOS boilerplate lines in common with the original launcher and no remaining code from the Theater interface. Since 2.0.0 the application has its own name, icon, splash image and application ID; versions before 2.0.0 used the Stremio logo and the `io.strem.tv` ID inherited from the original project.

The local runtime and server architecture were adapted from [simussu9-wq/stremiobrew](https://github.com/simussu9-wq/stremiobrew), and part of the local server code is still derived from it (on October 31, 2026, lines of at least 12 characters identical to the StremioBrew 1.0.0 package were about 19 % of the server and launcher code, mainly YouTube, subtitles, media and routing, and about 8 % of the interface and player, where some may be generic code). The build also takes the ARMv7 Node.js, FFmpeg, FFprobe and shared libraries from a pinned StremioBrew 1.0.0 package. Since 2.0.0, Stremio's closed-source streaming server is no longer redistributed: the television downloads it directly from Stremio on first use. Stremio has not been confirmed to authorize this use.

StremCompat-specific work includes the dedicated webOS 3 and webOS 4 compatibility profiles, low-memory interface, legacy-JavaScript boot path, account and addon bridges, stream filtering and sorting, playback integration, profile-aware packaging and automated verification.

## License

StremCompat is licensed under the [GNU General Public License, version 3](LICENSE) (GPL-3.0-only), which is also the license published by the current StremioBrew repository. The license covers the code in this repository, except where a file or the list below says otherwise.

It does not cover:

- **Stremio's streaming server.** It is closed-source software that belongs to Stremio. It is not in this repository or in the packages, and it remains subject to Stremio's terms.
- **Other third-party components**, such as Node.js and the Inter typeface, which keep their own licenses (see [THIRD_PARTY.md](THIRD_PARTY.md)).
- **Names and logos.** The license gives no rights to the StremCompat name and logo, or to the trademarks of Stremio, LG or Samsung.

## Open items

- **FFmpeg in the LG packages.** The bundled binary reports GPLv3 build flags, and the pinned StremioBrew 1.0.0 package does not identify its exact source revision or build scripts. Providing the exact corresponding source and build information is still pending. The Samsung package does not contain FFmpeg.
- **StremioBrew 1.0.0.** The current repository publishes GPL-3.0, while the pinned package did not embed a license or a source-revision notice. This project treats that code as GPL-3.0.

The two earlier interface repositories named above did not publish license files at the time of the October 22, 2026 provenance audit. Their code has since been replaced (see Attribution).

This notice is a factual provenance record, not legal advice. See [THIRD_PARTY.md](THIRD_PARTY.md) for the component inventory.
