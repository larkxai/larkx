#!/usr/bin/env bash
# Build the static core and the Swift host, then run the recovery script.
# Exits non-zero when swiftc is missing so a Linux log cannot look like success.
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
if ! command -v swiftc >/dev/null 2>&1; then
  echo "swiftc is not available. examples/swift-agent was not compiled or run." >&2
  exit 1
fi

build="${LARKX_SWIFT_BUILD:-$root/native/build-swift}"
cmake -S "$root/native" -B "$build" -DCMAKE_BUILD_TYPE=Release
cmake --build "$build" --target larkx_core
swiftc \
  -import-objc-header "$root/examples/swift-agent/bridge.h" \
  -I "$root/native/abi/include" \
  "$root/examples/swift-agent/main.swift" \
  "$build/liblarkx_core.a" \
  -lsqlite3 \
  -lc++ \
  -o "$build/swift-agent"
"$build/swift-agent"
