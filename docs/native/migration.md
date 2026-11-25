# Native core migration

LarkX is moving from a TypeScript-first durable workflow engine to one shared native execution core, with Swift, Kotlin, and TypeScript bindings around it. This document is the architecture for that move. It records what Phase 1 and Phase 2 have actually built.

The TypeScript packages remain the shipped runtime. `native/` is the C++20 core. Phase 1 persists protocol transitions. Phase 2 runs an autonomous agent loop on that store: the core asks the host to invoke a model or a tool, and the host submits the result. It does not submit a remote task, export telemetry, or link an inference SDK. Do not describe it as a replacement, and do not delete `@larkxai/core` until a binding has matched the TypeScript crash tests on a device.

`larkxai/cloud` is optional observability. Required Cloud follow-ups are listed in [cloud-changes.md](cloud-changes.md) and are not implemented here.

## 1. Architecture

The product is durable orchestration for on-device AI agents. The core owns the execution lifecycle. It does not host agents, deploy them, run inference, or bill cloud compute.

Four pillars stay in force:

1. Durable mobile execution, including recovery after the process is killed.
2. Orchestration of local models, cloud models, native tools, remote tools, and remote agents. The parent run stays on the device. Delegating to a remote agent does not transfer ownership of that run.
3. Privacy controls that are separate from placement. `device-only` is the default. An egress decision does not sandbox arbitrary native code that opens its own socket.
4. Optional Cloud observability. Local execution never waits on a successful export.

The public mental model, for every language, is Runtime, Agent, Run, Tool, RemoteAgent, and Model. `defineWorkflow` and `ctx.step` stay available as advanced primitives. Ordinary agent execution does not require the caller to assemble a workflow by hand. The native loop keeps the workflow reducer as its execution primitive. RemoteAgent is specified in section 6 and is not implemented.

Platform code stays outside the core. HTTP, model providers, native inference, camera and files, secure storage, application lifecycle, background scheduling, and connectivity are host adapters. The core returns an execution request. The host performs the platform work and submits the result. ABI version 2 has no callbacks, so the core does not re-enter the host.

