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
cmake -S "$ROOT/cpp" -B "$ROOT/build/host-tests" -DCMAKE_BUILD_TYPE=RelWithDebInfo
cmake --build "$ROOT/build/host-tests" --target larkx_host_tests --parallel
"$ROOT/build/host-tests/larkx_host_tests"
