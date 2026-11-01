StremCompat
  License: LICENSE.gpl-3.0.txt (GPL-3.0-only)
  Source: https://github.com/Alexesmm/stremcompat-lg-webos

Third-party components in this package

FFmpeg and FFprobe (bin/ffmpeg, bin/ffprobe)
  LGPL build, without GPL or nonfree parts. License: LICENSE.ffmpeg-lgpl-2.1.txt
  Exact source, checksum and configure line: ffmpeg-build-info.txt
  Build script: native/build-ffmpeg.sh in the StremCompat repository.
  Linked statically with zlib (LICENSE.zlib.txt) and musl (LICENSE.musl.txt).
  To relink them against a changed FFmpeg, run that script over your modified source.

Torrent engine (bin/sc-engine)
  native/engine/sc-engine.cpp in the StremCompat repository, GPL-3.0-only.
  Nuvio Engine, GPL-3.0-or-later (LICENSE.gpl-3.0.txt), with its own third-party notices in
  nuvio-engine-third-party-notices.md. Source: https://github.com/NuvioMedia/nuvio-engine
  libtorrent (LICENSE.libtorrent.txt), Boost (LICENSE.boost.txt), LLVM libc++ (LICENSE.libcxx.txt)
  and musl (LICENSE.musl.txt).
  Exact versions and build script: native/build-engine.sh in the StremCompat repository.

Inter typeface
  License: fonts/OFL.txt in this package.

The local server runs on the Node.js that comes with the television, which is not part of this
package. Stremio's streaming server is not included and is not downloaded by this application;
an address for one on another computer can be set in Settings.

StremCompat is unofficial and is not affiliated with or endorsed by Stremio or LG Electronics.
