#!/bin/bash
# Fetches the pinned build tools into $SC_BUILD (default ~/stremcompat-build), without installing
# anything on the system. Runs on x86-64 Linux, including Ubuntu under WSL. Source it to get PATH.
set -euo pipefail

SC_BUILD="${SC_BUILD:-$HOME/stremcompat-build}"
TOOLS="$SC_BUILD/tools"
mkdir -p "$TOOLS" "$SC_BUILD/downloads"

ZIG_VERSION=0.17.0
ZIG_SHA256=1cbe9df9f27e6b78d14ccbca43b6703a404ef79ef1c463de901d7f088d4e2026
CMAKE_VERSION=3.31.8
NINJA_VERSION=1.13.2
MAKE_VERSION=4.4.1

fetch() { # url file [sha256]
  local out="$SC_BUILD/downloads/$2"
  [ -s "$out" ] || curl -fsSL --retry 3 -o "$out" "$1"
  if [ -n "${3:-}" ]; then echo "$3  $out" | sha256sum -c - >/dev/null; fi
  echo "$out"
}

if [ ! -x "$TOOLS/zig/zig" ]; then
  tarball=$(fetch "https://ziglang.org/download/$ZIG_VERSION/zig-x86_64-linux-$ZIG_VERSION.tar.xz" "zig-$ZIG_VERSION.tar.xz" "$ZIG_SHA256")
  mkdir -p "$TOOLS/zig"
  tar -xJf "$tarball" -C "$TOOLS/zig" --strip-components=1
fi

if [ ! -x "$TOOLS/cmake/bin/cmake" ]; then
  tarball=$(fetch "https://github.com/Kitware/CMake/releases/download/v$CMAKE_VERSION/cmake-$CMAKE_VERSION-linux-x86_64.tar.gz" "cmake-$CMAKE_VERSION.tar.gz")
  mkdir -p "$TOOLS/cmake"
  tar -xzf "$tarball" -C "$TOOLS/cmake" --strip-components=1
fi

if [ ! -x "$TOOLS/bin/ninja" ]; then
  archive=$(fetch "https://github.com/ninja-build/ninja/releases/download/v$NINJA_VERSION/ninja-linux.zip" "ninja-$NINJA_VERSION.zip")
  mkdir -p "$TOOLS/bin"
  python3 -c "import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$archive" "$TOOLS/bin"
  chmod +x "$TOOLS/bin/ninja"
fi

# compiler wrappers for the machine that builds (make itself, FFmpeg's helper programs)
mkdir -p "$TOOLS/bin"
for pair in "cc:cc" "c++:c++"; do
  name="${pair%%:*}"
  command -v "$name" >/dev/null 2>&1 && continue
  printf '#!/bin/sh\nexec "%s" %s "$@"\n' "$TOOLS/zig/zig" "${pair##*:}" > "$TOOLS/bin/$name"
  chmod +x "$TOOLS/bin/$name"
done
export PATH="$TOOLS/bin:$TOOLS/cmake/bin:$TOOLS/zig:$PATH"

if ! command -v make >/dev/null 2>&1; then
  tarball=$(fetch "https://ftp.gnu.org/gnu/make/make-$MAKE_VERSION.tar.gz" "make-$MAKE_VERSION.tar.gz")
  work="$SC_BUILD/make-src"
  rm -rf "$work"; mkdir -p "$work"
  tar -xzf "$tarball" -C "$work" --strip-components=1
  (cd "$work" && ./configure --quiet --disable-dependency-tracking CC="$TOOLS/bin/cc" >/dev/null && sh ./build.sh >/dev/null)
  cp "$work/make" "$TOOLS/bin/make"
fi

export SC_BUILD TOOLS
