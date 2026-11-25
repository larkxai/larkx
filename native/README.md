# Native core

This directory is the Phase 1 C++ execution foundation. It is not a Swift, Kotlin, or React Native SDK, and it does not replace `@larkxai/core`.

ABI version 1, in `abi/include/larkx.h`, persists protocol transitions, ownership fences, step attempts, reconciliation, and outbox rows. It does not call a model, submit a remote task, or export telemetry. The caller supplies identifiers. The core does not call back into the host.

## Build

Requires CMake 3.20 or newer, a C++20 compiler, and SQLite 3 development headers.

```bash
cmake -S native -B native/build -DCMAKE_BUILD_TYPE=Release
cmake --build native/build
ctest --test-dir native/build --output-on-failure
```

The Linux job links the system `libsqlite3`. Before the first Swift or Kotlin binding, the core should vendor the SQLite amalgamation so those SDKs do not depend on a platform SQLite.

`cmake/toolchains/android.cmake` stops when `ANDROID_NDK` is unset. `cmake/toolchains/ios.cmake` stops when the host is not Apple. Neither binary is produced by the Linux tests.

The behavioral freeze shared with the TypeScript protocol is `conformance/transitions.json`. The architecture and the later phases are in `docs/native/migration.md`.
