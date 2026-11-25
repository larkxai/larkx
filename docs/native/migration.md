# Native core migration

LarkX is moving from a TypeScript-first durable workflow engine to one shared native execution core, with Swift, Kotlin, and TypeScript bindings around it. This document is the architecture for that move. It also records what Phase 1 has actually built.

The TypeScript packages remain the shipped runtime. `native/` is the Phase 1 foundation: the protocol state machines, SQLite persistence, and a C ABI that a later binding can call. It does not run an agent, submit a remote task, or export telemetry. Do not describe it as a replacement, and do not delete `@larkxai/core` until the native core passes equivalent conformance and recovery tests.

`larkxai/cloud` is optional observability. Required Cloud follow-ups are listed in [cloud-changes.md](cloud-changes.md) and are not implemented here.

## 1. Architecture

The product is durable orchestration for on-device AI agents. The core owns the execution lifecycle. It does not host agents, deploy them, run inference, or bill cloud compute.

Four pillars stay in force:

1. Durable mobile execution, including recovery after the process is killed.
2. Orchestration of local models, cloud models, native tools, remote tools, and remote agents. The parent run stays on the device. Delegating to a remote agent does not transfer ownership of that run.
3. Privacy controls that are separate from placement. `device-only` is the default. An egress decision does not sandbox arbitrary native code that opens its own socket.
4. Optional Cloud observability. Local execution never waits on a successful export.

The public mental model, for every language, is Runtime, Agent, Run, Tool, RemoteAgent, and Model. `defineWorkflow` and `ctx.step` stay available as advanced primitives. Ordinary agent execution must not require the caller to assemble a workflow by hand. That loop is Phase 2. Phase 1 only stores the runs and steps the loop will use.

Platform code stays outside the core. HTTP, model providers, native inference, camera and files, secure storage, application lifecycle, background scheduling, and connectivity are host adapters. The core sees completion, cancellation, and policy decisions through the C ABI. ABI version 1 has no callbacks, so the host drives each call and the core never re-enters it.

```text
native/
  abi/include/larkx.h     C ABI version 1
  core/include            C++20 interfaces used only inside the library
  core/src                reducer, JSON, SQLite
  core/tests              ABI tests
  conformance/            frozen tables shared with the TypeScript tests
  cmake/toolchains/       iOS and Android files that fail closed here
```

The existing TypeScript packages stay where they are. They are not moved to `legacy-typescript/`. Future platform repositories consume a known core version:

- `larkxai/ios` through Swift Package Manager.
- `larkxai/android` through Maven Central.
- `larkxai/react-native` through npm `@larkxai`.

This repository keeps the authoritative protocol, the core source, and the conformance fixtures. It does not publish a second copy of the execution engine inside each SDK.

## 2. C ABI version 1

`native/abi/include/larkx.h` is the stable boundary. The public types are POD structs and integers. No C++ object, `std::string`, or virtual call crosses it. The caller owns every buffer it passes in. `larkx_store_open` returns an opaque store; `larkx_store_close` destroys it. Store calls are serialized. A future callback must not re-enter the same store.

Versions reported by the store:

| Number         | Value | Meaning                                                 |
| -------------- | ----- | ------------------------------------------------------- |
| ABI            | 1     | This header.                                            |
| Protocol       | 1     | The TypeScript protocol state machines and event names. |
| Storage schema | 1     | The same tables as `@larkxai/storage-sqlite`.           |

The host supplies every run, step, attempt, event, operation, and outbox identifier. The core has no random source. The core builds the standard journal payload for each command. The host does not pass a free-form event body except where a transition payload is explicitly accepted, and that payload is rejected when a top-level key is `input`, `output`, `messages`, `prompt`, `toolResult`, or `content`.

Commands that exist now:

