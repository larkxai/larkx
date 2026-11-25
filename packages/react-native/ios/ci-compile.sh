#!/bin/sh
# Compile the iOS bridge against the shared core. This is not a simulator or device run.
set -eu
if [ "$(uname -s)" != "Darwin" ]; then
  echo "The iOS bridge compile requires macOS." >&2
  exit 1
fi
ROOT=$(CDPATH= cd -- "$(dirname "$0")/../../.." && pwd)
PACKAGE="$ROOT/packages/react-native"
CORE="$ROOT/native/build-rn-pic"
cmake -S "$ROOT/native" -B "$CORE" -DCMAKE_BUILD_TYPE=Release -DCMAKE_POSITION_INDEPENDENT_CODE=ON
cmake --build "$CORE" --target larkx_core --parallel
clang++ -std=c++20 -fobjc-arc -fPIC -c \
  -I "$PACKAGE/ios/ci" \
  -I "$PACKAGE/cpp" \
  -I "$ROOT/native/abi/include" \
  -I "$ROOT/native/core/include" \
  "$PACKAGE/ios/LarkXNativeCore.mm" \
  -o "$CORE/LarkXNativeCore.o"
clang++ -std=c++20 -fPIC -c \
  -I "$ROOT/native/abi/include" \
  -I "$ROOT/native/core/include" \
  "$PACKAGE/cpp/host_session.cpp" \
  -o "$CORE/host_session.o"
clang++ -std=c++20 -fPIC -c \
  -I "$PACKAGE/cpp" \
  "$PACKAGE/cpp/utf.cpp" \
  -o "$CORE/utf.o"
clang++ -dynamiclib \
  -o "$CORE/libLarkXNativeCore.dylib" \
  "$CORE/LarkXNativeCore.o" \
  "$CORE/host_session.o" \
  "$CORE/utf.o" \
  "$CORE/liblarkx_core.a" \
  -framework Foundation -lsqlite3 -lc++
echo "Compiled $CORE/libLarkXNativeCore.dylib"
