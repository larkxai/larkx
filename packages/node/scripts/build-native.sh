#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
if [ -z "${CXX:-}" ]; then
  probe=$(mktemp)
  if ! printf 'int main(){return 0;}\n' | c++ -x c++ - -o "$probe" >/dev/null 2>&1; then
    if command -v g++ >/dev/null 2>&1; then
      export CXX=g++
      export CC="${CC:-gcc}"
    fi
  fi
  rm -f "$probe"
fi
ARGS=""
if [ -n "${NODE_INCLUDE:-}" ]; then
  ARGS="$ARGS -DNODE_INCLUDE=${NODE_INCLUDE}"
fi
# shellcheck disable=SC2086
cmake -S "$ROOT/native" -B "$ROOT/build/cmake" -DCMAKE_BUILD_TYPE=RelWithDebInfo $ARGS
cmake --build "$ROOT/build/cmake" --target larkx_native --parallel
if [ ! -f "$ROOT/build/larkx_native.node" ]; then
  echo "The native addon build finished without $ROOT/build/larkx_native.node." >&2
  exit 1
fi
echo "Built $ROOT/build/larkx_native.node"
