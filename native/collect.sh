#!/bin/bash
# After build-ffmpeg.sh and build-engine.sh: gathers the programs for scripts/make-runtime-archive.js,
# and the license texts of what they contain into service/licenses.
# Usage: native/collect.sh <folder for the programs>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/toolchain.sh"
OUT="$SC_BUILD/out"
DEST="${1:?folder for the programs}"
LIC="$HERE/../service/licenses"
ENGINE="$SC_BUILD/engine"
LT="$ENGINE/build-arm-linux-musleabihf/_deps/nuvio_libtorrent-src"
BOOST="$ENGINE/build-arm-linux-musleabihf/_deps/nuvio_boost-src"
FF="$SC_BUILD/ffmpeg/ffmpeg-7.1.1"
ZIGLIB="$TOOLS/zig/lib"

mkdir -p "$DEST" "$LIC"
cp "$OUT/ffmpeg" "$OUT/ffprobe" "$OUT/sc-engine" "$OUT/ffmpeg-build-info.txt" "$DEST/"
cp "$OUT/ffmpeg-build-info.txt" "$LIC/ffmpeg-build-info.txt"
cp "$FF/COPYING.LGPLv2.1" "$LIC/LICENSE.ffmpeg-lgpl-2.1.txt"
cp "$LT/LICENSE" "$LIC/LICENSE.libtorrent.txt"
cp "$BOOST/LICENSE_1_0.txt" "$LIC/LICENSE.boost.txt"
cp "$SC_BUILD/ffmpeg/zlib/LICENSE" "$LIC/LICENSE.zlib.txt"
cp "$ZIGLIB/libc/musl/COPYRIGHT" "$LIC/LICENSE.musl.txt"
cp "$ZIGLIB/libcxx/LICENSE.TXT" "$LIC/LICENSE.libcxx.txt" 2>/dev/null || cp "$ZIGLIB/libcxx/LICENSE" "$LIC/LICENSE.libcxx.txt"
cp "$ENGINE/src/THIRD_PARTY_NOTICES.md" "$LIC/nuvio-engine-third-party-notices.md"
ls -l "$DEST" | tail -n +2
