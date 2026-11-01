# Project notice

StremCompat is an unofficial community compatibility project for legacy LG webOS televisions, with a test version for older Samsung Tizen televisions. It is not affiliated with or endorsed by Stremio, LG Electronics or Samsung.

## Attribution

StremCompat started as a fork of [kieranbrown/stremio-webos](https://github.com/kieranbrown/stremio-webos), whose earlier Theater television interface came from [NoobyGains/stremio-vidaa-tv](https://github.com/NoobyGains/stremio-vidaa-tv). The launcher and interface have since been rewritten. A line-by-line comparison on October 29, 2026 found only standard webOS boilerplate lines in common with the original launcher and no remaining code from the Theater interface. Since 2.0.0 the application has its own name, icon, splash image and application ID; versions before 2.0.0 used the Stremio logo and the `io.strem.tv` ID inherited from the original project.

The local server architecture was adapted from [simussu9-wq/stremiobrew](https://github.com/simussu9-wq/stremiobrew), and StremCompat's first builds were largely based on its 1.0.0 package: on the first commit, about 74 % of the project's code lines were identical to that package. Since then the project has been rewritten and expanded, and part of the local server still derives from it. On November 1, 2026, lines of at least 12 characters identical to that package were 5.4 % of the code, excluding generated files; many of them are generic lines such as `require` calls and route names, while `routes.js`, `proxy.js` and `player-page.js` keep more of the original structure. `node scripts/audit-lineage.js <stremiobrew-1.0.0.ipk>` reproduces the count. Since 3.0.0 the packages no longer contain anything from that package's binaries: Node.js is the television's own, and FFmpeg and the torrent engine are built from source by the scripts in `native/`. Since 3.0.0 Stremio's closed-source streaming server is neither redistributed nor downloaded by the app.

StremCompat-specific work includes the dedicated webOS 3 and webOS 4 compatibility profiles, low-memory interface, legacy-JavaScript boot path, account and addon bridges, stream filtering and sorting, playback integration, profile-aware packaging and automated verification.

## License

StremCompat is licensed under the [GNU General Public License, version 3](LICENSE) (GPL-3.0-only), which is also the license published by the current StremioBrew repository. The license covers the code in this repository, except where a file or the list below says otherwise.

It does not cover:

- **Other third-party components**, such as FFmpeg, Nuvio Engine, libtorrent and the Inter typeface, which keep their own licenses (see [THIRD_PARTY.md](THIRD_PARTY.md)).
- **Names and logos.** The license gives no rights to the StremCompat name and logo, or to the trademarks of Stremio, LG or Samsung.

## Open items

- **StremCompat before 3.0.0.** Those packages carried the FFmpeg binary from the StremioBrew 1.0.0 package, whose exact source revision is not identified. Packages from 3.0.0 on have `service/licenses/ffmpeg-build-info.txt` and `native/build-ffmpeg.sh` instead.
- **StremioBrew 1.0.0.** The repository publishes GPL-3.0, while the package did not embed a license or a source-revision notice. This project treats that code as GPL-3.0.

The two earlier interface repositories named above did not publish license files at the time of the October 22, 2026 provenance audit. Their code has since been replaced (see Attribution).

This notice is a factual provenance record, not legal advice. See [THIRD_PARTY.md](THIRD_PARTY.md) for the component inventory.
