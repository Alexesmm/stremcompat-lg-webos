#!/bin/bash
# Builds bin/sc-engine for 32-bit ARM televisions: upstream Nuvio Engine (GPL-3.0-or-later) at a
# pinned commit, libtorrent as that project pins it, and native/engine/sc-engine.cpp. A single
# static executable, so it does not depend on the libraries of any webOS version.
# No OpenSSL: peer encryption works, HTTPS trackers do not.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/toolchain.sh"

ENGINE_COMMIT=167f8541d2
TARGET="${TARGET:-arm-linux-musleabihf}"
CPU="${CPU:-cortex_a9}"
OUT="${1:-$SC_BUILD/out}"
JOBS="${JOBS:-$(nproc)}"
WORK="$SC_BUILD/engine"
SRC="$WORK/src"
BUILD="$WORK/build-$TARGET"
mkdir -p "$WORK" "$OUT"

if [ ! -d "$SRC/.git" ]; then
  git clone -q https://github.com/NuvioMedia/nuvio-engine "$SRC"
fi
git -C "$SRC" fetch -q origin
git -C "$SRC" checkout -q "$ENGINE_COMMIT"

TC="$WORK/tc-$TARGET"
mkdir -p "$TC"
printf '#!/bin/sh\nexec "%s" cc -target %s -mcpu=%s "$@"\n' "$TOOLS/zig/zig" "$TARGET" "$CPU" > "$TC/cc"
printf '#!/bin/sh\nexec "%s" c++ -target %s -mcpu=%s "$@"\n' "$TOOLS/zig/zig" "$TARGET" "$CPU" > "$TC/c++"
printf '#!/bin/sh\nexec "%s" ar "$@"\n' "$TOOLS/zig/zig" > "$TC/ar"
printf '#!/bin/sh\nexec "%s" ranlib "$@"\n' "$TOOLS/zig/zig" > "$TC/ranlib"
chmod +x "$TC/cc" "$TC/c++" "$TC/ar" "$TC/ranlib"
cat > "$TC/toolchain.cmake" <<EOF
set(CMAKE_SYSTEM_NAME Linux)
set(CMAKE_SYSTEM_PROCESSOR arm)
set(CMAKE_C_COMPILER $TC/cc)
set(CMAKE_CXX_COMPILER $TC/c++)
set(CMAKE_AR $TC/ar)
set(CMAKE_RANLIB $TC/ranlib)
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)
EOF

FLAGS="-ffunction-sections -fdata-sections -D_FILE_OFFSET_BITS=64 -D_LARGEFILE64_SOURCE -ffile-prefix-map=$SC_BUILD=/build"
cmake -S "$SRC" -B "$BUILD" -G Ninja \
  -DNUVIO_ENGINE_ENABLE_LIBTORRENT=ON -DNUVIO_ENGINE_BUILD_TESTS=OFF \
  -DCMAKE_TOOLCHAIN_FILE="$TC/toolchain.cmake" -DCMAKE_BUILD_TYPE=MinSizeRel -DCMAKE_POSITION_INDEPENDENT_CODE=OFF \
  -DCMAKE_DISABLE_FIND_PACKAGE_OpenSSL=ON -DCMAKE_DISABLE_FIND_PACKAGE_GnuTLS=ON -DCMAKE_DISABLE_FIND_PACKAGE_LibGcrypt=ON \
  -DCMAKE_C_FLAGS="$FLAGS" -DCMAKE_CXX_FLAGS="$FLAGS" >/dev/null
ninja -j "$JOBS" -C "$BUILD" nuvio_engine

"$TC/c++" -std=c++20 -Os $FLAGS -static -I"$SRC/include" "$HERE/engine/sc-engine.cpp" \
  "$BUILD/libnuvio_engine.a" "$BUILD/_deps/nuvio_libtorrent-build/libtorrent-rasterbar.a" \
  -Wl,--gc-sections -Wl,--strip-all -lpthread -o "$OUT/sc-engine"
ls -l "$OUT/sc-engine"