- Open, describe, and close a store. `LARKX_STORE_EXCLUSIVE_OWNERSHIP` is the mobile rule: an expired lease does not by itself let another owner take the run.
- Create a run and persist `CREATED` plus `WORKFLOW_CREATED` before the call returns. A second create with the same id is a no-op and does not compare the input. `larkx_run_compatible` compares the workflow name, version, and canonical input.
- Claim, renew, and release ownership. Same-owner refresh keeps the epoch. Release clears the owner and increments the epoch. `may_steal` is the host's decision that the previous owner is gone. The core does not read a pid or a JavaScript realm.
- Begin, commit, resolve, mark unknown, and reconcile a step. Commit stores the output and leaves the run status unchanged. The host transitions the run.
- Replay. A completed step returns the stored output and `invoke_handler = 0`. The core does not call a handler. A pending or retry-scheduled step, or a missing step, sets `invoke_handler = 1`. A running, waiting, failed, unknown, or cancelled step sets it to 0 so recovery must classify the running step before another begin.
- Insert an outbox row. The same operation id and the same canonical payload is a duplicate. A different payload or step key for that operation id is a state error.
- `larkx_interrupted_resolution` writes `retry` for `pure` and `idempotent`, and `unknown` for `non-idempotent`.
- `larkx_egress_allowed` allows `local` under every policy, allows `cloud-model`, `remote-tool`, and `remote-agent` only when the policy is `cloud-allowed`, and denies `telemetry` from this function. An exporter is a separate opt-in.

Cancel sets a flag. It does not by itself move the run to `CANCELLED`.

Error codes:

