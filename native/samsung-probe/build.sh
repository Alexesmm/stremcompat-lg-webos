#!/bin/bash
# Builds platforms/tizen/service/native-probe.node: see probe.c. Tizen TVs use glibc and soft-float calls.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/../toolchain.sh"
"$TOOLS/zig/zig" cc -target arm-linux-gnueabi.2.17 -mcpu=cortex_a9 -shared -Os -s "$HERE/probe.c" -o "$HERE/../../platforms/tizen/service/native-probe.node"
ls -l "$HERE/../../platforms/tizen/service/native-probe.node"
