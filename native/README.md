# Native core

This directory is the C++20 execution engine. React Native is the public binding. The Node host and the Swift sample bind the same core. Swift and Kotlin product SDKs are planned. There is no TypeScript execution engine beside it.

ABI version 2, in `abi/include/larkx.h`, persists protocol transitions and runs the agent loop. `larkx_run_drive` returns one request. The host invokes the model or the tool and submits the result. The core does not call the host, a model SDK, or a device API. It does not submit a remote task or export telemetry.

Agent definitions are registered in process memory and must be registered again after a process restart. Run identity is durable. Committed model decisions and tool results are replayed. An interrupted non-idempotent tool becomes `UNKNOWN_OUTCOME` and is not executed again until reconcile. An interrupted idempotent model or tool may run again with the same operation id.

## Build

Requires CMake 3.20 or newer, a C++20 compiler, and SQLite 3 development headers.

```bash
cmake -S native -B native/build -DCMAKE_BUILD_TYPE=Release
cmake --build native/build
ctest --test-dir native/build --output-on-failure
```

The Linux job and the Node addon link the system `libsqlite3`. The Android React Native library compiles the pinned SQLite amalgamation `3450100`. The iOS pod links `libsqlite3` from the Apple SDK. Execution sources live under `native/`.

`cmake/toolchains/android.cmake` stops when `ANDROID_NDK` is unset. `cmake/toolchains/ios.cmake` stops when the host is not Apple. A Linux `ctest` run does not produce those binaries and does not run `examples/swift-agent/run.sh`.

`conformance/transitions.json` is the shared transition fixture. `core/tests/agent_tests.cpp` covers the agent loop. The layout of the bindings is in [docs/native/migration.md](../docs/native/migration.md).