| Code                         | When                                                                                                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LARKX_ERR_INVALID_ARGUMENT` | Null or malformed input, unknown status, bad JSON.                                                                                                                               |
| `LARKX_ERR_STATE`            | Illegal transition, replay divergence, outbox payload conflict.                                                                                                                  |
| `LARKX_ERR_OWNERSHIP`        | The fence does not match the current owner and epoch.                                                                                                                            |
| `LARKX_ERR_STORAGE`          | SQLite failure, or a schema version newer than 1.                                                                                                                                |
| `LARKX_ERR_NOT_FOUND`        | The run or step is missing. The TypeScript storage layer used `storage_failure` for a missing step. Native uses not-found so the host can tell a missing row from a broken file. |
| `LARKX_ERR_SERIALIZATION`    | A sensitive event key, or JSON the canonical encoder rejects.                                                                                                                    |
| `LARKX_ERR_CAPACITY`         | A caller buffer is short. `needed` includes the terminating NUL.                                                                                                                 |

JSON is a small parser in the core: one mebibyte, depth 64, duplicate object keys rejected, surrogate pairs rejected, object keys sorted on output, number lexemes preserved. That last rule can differ from `JSON.stringify` for numbers such as `1.0` versus `1`. Callers that compare stored documents must parse them. Integer objects used by the current tests match.

SQLite uses WAL, foreign keys, a five-second busy timeout, and `synchronous=NORMAL`. A failed WAL pragma does not fail the open. `schema_migrations.applied_at` is stored as 0. The artifacts table is created so the schema matches version 1; ABI 1 has no artifact calls. Writes copy the state, apply the reducer, and commit in one transaction. A rejected command rolls back, including its events.

Remote-agent states are specified in section 6 and are not exposed by ABI 1. Adding them is a protocol and schema change.

## 3. TypeScript to native mapping

| TypeScript                                                  | Native Phase 1                                                                           | Later                                                |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `@larkxai/protocol` transitions, effects, event names       | `transitions.cpp` and `conformance/transitions.json`                                     | New remote states need protocol version 2.           |
| `reduceApply` in `@larkxai/core`                            | `reducer.cpp` for create, claim, begin, commit, resolve, mark unknown, reconcile, outbox | Agent loop commands stay in the host until Phase 2.  |
| `prepareInterrupted`                                        | `larkx_interrupted_resolution` plus `larkx_step_mark_unknown` or `larkx_step_resolve`    | The host recovery loop that calls them is Phase 2.   |
| `workflow_runs`, `workflow_steps`, attempts, events, outbox | `sqlite_store.cpp`, schema version 1                                                     | Artifact bytes and a proven byte-identical database. |
| Node pid-file steal, mobile exclusive ownership             | `may_steal` and `LARKX_STORE_EXCLUSIVE_OWNERSHIP`                                        | Platform lifecycle still decides when to steal.      |
| `createAgent` / `defineTool`                                | Not implemented                                                                          | Phase 2 Runtime, Agent, Run, Tool.                   |
| Model and Cactus adapters                                   | Not implemented                                                                          | Host interfaces. The core must not link a model SDK. |
| `@larkxai/telemetry`                                        | Not implemented                                                                          | Phase 5, using the existing cursor and allowlist.    |
| Remote dispatch types                                       | Outbox insert and dedupe only                                                            | Phase 4 submission and recovery.                     |

The authoritative rows remain `workflow_runs` and `workflow_steps`. `workflow_events` is an append-only journal in the same transaction. Replay does not fold events back into state. Completed steps are not executed again. `pure` and `idempotent` retries keep the same operation id. `non-idempotent` interruption becomes `UNKNOWN_OUTCOME` and the run becomes `BLOCKED`. Reconciliation is explicit. Terminal workflow statuses have no exits. `FAILED` is not retried in place.

## 4. Conformance

`native/conformance/transitions.json` is the language-independent freeze:

- workflow and step transition tables
- sensitive event keys
- interrupt resolution
- egress matrix

`tests/native/conformance-fixtures.test.ts` fails if that file drifts from `@larkxai/protocol` or from schema version 1. `native/core/tests/core_tests.cpp` fails if the C ABI disagrees with the same file. The C++ tests also cover the recovery guarantees that can be stated without an agent loop:

- a committed output is returned on replay, including after the file is reopened, and the handler is not invoked
- an idempotent retry that changes the operation id is rejected; the original id is kept and the attempt count increases
- a non-idempotent interrupt resolves to `unknown`, a second begin is rejected, and reconcile `retry` returns the same operation id
- a stolen epoch rejects the old owner's commit
- a sensitive payload rolls back the transition
- an outbox conflict does not insert a second payload
- exclusive ownership survives lease expiry unless `may_steal` is set
- schema version 2 refuses to open

The TypeScript crash tests remain the behavioral reference for process death. A green native `ctest` does not replace them, and it is not a device run.

## 5. Platform bindings

Bindings are later repositories. They call `larkx.h` and present an idiomatic Runtime, Agent, and Run. Pure Swift and Kotlin applications must not embed a JavaScript engine.

Each binding owns:

- memory of the strings it copies out of the fixed ABI buffers
- the thread that calls the store
- cancellation of host work that is still in flight
- secure storage for credentials, which never enter the journal, the outbox payload, or telemetry
- application lifecycle and any OS background scheduling

The core does not claim that execution continues after the operating system has terminated the process. Recovery runs when the process is allowed to start again. Background execution, when the OS grants it, is a separate host capability.

Distribution pins a core version. The iOS package, the Android artifact, and the React Native package each record the ABI version they were built against. An ABI bump is a new header and a new major for those bindings. Protocol and schema versions stay independent of that number.

Before the first binding, vendor the SQLite amalgamation. The Linux CI job may keep linking the system library.

`cmake -S native -B build-android -DCMAKE_TOOLCHAIN_FILE=native/cmake/toolchains/android.cmake` fails on this repository's Linux CI because `ANDROID_NDK` is unset. The iOS file fails when the host is not Apple. Those files are the intended cross-compile entry points. They are not evidence that an iOS or Android binary has been produced.

## 6. Remote delegation, specified and not built

A RemoteAgent is an agent the developer deploys. LarkX does not host it. Supported shapes are an A2A-compatible agent and a custom asynchronous HTTP task endpoint. A2A compatibility does not mean the peer deduplicates submissions.

The lifecycle to implement in Phase 4, with an explicit transition table at that time:

| State           | Terminal             |
| --------------- | -------------------- |
| queued          | no                   |
| submitting      | no                   |
| accepted        | no                   |
| working         | no                   |
| input_required  | no                   |
| completed       | yes                  |
| failed          | yes                  |
| cancelled       | yes                  |
| unknown_outcome | yes, until reconcile |

Before any network send, the device persists the delegation intent, a stable client operation id, the allowed outbound payload, and the target agent. After acceptance, the remote task id is stored separately from the client operation id. Results come back by polling or by a supported event stream. After the local process dies, recovery restores the parent run and the pending delegation, then continues local reasoning when the remote result is known.

If the peer accepted the task but the acknowledgement was lost, the adapter may reconcile by operation id or repeat a submit only when that adapter has recorded a dedupe capability. Otherwise the step becomes `UNKNOWN_OUTCOME`. An unresolved reconcile stays blocked. The adapter must declare whether it supports dedupe, reconciliation, cancellation, and task persistence.

Offline execution queues eligible remote work in the outbox. Uncertain non-idempotent submissions are not retried automatically. Local steps still run with no network and with no Cloud account.

User input required is `input_required`. It keeps the history. It is not a new run.

## 7. Privacy

Placement and egress are different decisions. `larkx_egress_allowed` is the SDK channel check:

- `local` always
- cloud models, remote tools, and remote agents only under `cloud-allowed`
- telemetry never, from this function

Filtering happens before data leaves through an SDK-managed channel. Credentials stay in platform secure storage. The journal and telemetry must not contain prompts, model responses, tool inputs or outputs, private files, raw remote payloads, credentials, or sensitive user information. A custom native tool can still open its own connection. The core does not claim to prevent that.

## 8. Backlog

The order is a dependency order. Later items are not implemented.

1. Phase 1, this change. Freeze the tables, land the C ABI, the reducer, SQLite schema 1, the host tests, and the fail-closed toolchain files.
2. Still before a binding. Vendor SQLite. Cross-compile on a machine with the Android NDK and on an Apple host. Those builds are not done in this change.
3. Phase 2. Runtime, Agent, Run, and Tool on top of the ABI. Replay skips committed handlers. Recovery calls the interrupt classification. Operation ids and reconcile match the TypeScript crash tests.
4. Phase 3. Swift, Kotlin, and React Native bindings, lifecycle hooks, and physical-device crash recovery. A simulator log is not that proof.
5. Phase 4. RemoteAgent state machine, offline queue, custom HTTP, A2A, lost-ack handling, and egress checks on the bytes that would be sent.
6. Phase 5. Versioned native telemetry, Cloud compatibility tests, examples, and package distribution. The Cloud edits in [cloud-changes.md](cloud-changes.md) land with that phase, not before the protocol version exists.

Out of scope until a later design: agent hosting, deployment, managed workers, billing, moving a parent run off the device, device-to-device ownership transfer, and a custom inference engine. Serializable run state, definition versions, and ownership epochs stay in the schema so a future move remains possible.

## 9. Decisions and risks

Decisions:

- The shared core is C++20 and CMake. The public boundary is a C ABI.
- Protocol 1 and schema 1 stay in force. Remote-agent states wait for a version bump.
- The TypeScript tree stays in place and stays the shipped engine.
- Identifiers come from the host. Event payloads for the standard commands come from the core.
- Exclusive ownership is an open flag, not a column. A process that opens a mobile database without the flag can take an expired lease. Mobile bindings must pass the flag.
- `may_steal` means the host has decided the previous owner is gone. Lease expiry is not that decision when the flag is set.
- System SQLite is acceptable for the Linux tests. Bindings vendor it.
- Egress for telemetry is denied by the policy function so `cloud-allowed` cannot be read as permission to export.

Risks:

- Canonical JSON may not be byte-identical to the TypeScript encoder for every number. Do not claim a shared database file is interchangeable until a fixture compares both writers.
- The agent loop is still TypeScript. Two interpreters can drift until Phase 2 runs the same crash fixtures through the ABI.
- ABI structs and functions must not share a typedef name. The header uses `*_spec` typedefs for that reason. A later edit that collapses those names will fail to compile as C.
- Cloud rejects sensitive keys recursively and then stores other payload extras. The SDK journal check is top-level, matching the TypeScript reducer. The allowlist tightening is a Cloud change, not a silent native change.
- No iOS or Android binary has been produced. Toolchain files that fail closed are not a cross-compile.
- Physical-device recovery is not claimed.
