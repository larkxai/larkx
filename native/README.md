# Native core

This directory is the C++20 execution core. It is not a Swift, Kotlin, or React Native SDK, and it does not replace `@larkxai/core`. The TypeScript engine remains the shipped runtime.

ABI version 2, in `abi/include/larkx.h`, persists protocol transitions and runs an agent loop. `larkx_run_drive` returns one request. The host invokes the model or the tool and submits the result. The core does not call the host, a model SDK, or a device API. It does not submit a remote task or export telemetry.

Agent definitions are registered in process memory and must be registered again after a process restart. Run identity is durable. Committed model decisions and tool results are replayed. An interrupted non-idempotent tool becomes `UNKNOWN_OUTCOME` and is not executed again until reconcile. An interrupted idempotent model or tool may run again with the same operation id. That window is documented in `docs/native/migration.md`.

## Build

Requires CMake 3.20 or newer, a C++20 compiler, and SQLite 3 development headers.

```bash
cmake -S native -B native/build -DCMAKE_BUILD_TYPE=Release
cmake --build native/build
ctest --test-dir native/build --output-on-failure
```

The Linux job links the system `libsqlite3`. Before the first Swift or Kotlin binding, the core should vendor the SQLite amalgamation so those SDKs do not depend on a platform SQLite.

`cmake/toolchains/android.cmake` stops when `ANDROID_NDK` is unset. `cmake/toolchains/ios.cmake` stops when the host is not Apple. Neither binary is produced by the Linux tests.

The behavioral freeze shared with the TypeScript protocol is `conformance/transitions.json`. The agent loop is covered by `core/tests/agent_tests.cpp`. `examples/swift-agent/run.sh` builds a pure Swift host and recovers one run. It exits non-zero when `swiftc` is missing, and a Linux `ctest` run is not that script. The architecture and the later phases are in `docs/native/migration.md`.
