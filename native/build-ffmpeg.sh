#!/bin/bash
# Builds bin/ffmpeg and bin/ffprobe for 32-bit ARM televisions, with what the local server asks of
# them and nothing more (server/images.js, media.js, probe.js, subtitles.js). LGPL: no GPL or nonfree
# parts. Static executables, so they do not depend on the libraries of any webOS version.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/toolchain.sh"

FFMPEG_VERSION=7.1.1
FFMPEG_SHA256=733984395e0dbbe5c046abda2dc49a5544e7e0e1e2366bba849222ae9e3a03b1
ZLIB_VERSION=1.3.1
ZLIB_SHA256=9a93b2b7dfdac77ceba5a558a580e74667dd6fede4585b91eefb60f03b72df23
TARGET="${TARGET:-arm-linux-musleabihf}"
CPU="${CPU:-cortex_a9}"
OUT="${1:-$SC_BUILD/out}"
JOBS="${JOBS:-$(nproc)}"
WORK="$SC_BUILD/ffmpeg"
mkdir -p "$WORK" "$OUT"

TC="$WORK/tc-$TARGET"
mkdir -p "$TC"
printf '#!/bin/sh\nexec "%s" cc -target %s -mcpu=%s "$@"\n' "$TOOLS/zig/zig" "$TARGET" "$CPU" > "$TC/cc"
printf '#!/bin/sh\nexec "%s" ar "$@"\n' "$TOOLS/zig/zig" > "$TC/ar"
printf '#!/bin/sh\nexec "%s" ranlib "$@"\n' "$TOOLS/zig/zig" > "$TC/ranlib"
printf '#!/bin/sh\nexec "%s" objcopy "$@"\n' "$TOOLS/zig/zig" > "$TC/objcopy"
printf '#!/bin/sh\nexit 0\n' > "$TC/strip"   # the link step already strips
chmod +x "$TC"/*
FLAGS="-O2 -ffunction-sections -fdata-sections -ffile-prefix-map=$SC_BUILD=/build"

# ---- zlib: Matroska keeps some subtitle tracks compressed with it ----
PREFIX="$WORK/prefix-$TARGET"
if [ ! -f "$PREFIX/lib/libz.a" ]; then
  [ -s "$SC_BUILD/downloads/zlib-$ZLIB_VERSION.tar.gz" ] || curl -fsSL --retry 3 -o "$SC_BUILD/downloads/zlib-$ZLIB_VERSION.tar.gz" "https://github.com/madler/zlib/releases/download/v$ZLIB_VERSION/zlib-$ZLIB_VERSION.tar.gz"
  echo "$ZLIB_SHA256  $SC_BUILD/downloads/zlib-$ZLIB_VERSION.tar.gz" | sha256sum -c - >/dev/null
  rm -rf "$WORK/zlib"; mkdir -p "$WORK/zlib"
  tar -xzf "$SC_BUILD/downloads/zlib-$ZLIB_VERSION.tar.gz" -C "$WORK/zlib" --strip-components=1
  (cd "$WORK/zlib" && CC="$TC/cc" AR="$TC/ar" RANLIB="$TC/ranlib" CFLAGS="$FLAGS" ./configure --static --prefix="$PREFIX" >/dev/null && make -j "$JOBS" install >/dev/null)
fi

# ---- FFmpeg ----
TARBALL="$SC_BUILD/downloads/ffmpeg-$FFMPEG_VERSION.tar.xz"
[ -s "$TARBALL" ] || curl -fsSL --retry 3 -o "$TARBALL" "https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz"
echo "$FFMPEG_SHA256  $TARBALL" | sha256sum -c - >/dev/null
SRC="$WORK/ffmpeg-$FFMPEG_VERSION"
[ -f "$SRC/configure" ] || tar -xJf "$TARBALL" -C "$WORK"
B="$WORK/build-$TARGET"
mkdir -p "$B"

# Reads through the local proxy over plain HTTP. Decodes a frame for artwork and seek previews,
# and turns text subtitle tracks into SubRip. ffprobe only needs the demuxers and parsers.
CONFIG="--disable-everything --disable-autodetect --disable-doc --disable-debug --disable-avdevice --disable-postproc \
  --enable-small --enable-zlib --enable-static --disable-shared --enable-ffmpeg --enable-ffprobe --disable-ffplay \
  --enable-network --enable-protocol=http,tcp,file,pipe \
  --enable-demuxer=matroska,mov,mpegts,avi,hls,image2,mjpeg,image_jpeg_pipe,image_png_pipe,image_webp_pipe,srt,ass,webvtt,flv,mp3,aac,ac3,eac3,dts \
  --enable-parser=h264,hevc,mpeg4video,mpegvideo,vp9,av1,aac,ac3,dca,mpegaudio,mjpeg,png,vorbis,opus,flac \
  --enable-decoder=h264,hevc,mpeg4,mpeg2video,vp9,mjpeg,png,webp,subrip,srt,ass,ssa,webvtt,mov_text,text \
  --enable-encoder=mjpeg,subrip,srt \
  --enable-muxer=mjpeg,image2pipe,srt,null --enable-filter=scale,format,null \
  --enable-bsf=h264_mp4toannexb,hevc_mp4toannexb,extract_extradata,vp9_superframe_split"
CROSS="--enable-cross-compile --arch=arm --target-os=linux --cc=$TC/cc --ar=$TC/ar --ranlib=$TC/ranlib --strip=$TC/strip --nm=nm --host-cc=cc --pkg-config=false"
(cd "$B" && "$SRC/configure" --prefix="$WORK/install-$TARGET" $CROSS $CONFIG \
  --extra-cflags="$FLAGS -I$PREFIX/include" --extra-ldflags="-static -Wl,--gc-sections -Wl,--strip-all -L$PREFIX/lib" --extra-libs="-lz" > configure.out 2>&1) \
  || { tail -25 "$B/configure.out"; tail -25 "$B/ffbuild/config.log"; exit 1; }
make -C "$B" -j "$JOBS" ffmpeg ffprobe >/dev/null
cp "$B/ffmpeg_g" "$OUT/ffmpeg"
cp "$B/ffprobe_g" "$OUT/ffprobe"
printf '%s\n' "FFmpeg $FFMPEG_VERSION (LGPL-2.1-or-later), https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz, SHA-256 $FFMPEG_SHA256" \
  "zlib $ZLIB_VERSION, SHA-256 $ZLIB_SHA256" "Target: $TARGET, CPU $CPU" "configure: $CROSS $CONFIG" | tr -s ' ' > "$OUT/ffmpeg-build-info.txt"
ls -l "$OUT/ffmpeg" "$OUT/ffprobe"