```text
native/
  abi/include/larkx.h     C ABI version 2
  core/include            C++20 interfaces used only inside the library
  core/src                reducer, JSON, SQLite, agent loop
  core/tests              store tests and agent-loop tests
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
| ABI            | 2     | This header. Version 2 adds the agent runtime.          |
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

Remote-agent states are specified in section 6 and are not exposed by ABI 2. Adding them is a protocol and schema change.

### Agent runtime

`larkx_runtime_open` opens the same SQLite file as the store API. The runtime does not steal a live owner unless `LARKX_RUNTIME_MAY_STEAL` is set. `larkx_runtime_close` does not release ownership, so reopening with the same owner id continues the epoch when `lease_ms` is 0.

An agent registration lives in process memory: name, version, instructions, model identity, tool schemas, effect classes, limits, and retry policy. The host registers it again after every open. The run stores the agent name as `workflow_name` and the agent version as `workflow_version`. The input is canonical JSON `{"message":"..."}` and the data policy is `device-only`.

`larkx_agent_start` persists that identity and moves the run to `RUNNING` before it returns. It does not call a model. Waiting for the final result is `larkx_run_drive` until the request kind is complete, failed, cancelled, or blocked, then `larkx_run_result`.

The host loop is:

1. `larkx_run_drive` returns one request.
2. The host performs that request, or waits until `wait_until_ms` when the kind is wait.
3. The host submits a model response, a tool output, or a reconcile resolution.
4. Repeat.

Request kinds are invoke model, invoke tool, reconcile, wait, complete, blocked, failed, cancelled, and paused. The detail buffer is the only place a prompt, a tool argument, or a tool result is returned to the host. Event payloads stay metadata. They do not contain the user message, the instructions, or the model text.

`request_id` is the attempt id. `operation_id` is deterministic from the run id and the step key, and a retry of that step reuses it. Event ids and attempt ids are also deterministic and unique across runs in one database. When `ev-{runId}-{n}` would exceed 200 characters, the run id is replaced by a 128-bit fingerprint. That fingerprint is stable. It is not a claim that a crafted collision is impossible.

Step keys are `model-{iteration}` and `tool-{iteration}-{index}`. Model steps are idempotent. A tool uses the effect class from its registration. An unknown tool is recorded as `pure` and is not handed to the host. Invalid arguments are recorded the same way, using the registered effect class, and the host handler is not called.

Limits use the TypeScript defaults when the field is 0: 8 iterations, 16 tool calls, 3 invalid tool requests, 12000 context characters, and a model retry of 2 attempts at 10 ms fixed. A negative interval selects the default interval. Zero is a real interval. Tool retries default to 3 attempts, 50 ms initial, 30000 ms maximum, exponential. Context length is the canonical JSON of the message array, which can differ in length from `JSON.stringify`.

Pause moves a running workflow to `WAITING` and resume moves it back. Pause is rejected while a host request is in flight. Cancel sets `cancel_requested`. If no step is running, the next drive returns cancelled. If a step is running, drive returns the same invocation with `cancel_requested` set, and the host submits error code `cancelled_execution`.

A duplicate or stale submit is `LARKX_ERR_STATE`. A submit whose owner epoch was stolen is `LARKX_ERR_OWNERSHIP`. A different agent version, or a different effect class on an already recorded step, is a state error and the run is not replayed on the new definition.

Crash windows, where a repeated external call cannot be prevented:

- The process dies after `larkx_run_drive` has begun an idempotent model or tool step and before the host submits a result. Recovery retries that step with the same operation id. The model may run again. The tool may run again. The core cannot tell whether the first call reached the provider.
- The process dies in that same window for a non-idempotent tool. Recovery marks `UNKNOWN_OUTCOME`, blocks the run, and returns a reconcile request. The tool is not invoked again until the host resolves reconcile as retry, complete, or fail.
- The process dies after the result is committed. Recovery replays the stored decision or tool result and does not return another invoke for that step.

This is not exactly-once execution of a model or a tool.

`examples/swift-agent` is a pure Swift host for this ABI. It does not use React Native or a JavaScript engine. `examples/swift-agent/run.sh` exits non-zero when `swiftc` is missing. The Linux tests compile and run the same ABI from C++. They are not an Apple run. The macOS CI job is the Swift compilation and the scripted recovery run. It is not an iOS device run.

## 3. TypeScript to native mapping

| TypeScript                                                  | Native core                                                                              | Later                                                |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `@larkxai/protocol` transitions, effects, event names       | `transitions.cpp` and `conformance/transitions.json`                                     | New remote states need protocol version 2.           |
| `reduceApply` in `@larkxai/core`                            | `reducer.cpp` for create, claim, begin, commit, resolve, mark unknown, reconcile, outbox | The agent loop calls these. It does not add tables.  |
| `prepareInterrupted`                                        | Drive classifies a `RUNNING` step this process did not issue                             | Same operation id on retry. Non-idempotent blocks.   |
| `workflow_runs`, `workflow_steps`, attempts, events, outbox | `sqlite_store.cpp`, schema version 1                                                     | Artifact bytes and a proven byte-identical database. |
| Node pid-file steal, mobile exclusive ownership             | `may_steal` and `LARKX_STORE_EXCLUSIVE_OWNERSHIP`                                        | Platform lifecycle still decides when to steal.      |
| `createAgent` / `defineTool`                                | `larkx_agent_register`, `larkx_agent_start`, `larkx_run_drive`                           | Production Swift and Kotlin SDKs are Phase 3.        |
| Model and Cactus adapters                                   | Host submits model JSON. The core does not link Cactus or another provider.              | Platform adapters live in the language bindings.     |
| `@larkxai/telemetry`                                        | Not implemented                                                                          | Phase 5, using the existing cursor and allowlist.    |
| Remote dispatch types                                       | Outbox insert and dedupe only                                                            | Phase 4 submission and recovery.                     |

The authoritative rows remain `workflow_runs` and `workflow_steps`. `workflow_events` is an append-only journal in the same transaction. Replay does not fold events back into state. Completed steps are not executed again. `pure` and `idempotent` retries keep the same operation id. `non-idempotent` interruption becomes `UNKNOWN_OUTCOME` and the run becomes `BLOCKED`. Reconciliation is explicit. Terminal workflow statuses have no exits. `FAILED` is not retried in place.

## 4. Conformance

`native/conformance/transitions.json` is the language-independent freeze:

- workflow and step transition tables
- sensitive event keys
- interrupt resolution
- egress matrix

`tests/native/conformance-fixtures.test.ts` fails if that file drifts from `@larkxai/protocol` or from schema version 1. `native/core/tests/core_tests.cpp` fails if the C ABI disagrees with the same file. `native/core/tests/agent_tests.cpp` drives the C ABI through the same situations as `tests/agent/loop.test.ts`: a multi-turn tool loop, unknown and invalid tools that never reach the host, a malformed model response, iteration and invalid-tool limits, retries that keep the operation id, pause and cancel, replay of a committed model decision, a non-idempotent interrupt followed by reconcile, a duplicate submit, a stolen owner, an agent version mismatch, an effect-class change, and a context limit that fails before a model call. The TypeScript suite remains the reference for the shipped engine. The native tests compare observable statuses, step keys, operation ids, and error text. They do not execute the TypeScript interpreter.

The C++ store tests also cover the recovery guarantees that can be stated without an agent loop:

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

1. Phase 1. Freeze the tables, land the C ABI, the reducer, SQLite schema 1, the host tests, and the fail-closed toolchain files. Done.
2. Still before a production binding. Vendor SQLite. Cross-compile on a machine with the Android NDK and on an Apple host for an iOS binary. Those builds are not done.
3. Phase 2. Runtime, Agent, Run, and Tool on the ABI. Replay skips committed model and tool steps. Recovery classifies interrupts. Operation ids and reconcile follow the TypeScript rules. A minimal Swift host is in `examples/swift-agent`. Production SDKs are not in this phase.
4. Phase 3. Swift, Kotlin, and React Native bindings, lifecycle hooks, and physical-device crash recovery. A simulator log is not that proof. The macOS CI job is not that proof.
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
- The native agent loop and the TypeScript agent loop are both in this repository. The TypeScript engine is still what applications run. The loops can drift where canonical JSON length or default retry timing differs from `JSON.stringify` and the TypeScript clock. Compare behavior with the agent ABI tests when either side changes.
- A model or idempotent tool can run more than once if the process dies after the attempt begins and before the result is committed. Do not describe that as exactly-once.
- ABI structs and functions must not share a typedef name. The header uses `*_spec` typedefs for that reason. A later edit that collapses those names will fail to compile as C.
- Cloud rejects sensitive keys recursively and then stores other payload extras. The SDK journal check is top-level, matching the TypeScript reducer. The allowlist tightening is a Cloud change, not a silent native change.
- No iOS or Android binary has been produced. Toolchain files that fail closed are not a cross-compile.
- Physical-device recovery is not claimed.
