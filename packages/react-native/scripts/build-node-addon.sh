#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
ARGS=""
if [ -n "${NODE_INCLUDE:-}" ]; then
  ARGS="$ARGS -DNODE_INCLUDE=${NODE_INCLUDE}"
fi
# shellcheck disable=SC2086
cmake -S "$ROOT/cpp" -B "$ROOT/build" -DCMAKE_BUILD_TYPE=RelWithDebInfo $ARGS
cmake --build "$ROOT/build" --target larkx_native --target larkx_host_tests --parallel
"$ROOT/build/larkx_host_tests"
